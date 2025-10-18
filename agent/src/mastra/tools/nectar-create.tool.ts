import { z } from 'zod';
import { createTool } from '@mastra/core';
import { NectarClient } from '../../services/nectarClient';

export const nectarCreateTool = createTool({
  id: 'nectar-create-opp',
  description: 'Cria uma oportunidade no Nectar',
  inputSchema: z.object({
    nome: z.string(),
    clienteId: z.number().optional(),
    clienteNome: z.string().optional(),
    dataLimite: z.string().optional(),
    etapa: z.number().optional(),
    probabilidade: z.number().optional(),
    status: z.number().optional(),
    valorAvulso: z.number().optional(),
    valorMensal: z.number().optional(),
    observacao: z.string().optional(),
    produtos: z.array(z.object({
      nome: z.string(),
      quantidade: z.number(),
      recorrencia: z.number(),
      valor: z.number(),
      valorTotal: z.number(),
      desconto: z.number().optional(),
      descontoPorcentual: z.boolean().optional(),
      comissaoPorcentual: z.boolean().optional(),
    })).optional(),
    //camposPersonalizados: z.record(z.union([z.string(), z.number()])).optional(),
    responsavelId: z.number().optional(),
    responsavelNome: z.string().optional(),
  }),
  outputSchema: z.any(),
  async execute({ input }: any) {
    const client = new NectarClient();
    const payload = {
      nome: input.nome,
      dataLimite: input.dataLimite,
      etapa: input.etapa,
      probabilidade: input.probabilidade,
      status: input.status,
      valorAvulso: input.valorAvulso,
      valorMensal: input.valorMensal,
      observacao: input.observacao,
      cliente: input.clienteId ? { id: input.clienteId } : { nome: input.clienteNome ?? 'Novo Cliente' },
      responsavel: (input.responsavelId || input.responsavelNome) ? { id: input.responsavelId, nome: input.responsavelNome } : undefined,
      produtos: input.produtos,
      camposPersonalizados: input.camposPersonalizados,
    };
    return client.createOpportunity(payload as any);
  },
});