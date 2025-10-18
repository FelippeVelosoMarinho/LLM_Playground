declare namespace NodeJS {
    interface ProcessEnv {
        BASE_URL: string;
        API_ACCESS_TOKEN: string;
        ACCOUNT_ID: string;
        RECIPIENT_ID: string;

        TEAMS: string;

        // IDs numéricos (conversations)
        TEAM_IDS__COMERCIAL_SEMINOVOS: string;
        TEAM_IDS__COMERCIAL_LOGISTICA: string;
        TEAM_IDS__COMERCIAL_TRANSPORTE: string;
        TEAM_IDS__COMERCIAL_LOCACAO_DE_FROTA: string;

        // UUIDs (team/users)
        TEAM_UUIDS__COMERCIAL_SEMINOVOS: string;
        TEAM_UUIDS__COMERCIAL_LOGISTICA: string;
        TEAM_UUIDS__COMERCIAL_TRANSPORTE: string;
        TEAM_UUIDS__COMERCIAL_LOCACAO_DE_FROTA: string;

        OPENAI_API_KEY: string;

        NECTAR_API_TOKEN: string;
        NECTAR_BASE_URL: string;
        NECTAR_DEFAULT_PIPELINE: string;
        NECTAR_DEFAULT_ETAPA: string;
        NECTAR_DEFAULT_STATUS: string;

        LOG_LEVEL?: string;
    }
}
