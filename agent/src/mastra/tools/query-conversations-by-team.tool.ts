import { z } from 'zod';
import { createTool } from '@mastra/core';
import { BackendClient } from '../../services/chatwootClient';
import { ENV } from '../../../../env';

// 1) Enum dinâmico de nomes de time (como union de literais)
const TeamNameSchema = z.union(
    (Object.keys(ENV.TEAM_NUMBERS) as string[]).map(k => z.literal(k)) as [
        z.ZodLiteral<string>,
        ...z.ZodLiteral<string>[]
    ]
);

// 2) Schema COMPLETO de input como ZodObject (não use extend em union)
const QueryConversationsInputSchema = z.object({
    teamName: TeamNameSchema,
    status: z.string().default('all'),
    assigneeType: z.string().default('all'),
});

export const queryConversationsByTeamTool = createTool({
    id: 'query-conversations-by-team',
    description: '2.1 team/users (UUID) -> 2.2 conversations (ID numérico)',
    inputSchema: QueryConversationsInputSchema, // <-- use o objeto completo
    outputSchema: z.any(),
    async execute(ctx) {

        // 3) Validação com o objeto completo
        const { teamName, status, assigneeType } = QueryConversationsInputSchema.parse(
            (ctx as any).inputData,
        );

        const client = new BackendClient(ENV.RECIPIENT_ID);

        // 2.1 - precisa do UUID (o BackendClient já usa TEAM_UUIDS)
        await client.getTeamUsersByName(teamName);

        // 2.2 - precisa do ID numérico (BackendClient já usa TEAM_NUMBERS)
        const data = await client.getConversationsByName(teamName, {
            status,
            assignee_type: assigneeType,
        });

        return data;
    },
});
