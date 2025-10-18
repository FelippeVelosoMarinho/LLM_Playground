// import { z } from 'zod';
// import { createTool } from '@mastra/core';
// import { BackendClient } from '../../services/chatwootClient';
// import { ENV } from '../../../../env';

// export const listConversationsTool = createTool({
//   id: 'list-conversations',
//   description: 'Lista conversas por time com status/assignee_type',
//   inputSchema: z.object({
//     recipientId: z.string(),
//     teamId: z.union([z.string(), z.number()]),
//     status: z.string().default('all'),
//     assigneeType: z.string().default('all'),
//   }),
//   outputSchema: z.object({
//     data: z.object({
//       meta: z.object({
//         mine_count: z.number(),
//         assigned_count: z.number(),
//         unassigned_count: z.number(),
//         all_count: z.number(),
//       }),
//       payload: z.array(z.any()), // pode refinar com schema de Conversation
//     }),
//   }),
//   async execute({ input }: any) {
//     const client = new BackendClient(input.recipientId);
//     return await client.getConversations({
//       account_id: ENV.ACCOUNT_ID,
//       team_id: input.teamId,
//       status: input.status,
//       assignee_type: input.assigneeType,
//     });
//   },
// });
