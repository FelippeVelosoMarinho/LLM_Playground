import { z } from 'zod';
import { createTool } from '@mastra/core';
import { BackendClient } from '../../services/chatwootClient';
import { ENV } from '../../../../env';

// helper para normalizar
const normalizeTeam = (s: unknown) =>
    typeof s === 'string' ? s.normalize('NFKC').trim().toUpperCase() : s;

const QueryConversationsInputSchema = z.object({
    teamName: z.preprocess(
        normalizeTeam,
        z.string().refine((val) => val in ENV.TEAM_NUMBERS, {
            message: `teamName não existe em ENV.TEAM_NUMBERS`,
        }),
    ),
    status: z.enum(['all', 'open', 'pending', 'resolved']).default('all'),
    assigneeType: z.enum(['all', 'mine', 'unassigned']).default('all'), // ajuste se usar outros
});


// 1) Enum dinâmico de nomes de time (como union de literais)
// const TeamNameSchema = z.union(
//     (Object.keys(ENV.TEAM_NUMBERS) as string[]).map(k => z.literal(k)) as [
//         z.ZodLiteral<string>,
//         ...z.ZodLiteral<string>[]
//     ]
// );

// // 2) Schema COMPLETO de input como ZodObject (não use extend em union)
// const QueryConversationsInputSchema = z.object({
//     teamName: TeamNameSchema,
//     status: z.string().default('all'),
//     assigneeType: z.string().default('all'),
// });

export const queryConversationsByTeamTool = createTool({
    id: 'query-conversations-by-team',
    description: '2.1 team/users (UUID) -> 2.2 conversations (ID numérico)',
    inputSchema: QueryConversationsInputSchema,
    outputSchema: z.any(),
    async execute({ context }) {
        const { teamName, status, assigneeType } = context;

        const client = new BackendClient(ENV.RECIPIENT_ID);

        await client.getTeamUsersByName(teamName);
        const data = await client.getConversationsByName(teamName, {
            status,
            assignee_type: assigneeType,
        });

        return data;
    },
});
