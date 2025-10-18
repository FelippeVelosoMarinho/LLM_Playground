import 'dotenv/config';

function required(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

export const ENV = {
    BASE_URL: required('BASE_URL'),
    API_ACCESS_TOKEN: required('API_ACCESS_TOKEN'),

    ACCOUNT_ID: Number(required('ACCOUNT_ID')),
    RECIPIENT_ID: required('RECIPIENT_ID'),

    TEAMS: (process.env.TEAMS ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),

    // ⚠️ DOIS MAPAS: UUID (team/users) e NUMÉRICO (conversations)
    TEAM_UUIDS: {
        COMERCIAL_SEMINOVOS: required('TEAM_UUIDS__COMERCIAL_SEMINOVOS'),
        COMERCIAL_LOGISTICA: required('TEAM_UUIDS__COMERCIAL_LOGISTICA'),
        COMERCIAL_TRANSPORTE: required('TEAM_UUIDS__COMERCIAL_TRANSPORTE'),
        COMERCIAL_LOCACAO_DE_FROTA: required('TEAM_UUIDS__COMERCIAL_LOCACAO_DE_FROTA'),
    } as const,

    TEAM_NUMBERS: {
        COMERCIAL_SEMINOVOS: Number(required('TEAM_IDS__COMERCIAL_SEMINOVOS')),
        COMERCIAL_LOGISTICA: Number(required('TEAM_IDS__COMERCIAL_LOGISTICA')),
        COMERCIAL_TRANSPORTE: Number(required('TEAM_IDS__COMERCIAL_TRANSPORTE')),
        COMERCIAL_LOCACAO_DE_FROTA: Number(required('TEAM_IDS__COMERCIAL_LOCACAO_DE_FROTA')),
    } as const,

    NECTAR: {
        API_TOKEN: required('NECTAR_API_TOKEN'),
        BASE_URL: required('NECTAR_BASE_URL'),
        DEFAULT_PIPELINE: required('NECTAR_DEFAULT_PIPELINE'),
        DEFAULT_ETAPA: Number(required('NECTAR_DEFAULT_ETAPA')),
        DEFAULT_STATUS: Number(required('NECTAR_DEFAULT_STATUS')),
    },
} as const;

export type TeamName = keyof typeof ENV.TEAM_NUMBERS;

export function teamNameToUsersUUID(name: string): string {
    const id = (ENV.TEAM_UUIDS as Record<string, string>)[name];
    if (!id) throw new Error(`TEAM_UUIDS sem mapeamento para: ${name}`);
    return id;
}

export function teamNameToConvNumber(name: string): number {
    const id = (ENV.TEAM_NUMBERS as Record<string, number>)[name];
    if (!id && id !== 0) throw new Error(`TEAM_NUMBERS sem mapeamento para: ${name}`);
    return id;
}
