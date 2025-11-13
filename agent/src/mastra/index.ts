
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
  team_ids: z.string().optional(),
  team_id: z.coerce.number().optional(),
  status: z.string().default("all"),
  assignee_type: z.string().default("all"),
  before: z.coerce.number().optional(),
});

type AnyDict = Record<string, any>;
type Bucket = "SEM_CONTATO" | "CONTATO_FEITO" | "DESQUALIFICADO" | "COMPLETO";
type LeadCardWithBucket = ReturnType<typeof buildCard> & {
  bucket: Bucket;
};
export type MiddlewareHandler = (c: any, next: () => Promise<void>) => Promise<void | Response>;

const COMMERCIAL_TEAM_IDS = new Set<number>([10, 15, 14, 12]);

const TRACE = process.env.LEADQ_TRACE === "1";
const DEBUG = process.env.LEADQ_DEBUG === "1";

function logTrace(...args: any[]) {
  if (TRACE) console.log("[LeadQ:TRACE]", ...args);
}
function logDebug(...args: any[]) {
  if (DEBUG) console.log("[LeadQ:DEBUG]", ...args);
}

function isHumanMessage(m: AnyDict): boolean {
  const st = m?.sender_type;
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

type Decision = {
  bucket: Bucket;
  reasons: string[];
  flags: {
    hasHumanMsg: boolean;
    isResolved: boolean;
    isDesqualified: boolean;
    hasAnalysis: boolean;
    analysisSource: "agent_bot" | "llm_cache" | "none";
  };
};

function bucketDecision(conv: AnyDict): Decision {
  const reasons: string[] = [];
  const analysis = analysisFrom(conv);
  const firstReply = conv?.first_reply_created_at ?? 0;

  const hasHuman = (conv?.messages ?? []).some(isHumanMessage);
  const isResolved = conv?.status === "resolved";
  const desq = isDesqualified(conv);

  if (desq) reasons.push("match: desqualificado (label/custom_attributes/mensagem bot)");
  if (isResolved) reasons.push("status=resolved");
  if (!firstReply) reasons.push("first_reply_created_at ausente");
  if (hasHuman) reasons.push("há mensagens humanas na thread");
  if (analysis.analysis) reasons.push(`analysis presente (source=${analysis.source})`);

  let bucket: Bucket;
  if (desq) bucket = "DESQUALIFICADO";
  else if (isResolved) bucket = "COMPLETO";
  else if (!firstReply && !hasHuman) bucket = "SEM_CONTATO";
  else bucket = "CONTATO_FEITO";

  console.log("bucket: ", bucket, "| reasons:", reasons.join(" ; "));

  return {
    bucket,
    reasons,
    flags: {
      hasHumanMsg: hasHuman,
      isResolved,
      isDesqualified: desq,
      hasAnalysis: !!analysis.analysis,
      analysisSource: analysis.source,
    },
  };
}

// function bucketOf(conv: AnyDict): Bucket {
//   if (isDesqualified(conv)) return "DESQUALIFICADO";
//   if (conv?.status === "resolved") return "COMPLETO";

//   const firstReply = conv?.first_reply_created_at ?? 0;
//   if (!firstReply) {
//     const msgs: AnyDict[] = conv?.messages ?? [];
//     const hasHuman = msgs.some(isHumanMessage);
//     if (!hasHuman) return "SEM_CONTATO";
//   }
//   return "CONTATO_FEITO";
// }

const perTeamStats: Record<number, {
  total: number;
  buckets: Record<Bucket, number>;
  analysis: { any: number; bySource: Record<"agent_bot" | "llm_cache" | "none", number>; };
  desqualified: number;
  resolved: number;
}> = {};

function initTeamStats(teamId: number) {
  console.log();
  if (!perTeamStats[teamId]) {
    perTeamStats[teamId] = {
      total: 0,
      buckets: { SEM_CONTATO: 0, CONTATO_FEITO: 0, DESQUALIFICADO: 0, COMPLETO: 0 },
      analysis: { any: 0, bySource: { agent_bot: 0, llm_cache: 0, none: 0 } },
      desqualified: 0,
      resolved: 0,
    };
  }
}

const safeJson = (txt: string) => { try { return JSON.parse(txt); } catch { return { raw: txt }; } };

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
    team_name: meta?.team?.name ?? null,
    status: conv?.status ?? "unknown",
    unread_count: conv?.unread_count ?? 0,
    last_activity_at: conv?.last_activity_at ?? 0,
    preview: prev,
    analysis,
    analysis_source: source,
  };
}

const withCors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin') ?? '*';

  if (c.req.method === 'OPTIONS') {
    // pré-flight
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, api_access_token, Accept, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    });
  }

  // resposta normal
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Vary', 'Origin');
  c.header('Access-Control-Allow-Credentials', 'true');
  await next();
};

