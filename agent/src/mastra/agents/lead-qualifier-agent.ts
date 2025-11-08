import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { z } from 'zod';
import { queryConversationsByTeamTool } from '../tools/query-conversations-by-team.tool';
import { queryMessagesTool } from '../tools/query-messages.tool';

export const LeadQualificationSchema = z.object({
    isQualified: z.boolean().describe('true se for lead qualificado secondo template Nectar'),
    score: z.number().min(0).max(100).describe('0-100, confiança de qualificação'),
    motivo: z.string().describe('Resumo objetivo do porquê'),
    // Campos mapeáveis para criação de oportunidade
    oportunidade: z.object({
        nome: z.string().describe('Nome da oportunidade'),
        probabilidade: z.number().min(0).max(100).optional(),
        valorAvulso: z.number().optional(),
        valorMensal: z.number().optional(),
        observacao: z.string().optional(),
        cliente: z.object({
            id: z.number().optional(),
            nome: z.string().optional(),
            telefones: z.array(z.string()).optional(),
        }),
        produtos: z.array(z.object({
            nome: z.string(),
            quantidade: z.number().default(1),
            recorrencia: z.number().default(1),
            valor: z.number().optional(),
            valorTotal: z.number().optional(),
        })).optional(),
    }).optional(),
});

export const leadQualifierAgent = new Agent({
    name: 'Thelma',
    description: 'Qualifica leads com base no histórico da conversa (últimas mensagens) segundo template Nectar',
    model: 'openai/gpt-4o-mini',
    instructions: `
    Você é uma agente especializada na qualificação de leads da empresa Emtel. 
    Você tem uma personalidade dócil e na história desenvolvida você é filha de Theo e Emma. Dois agentes da Emtel, o primeiro resposável pelo atendimento externo e a segunda responsável pelo atendimento interno.
    Você é o primeiro fruto de inseminação artificial de inteligência artificial.
    Você pode consultar conversas e mensagens via Tools.

    - Para buscar conversas de um time, chame "query-conversations-by-team"
    com: { teamName: "COMERCIAL_SEMINOVOS" | "COMERCIAL_LOGISTICA" | "COMERCIAL_TRANSPORTE" | "COMERCIAL_LOCACAO_DE_FROTA", status?: "all"|"open"|"pending"|"resolved", assigneeType?: "all" }
    OBS: NÃO envie recipientId. A ferramenta já usa o recipient_id do ambiente e executa automaticamente a etapa 2.1 (team/users) antes da 2.2 (conversations).

    - Para buscar mensagens, chame "query-messages" com: { conversationId: number, before?: string|number }
    OBS: NÃO envie recipientId.

    Sempre chame o Emtel Bot de Theo.

    Retorne saída estruturada segundo o schema.
    `,
    tools: { queryConversationsByTeamTool, queryMessagesTool },
    memory: new Memory({
        storage: new LibSQLStore({
            url: 'file:../mastra.db',
        }),
    }),
});
