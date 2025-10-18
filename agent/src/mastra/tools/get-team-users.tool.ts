// import { z } from 'zod';
// import { createTool } from '@mastra/core';
// import { BackendClient } from '../../services/chatwootClient';

// export const getTeamUsersTool = createTool({
//   id: 'get-team-users',
//   description: 'Lista atendentes de um time',
//   inputSchema: z.object({
//     recipientId: z.string(),
//     teamId: z.string(),
//   }),
//   outputSchema: z.array(z.object({
//     attendant_id: z.string(),
//     user_id: z.string(),
//     email: z.string().nullable().or(z.string()),
//     name: z.string(),
//     updated_at: z.string(),
//   })),
//   async execute({ input }: any) {
//     const client = new BackendClient(input.recipientId);
//     return await client.getTeamUsers(input.teamId);
//   },
// });