export const mastra = new Mastra({
  workflows: { weatherWorkflow, crmPipelineWorkflow },
  agents: { weatherAgent, leadQualifierAgent },
  storage: new LibSQLStore({ url: ":memory:" }),
  logger: new PinoLogger({ name: 'Mastra', level: 'info' }),
  telemetry: { enabled: false },
  observability: { default: { enabled: true } },
  server: {
    apiRoutes: [
      registerApiRoute("/lead-qualification", {
        method: "GET",
        middleware: [
          withCors,
          async (c, next) => {
            console.log(`[LeadQ] ${c.req.method} ${c.req.url}`);
            await next();
          },
          async (c, next) => {
            const token = c.req.header("api_access_token");
            if (!token) {
              c.status(422 as any);
              return c.json({
                detail: [{ loc: ["header", "api_access_token"], msg: "field required", type: "value_error.missing" }],
              });
            }
            await next();
          },
        ],
        handler: async (c) => {
          try {
            // valida query
            const noFilters = new URL(c.req.url).searchParams.get("no_filters") === "1";
            const parsed = LeadQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
            if (!parsed.success) {
              c.status(422 as any);
              return c.json({ detail: parsed.error.issues });
            }
            const { account_id, status, assignee_type, before } = parsed.data;

            // normaliza teamIds + trava Comercial
            let teamIds: number[] = [];
            if (parsed.data.team_ids) {
              teamIds = parsed.data.team_ids
                .split(",")
                .map(s => Number(s.trim()))
                .filter(n => Number.isFinite(n));
            } else if (parsed.data.team_id != null) {
              teamIds = [parsed.data.team_id];
            } else {
              teamIds = Array.from(COMMERCIAL_TEAM_IDS);
            }
            teamIds = teamIds.filter(id => COMMERCIAL_TEAM_IDS.has(id));
            if (!teamIds.length) {
              c.status(422 as any);
              return c.json({
                detail: [{ loc: ["query", "team_ids"], msg: "Nenhum team_id válido de Comercial (10,12,14,15).", type: "value_error" }],
              });
            }

            const BASE_URL = process.env.BASE_URL;
            if (!BASE_URL) {
              c.status(500 as any);
              return c.json({ error: "config_error", message: "BASE_URL não definido no servidor Mastra" });
            }
            const token = c.req.header("api_access_token")!;

            // fan-out
            const baseQs = new URLSearchParams();
            baseQs.set("account_id", String(account_id));
            // if (status !== "all") {
            //   baseQs.set("status", status);
            // }
            if (!noFilters) {
              baseQs.set("assignee_type", assignee_type);
            }
            if (before !== undefined) baseQs.set("before", String(before));
            baseQs.set("status", "all");

            const requests = teamIds.map(async (tid) => {
              const u = new URL(`${BASE_URL}/backend/v1/conversations/`);
              const qs = new URLSearchParams(baseQs.toString());
              qs.set("team_id", String(tid));
              u.search = qs.toString();

              console.log(`[LeadQ:DEBUG:request] team_id: ${tid}, url: ${u.toString()}`);

              const res = await fetch(u, {
                headers: {
                  "Content-Type": "application/json",
                  "api_access_token": token,
                  "Accept": "application/json",
                },
              });
              console.log("resposta da request: ", res);
              console.log("[LeadQ:DEBUG] teamIds efetivos:", teamIds);
              const rawText = await res.text();
              if (process.env.LEADQ_DEBUG === "1") {
                console.log("[LeadQ:DEBUG:upstream]", {
                  team_id: tid,
                  url: u.toString(),
                  status: res.status,
                  // Mostra só os primeiros 1200 chars para não poluir
                  body_head: rawText.slice(0, 1200),
                });
              }
              if (!res.ok) {
                console.error("[LeadQ:DEBUG:upstream_error_body] team_id", tid, "body:", rawText);
                return { ok: false, status: res.status, body: safeJson(rawText), team_id: tid };
              }
              const parsed = safeJson(rawText);
              return { ok: true, data: parsed, team_id: tid };
            });

            const results = await Promise.all(requests);

            const DEBUG = process.env.LEADQ_DEBUG === "1";

            const allClassifiedLeads: LeadCardWithBucket[] = [];

            const debugInfo: any[] = [];

            // const buckets: Record<Bucket, any[]> = {
            //   SEM_CONTATO: [],
            //   CONTATO_FEITO: [],
            //   DESQUALIFICADO: [],
            //   COMPLETO: [],
            // };

            for (const r of results) {
              if (!r.ok) {
                console.error("[LeadQ] upstream_error team", r.team_id, r.status, r.body);
                if (DEBUG) debugInfo.push({ team_id: r.team_id, ok: false, status: r.status, body: r.body });
                continue;
              }

              const raw = r.data;
              let items: AnyDict[] = [];
              let dataPath: string = "unknown_path"; // Variável para rastrear o caminho

              if (raw?.data?.payload && Array.isArray(raw.data.payload)) {
                items = raw.data.payload;
                dataPath = "raw.data.payload";
              }
              else if (raw?.payload && Array.isArray(raw.payload)) {
                items = raw.payload;
                dataPath = "raw.payload";
              }
              else if (raw?.results && Array.isArray(raw.results)) {
                items = raw.results;
                dataPath = "raw.results";
              }
              else if (raw?.data?.items && Array.isArray(raw.data.items)) {
                items = raw.data.items;
                dataPath = "raw.data.items";
              } else if (raw?.items && Array.isArray(raw.items)) {
                items = raw.items;
                dataPath = "raw.items";
              } else if (raw?.data?.results && Array.isArray(raw.data.results)) {
                items = raw.data.results;
                dataPath = "raw.data.results";
              }

              console.log(`[LeadQ:DEBUG:extraction] team_id: ${r.team_id}, items_extracted: ${items.length}, path: ${dataPath}`);

              // [NOVO LOG CHAVE] Se items_extracted for 0, logamos o RAW data (parcial)
              if (items.length === 0 && DEBUG) {
                // Loga as chaves de alto nível e as chaves de 'data', para identificação
                console.log(`[LeadQ:DEBUG:RAW_KEYS] team_id: ${r.team_id}, raw_keys: ${Object.keys(raw ?? {})}, data_keys: ${Object.keys(raw?.data ?? {})}`);
              }
              console.log(`[LeadQ:DEBUG:extraction] team_id: ${r.team_id}, items_extracted: ${items.length}, total_items_extracted_so_far: ${allClassifiedLeads.length + items.length}`);
              console.log(`[LeadQ: DATA:extraction] ${raw.data.payload} ? "data.payload" :${raw.payload} ? "payload" : ${raw.results} ? "results" : raw.data?.items ? "data.items" : "unknown_path"`);
              if (DEBUG) {
                console.log("Response sample keys:", r.ok ? Object.keys(r.data ?? {}) : Object.keys(r.body ?? {}));
              }

              initTeamStats(r.team_id);
              const stats = perTeamStats[r.team_id];

              logDebug("time", r.team_id, "itens", items.length);

              for (const conv of items) {
                const decision = bucketDecision(conv);
                const card = buildCard(conv);
                card.team_id = card.team_id ?? r.team_id ?? null;

                // métricas
                stats.total += 1;
                stats.buckets[decision.bucket] += 1;
                if (decision.flags.hasAnalysis) {
                  stats.analysis.any += 1;
                  stats.analysis.bySource[decision.flags.analysisSource] += 1;
                }
                if (decision.flags.isDesqualified) stats.desqualified += 1;
                if (decision.flags.isResolved) stats.resolved += 1;

                // trace por conversa (opcional, só quando LEADQ_TRACE=1)
                logTrace("conv", card.conversation_id, "uuid", card.uuid, "=>", decision.bucket, "|", decision.reasons.join(" ; "));

                //buckets[decision.bucket].push(card);
                allClassifiedLeads.push({
                  ...card,
                  bucket: decision.bucket,
                });
              }

              // resumo do time
              logDebug("resumo time", r.team_id, {
                total: stats.total,
                buckets: stats.buckets,
                analysis_any: stats.analysis.any,
                analysis_bySource: stats.analysis.bySource,
                desqualified: stats.desqualified,
                resolved: stats.resolved,
              });

              if (DEBUG) {
                debugInfo.push({
                  team_id: r.team_id,
                  ok: true,
                  count: items.length,
                  buckets: stats.buckets,
                  analysis_any: stats.analysis.any,
                  analysis_bySource: stats.analysis.bySource,
                  desqualified: stats.desqualified,
                  resolved: stats.resolved,
                  sample: items[0] ? Object.keys(items[0]).slice(0, 10) : [],
                });
              }
            }

            // ordena por recência
            // (Object.keys(buckets) as Bucket[]).forEach((k) =>
            //   buckets[k].sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))
            // );
            allClassifiedLeads.sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0));

            const responseBody: any = {
              meta: { account_id, team_ids: teamIds },
              items: allClassifiedLeads,
            };

            if (DEBUG) responseBody.debug = debugInfo;

            return c.json(responseBody);
          } catch (err: any) {
            console.error("[LeadQ] handler error:", err);
            c.status(500 as any);
            return c.json({ error: "internal_error", message: err?.message ?? String(err) });
          }
        },
      }),
    ],
  },
});
