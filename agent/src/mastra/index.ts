
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { registerApiRoute } from "@mastra/core/server";
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { leadQualifierAgent } from './agents/lead-qualifier-agent';
import { crmPipelineWorkflow } from './workflows/crm-pipeline-workflow';

import { z } from "zod";

const LeadQuery = z.object({
  account_id: z.coerce.number(),
  team_id: z.coerce.number(),
  status: z.string().default("all"),
  assignee_type: z.string().default("all"),
  before: z.coerce.number().optional(),
});

// --- Helpers de classificação/normalização -------------------------------

type AnyDict = Record<string, any>;
type Bucket = "SEM_CONTATO" | "CONTATO_FEITO" | "DESQUALIFICADO" | "COMPLETO";

function isHumanMessage(m: AnyDict): boolean {
  const st = m?.sender_type;
  // message_type 0/1 normalmente são texto do contato/atendente
  return st === "Contact" || st === "Agent" || (!st && [0, 1].includes(m?.message_type));
}

function previewFrom(conv: AnyDict) {
  const pick = (m: AnyDict | undefined) => {
    if (!m) return { text: null, author: null, created_at: null as number | null };
    let author: string | null = null;
    if (m.sender_type === "Contact") author = "contact";
    else if (m.sender_type === "Agent") author = "agent";
    else if (m.sender_type === "AgentBot") author = "bot";
    return {
      text: m.processed_message_content ?? m.content ?? null,
      author,
      created_at: (m.created_at as number) ?? null,
    };
  };

  const lnam = conv?.last_non_activity_message;
  if (lnam) return pick(lnam);

  const arr = conv?.messages ?? [];
  return pick(arr[arr.length - 1]);
}

function analysisFrom(conv: AnyDict): { analysis: string | null; source: "agent_bot" | "llm_cache" | "none" } {
  const ca = conv?.custom_attributes ?? {};
  if (typeof ca.analysis === "string" && ca.analysis.trim()) {
    return { analysis: ca.analysis.trim(), source: "llm_cache" };
  }
  const arr = conv?.messages ?? [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (m?.sender_type === "AgentBot") {
      const text = (m.processed_message_content ?? m.content ?? "").trim();
      if (text) return { analysis: text, source: "agent_bot" };
    }
  }
  return { analysis: null, source: "none" };
}

function isDesqualified(conv: AnyDict): boolean {
  const labels: string[] = conv?.labels ?? [];
  const ca = conv?.custom_attributes ?? {};
  if (labels.includes("lead_desqualificado")) return true;
  if (String(ca.qualificacao ?? "").toLowerCase() === "desqualificado") return true;

  const lnam = conv?.last_non_activity_message ?? {};
  const txt = String(lnam.processed_message_content ?? lnam.content ?? "").toLowerCase();
  if (lnam?.sender_type === "AgentBot" && txt.includes("lead desqualificado")) return true;

  return false;
}

function bucketOf(conv: AnyDict): Bucket {
  if (isDesqualified(conv)) return "DESQUALIFICADO";
  if (conv?.status === "resolved") return "COMPLETO";

  const firstReply = conv?.first_reply_created_at ?? 0;
  if (!firstReply) {
    const msgs: AnyDict[] = conv?.messages ?? [];
    const hasHuman = msgs.some(isHumanMessage);
    if (!hasHuman) return "SEM_CONTATO";
  }
  return "CONTATO_FEITO";
}

function buildCard(conv: AnyDict) {
  const meta = conv?.meta ?? {};
  const sender = meta?.sender ?? {};
  const assignee = meta?.assignee ?? {};
  const { analysis, source } = analysisFrom(conv);
  const prev = previewFrom(conv);

  // telefone: prioriza metadados do sender, usa contact_inbox.source_id como fallback
  const phone =
    sender?.phone_number ??
    conv?.last_non_activity_message?.conversation?.contact_inbox?.source_id ??
    null;

  return {
    conversation_id: conv.id,
    uuid: conv.uuid,
    contact_name: sender?.name ?? null,
    contact_phone: phone,
    assignee_name: assignee?.available_name ?? assignee?.name ?? null,
    team_id: meta?.team?.id ?? null,
    status: conv?.status ?? "unknown",
    unread_count: conv?.unread_count ?? 0,
    last_activity_at: conv?.last_activity_at ?? 0,
    preview: prev,
    analysis,
    analysis_source: source,
  };
}

export const mastra = new Mastra({
  workflows: { weatherWorkflow, crmPipelineWorkflow },
  agents: { weatherAgent, leadQualifierAgent },
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false,
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true },
  },
  server: {
    apiRoutes: [
      registerApiRoute("/lead-qualification", {
        method: "GET",
        middleware: [
          async (c, next) => {
            console.log(`[LeadQ] ${c.req.method} ${c.req.url}`);
            await next();
          },
          async (c, next) => {
            const token = c.req.header("api_access_token");
            if (!token) {
              const detail = [
                { loc: ["header", "api_access_token"], msg: "field required", type: "value_error.missing" },
              ];
              c.status(422);
              return c.json({ detail });
            }
            await next(); // não usa c.set/get — apenas valida
          },
        ],
        handler: async (c) => {
          try {
            // valida query
            const parsed = LeadQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
            if (!parsed.success) {
              c.status(422);
              return c.json({ detail: parsed.error.issues });
            }
            const { account_id, team_id, status, assignee_type, before } = parsed.data;

            const BASE_URL = process.env.BASE_URL;
            if (!BASE_URL) {
              c.status(500);
              return c.json({ error: "config_error", message: "BASE_URL não definido no servidor Mastra" });
            }

            const token = c.req.header("api_access_token")!; // já validado no middleware

            // monta URL upstream
            const u = new URL(`${BASE_URL}/backend/v1/conversations`);
            u.searchParams.set("account_id", String(account_id));
            u.searchParams.set("team_id", String(team_id));
            u.searchParams.set("status", status);
            u.searchParams.set("assignee_type", assignee_type);
            if (before !== undefined) u.searchParams.set("before", String(before));

            const res = await fetch(u, {
              headers: {
                "Content-Type": "application/json",
                // seu backend exige este header:
                "api_access_token": token,
              },
            });

            const text = await res.text();
            if (!res.ok) {
              console.error("[LeadQ] conversations error:", res.status, text);
              c.status(res.status as any);
              return c.json({ error: "upstream_error", status: res.status, body: safeJson(text) });
            }

            const conversationsPayload = safeJson(text);
            const items: any[] = conversationsPayload?.data?.payload ?? [];
            const meta: any = conversationsPayload?.data?.meta ?? {};

            const buckets: Record<"SEM_CONTATO" | "CONTATO_FEITO" | "DESQUALIFICADO" | "COMPLETO", any[]> = {
              SEM_CONTATO: [],
              CONTATO_FEITO: [],
              DESQUALIFICADO: [],
              COMPLETO: [],
            };

            for (const conv of items) {
              const b = bucketOf(conv);
              buckets[b].push(buildCard(conv));
            }
            (Object.keys(buckets) as (keyof typeof buckets)[]).forEach((k) =>
              buckets[k].sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))
            );

            return c.json({
              meta,
              groups: (Object.keys(buckets) as (keyof typeof buckets)[]).map((k) => ({
                bucket: k,
                items: buckets[k],
              })),
            });
          } catch (err: any) {
            console.error("[LeadQ] handler error:", err);
            c.status(500);
            return c.json({ error: "internal_error", message: err?.message ?? String(err) });
          }
        },
      }),
    ],
  },
});

function safeJson(txt: string) {
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}