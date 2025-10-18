export interface NectarOpportunityListParams {
    page?: number;
    displayLength?: number;
    dataInicio?: string; dataFim?: string;
    dataInicioAtualizacao?: string; dataFimAtualizacao?: string;
    status?: number;
    nome?: string;
}

export interface NectarOpportunityProduct {
    nome: string;
    quantidade: number;
    recorrencia: number;
    valor: number;
    valorTotal: number;
    desconto?: number;
    descontoPorcentual?: boolean;
    comissaoPorcentual?: boolean;
}

export interface NectarOpportunityCreate {
    nome: string;
    dataLimite?: string;
    pipeline?: string;
    etapa?: number;
    probabilidade?: number;
    status?: number;
    valorAvulso?: number;
    valorMensal?: number;
    observacao?: string;
    cliente: { id: number } | { nome: string };
    responsavel?: { id?: number; nome?: string };
    produtos?: NectarOpportunityProduct[];
    camposPersonalizados?: Record<string, string | number>;
}

export interface NectarOpportunity {
    id: number;
    nome: string;
    status: number;
    probabilidade: number;
    valorAvulso?: number;
}
