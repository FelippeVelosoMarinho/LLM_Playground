// import { z } from 'zod';
// import { createTool } from '@mastra/core';
// import { BackendClient } from '../../services/chatwootClient';
// import { ENV } from '../../../../env';

// export const listMessagesTool = createTool({
//     id: 'list-messages',
//     description: 'Lista mensagens de uma conversa; use "before" para paginação',
//     inputSchema: z.object({
//         recipientId: z.string(),
//         conversationId: z.number(),
//         before: z.union([z.string(), z.number()]).optional(),
//     }),
//     outputSchema: z.object({
//         meta: z.any(),
//         payload: z.array(z.object({
//             id: z.number(),
//             created_at: z.number(),
//             content: z.string().nullable(),
//             message_type: z.number(),
//             source_id: z.string().nullable().optional(),
//         })),
//     }),
//     async execute({ input }: any) {
//         const client = new BackendClient(input.recipientId);
//         return await client.getMessages({
//             account_id: ENV.ACCOUNT_ID,
//             conversation_id: input.conversationId,
//             before: input.before,
//         });
//     },
// });
