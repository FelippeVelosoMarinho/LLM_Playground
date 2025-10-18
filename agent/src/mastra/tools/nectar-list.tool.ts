import { z } from 'zod';
import { createTool } from '@mastra/core';
import { NectarClient } from '../../services/nectarClient';

export const nectarListTool = createTool({
  id: 'nectar-list-opps',
  description: 'Lista oportunidades (filtros opcionais)',
  inputSchema: z.object({
    page: z.number().optional(),
    displayLength: z.number().optional(),
    status: z.number().optional(),
    nome: z.string().optional(),
  }),
  outputSchema: z.array(z.any()),
  async execute({ input }: any) {
    const client = new NectarClient();
    return client.listOpportunities(input);
  },
});
