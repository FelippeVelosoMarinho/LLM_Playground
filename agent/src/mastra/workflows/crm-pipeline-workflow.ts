import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { ENV } from '../../../../env';

import { nectarCreateTool } from '../tools/nectar-create.tool';
import { leadQualifierAgent } from '../agents/lead-qualifier-agent';

// NOVAS TOOLS (as únicas para consultas):
import { queryConversationsByTeamTool } from '../tools/query-conversations-by-team.tool';
import { queryMessagesTool } from '../tools/query-messages.tool';
import { invokeTool } from '../../utils/invokeTool';

/** -------------------------------
 *  SCHEMAS DO WORKFLOW (ZOD)
 *  ------------------------------- */
const WorkflowInputSchema = z.object({
    maxConversationsPerTeam: z.number().optional(),
    messagesPageSize: z.number().optional(),
});

const WorkflowOutputSchema = z.object({
    processed: z.number(),
    createdOpps: z.number(),
    errors: z.array(z.string()),
});

/** -----------------------------------------------------------
 *  Schema MÍNIMO de saída do agente (para tipar/validar resp)
 *  ----------------------------------------------------------- */
const LeadQualificationSchema = z.object({
    isQualified: z.boolean().optional(),
    score: z.number().optional(),
    motivo: z.string().optional(),
    oportunidade: z
        .object({
            nome: z.string(),
            probabilidade: z.number().optional(),
            valorAvulso: z.number().optional(),
            valorMensal: z.number().optional(),
            observacao: z.string().optional(),
            cliente: z
                .object({
                    id: z.number().optional(),
                    nome: z.string().optional(),
                    telefones: z.array(z.string()).optional(),
                })
                .optional(),
            produtos: z
                .array(
                    z.object({
                        nome: z.string(),
                        quantidade: z.number().optional(),
                        recorrencia: z.number().optional(),
                        valor: z.number().optional(),
                        valorTotal: z.number().optional(),
                    }),
                )
                .optional(),
        })
        .optional(),
});

/** -------------------------------------------
 *  STEP 1: Recebe input do workflow e carrega times
 *  ------------------------------------------- */
const loadTeams = createStep({
    id: 'load-teams',
    description: 'Recebe o input do workflow e retorna times + wfInput',
    inputSchema: WorkflowInputSchema,
    outputSchema: z.object({
        wf: WorkflowInputSchema,
        teams: z.array(z.string()),
    }),
    async execute({ inputData }) {
        const teams = ENV.TEAMS;
        return { wf: inputData, teams };
    },
});

/** -------------------------------------------------------------
 *  STEP 2: Buscar conversas por time usando queryConversationsByTeamTool
 *  (retorna um array FLAT de conversas + wf)
 *  ------------------------------------------------------------- */
const processTeams = createStep({
    id: 'process-teams',
    description: 'Para cada time: busca conversas (queryConversationsByTeamTool)',
    inputSchema: z.object({
        wf: WorkflowInputSchema,
        teams: z.array(z.string()),
    }),
    outputSchema: z.object({
        wf: WorkflowInputSchema,
        conversations: z.array(z.any()),
    }),
    async execute({ inputData }) {
        const { wf, teams } = inputData;
        const { maxConversationsPerTeam } = wf;
        const limit = maxConversationsPerTeam ?? 50;

        const results = await Promise.all(
            teams.map(async (teamName) => {
                const res = await invokeTool(queryConversationsByTeamTool, {
                    teamName,
                    status: 'all',
                    assigneeType: 'all',
                });

                // O tool pode devolver em formatos ligeiramente diferentes; normalizamos:
                const payload =
                    // formato { data: { payload: [...] } }
                    (res as any)?.data?.payload ??
                    // formato { payload: [...] }
                    (res as any)?.payload ??
                    // formato [...] direto
                    (Array.isArray(res) ? res : []);

                return (payload as any[]).slice(0, limit);
            }),
        );

        return { wf, conversations: results.flat() };
    },
});

/** ------------------------------------------------------------------
 *  STEP 3: Baixar mensagens via queryMessagesTool, qualificar e,
 *  se preciso, criar oportunidade no Nectar
 *  ------------------------------------------------------------------ */
const qualifyAndCreate = createStep({
    id: 'qualify-and-create',
    description: 'Qualifica conversas e cria oportunidades quando aplicável',
    inputSchema: z.object({
        wf: WorkflowInputSchema,
        conversations: z.array(z.any()),
    }),
    outputSchema: WorkflowOutputSchema,
    async execute({ inputData }) {
        const { wf, conversations } = inputData;
        const { messagesPageSize } = wf;
        const pageSize = messagesPageSize ?? 20;

        let processed = 0;
        let createdOpps = 0;
        const errors: string[] = [];

        await Promise.all(
            conversations.map(async (conversation: any) => {
                try {
                    // Mensagens da conversa (usa queryMessagesTool)
                    const msgsRes = await invokeTool(queryMessagesTool, {
                        conversationId: conversation.id,
                    });

                    const msgs = (msgsRes as any)?.payload ?? (Array.isArray(msgsRes) ? msgsRes : []);
                    const lastN = msgs
                        .sort((a: any, b: any) => a.created_at - b.created_at)
                        .slice(-pageSize);

                    const messagesText = lastN
                        .map((m: any) => `(${m.created_at}) ${m.content ?? ''}`)
                        .join('\n');

                    // Qualificação com o agente
                    const resp = await leadQualifierAgent.generate(
                        [
                            {
                                role: 'user',
                                content: `Histórico da conversa #${conversation.id}:\n${messagesText}`,
                            },
                        ],
                    );

                    const parsed = LeadQualificationSchema.safeParse(resp.object);
                    processed += 1;

                    if (parsed.success && parsed.data.isQualified && parsed.data.oportunidade) {
                        const opp = parsed.data.oportunidade;
                        await nectarCreateTool.execute({
                            input: {
                                nome: opp.nome,
                                probabilidade: opp.probabilidade,
                                valorAvulso: opp.valorAvulso,
                                valorMensal: opp.valorMensal,
                                observacao: opp.observacao,
                                clienteId: opp.cliente?.id,
                                clienteNome: opp.cliente?.nome,
                                produtos: opp.produtos,
                            },
                        });
                        createdOpps += 1;
                    }
                } catch (e: any) {
                    errors.push(
                        `Erro na conv ${conversation?.id ?? '??'}: ${e?.message ?? String(e)}`,
                    );
                }
            }),
        );

        return { processed, createdOpps, errors };
    },
});

/** ----------------------------------------------
 *  WORKFLOW
 *  ---------------------------------------------- */
export const crmPipelineWorkflow = createWorkflow({
    id: 'crm-pipeline',
    description:
        'Busca conversas por time, lê mensagens, qualifica e cria oportunidade no Nectar',
    inputSchema: WorkflowInputSchema,
    outputSchema: WorkflowOutputSchema,
})
    .then(loadTeams)       // -> { wf, teams }
    .then(processTeams)    // -> { wf, conversations }
    .then(qualifyAndCreate); // -> summary

crmPipelineWorkflow.commit();
