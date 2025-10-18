import { ENV, teamNameToUsersUUID, teamNameToConvNumber } from '../../../env';

export class BackendClient {
    constructor(private recipientId: string) { }

    private headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ENV.API_ACCESS_TOKEN}`,
        };
    }

    private async get<T>(path: string, qs?: Record<string, any>): Promise<T> {
        const url = new URL(`${ENV.BASE_URL}/backend/v1/${path}`);
        Object.entries(qs ?? {}).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });
        const res = await fetch(url, { headers: this.headers() });
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
        return res.json() as Promise<T>;
    }

    // 2.1 team/users -> UUID
    getTeamUsersByName(teamName: string) {
        const team_id = teamNameToUsersUUID(teamName); // UUID
        return this.get('team/users', { recipient_id: this.recipientId, team_id });
    }

    // 2.2 conversations -> numérico
    getConversationsByName(teamName: string, params?: { status?: string; assignee_type?: string }) {
        const team_id = teamNameToConvNumber(teamName); // number
        const { status = 'all', assignee_type = 'all' } = params ?? {};
        return this.get('conversations', {
            account_id: ENV.ACCOUNT_ID,
            team_id,
            status,
            assignee_type,
        });
    }

    // 2.3 messages
    getMessages(conversation_id: number, before?: string | number) {
        return this.get('messages', {
            account_id: ENV.ACCOUNT_ID,
            conversation_id,
            before,
        });
    }
}
