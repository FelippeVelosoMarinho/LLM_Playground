import { z } from 'zod';
import { createTool } from '@mastra/core';
import { BackendClient } from '../../services/chatwootClient';
import { ENV } from '../../../../env';

const QueryMessagesInputSchema = z.object({
  conversationId: z.number(),
  before: z.union([z.string(), z.number()]).optional(),
});

export const queryMessagesTool = createTool({
  id: 'query-messages',
  description: '2.3 messages (pagina via "before" opcional)',
  inputSchema: QueryMessagesInputSchema,
  outputSchema: z.any(),
  async execute({ context }) {
    const { conversationId, before } = context;

    const client = new BackendClient(ENV.RECIPIENT_ID);
    return client.getMessages(conversationId, before);
  },
});
