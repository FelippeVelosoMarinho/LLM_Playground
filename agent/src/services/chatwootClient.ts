import { ENV, teamNameToUsersUUID, teamNameToConvNumber } from '../../../env';

export class BackendClient {
    constructor(private recipientId: string) { }

    private headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ENV.API_ACCESS_TOKEN}`,
            'api_access_token': ENV.API_ACCESS_TOKEN,
        };
    }

    private async get<T>(path: string, qs?: Record<string, any>): Promise<T> {
        const url = new URL(`${ENV.BASE_URL}/backend/v1/${path}`);
        Object.entries(qs ?? {}).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });

        const fullUrl = url.toString();
        console.log(`[BackendClient] → GET ${fullUrl}`);

        const res = await fetch(fullUrl, { headers: this.headers() });

        // Se a resposta NÃO estiver ok (status 4xx ou 5xx)
        if (!res.ok) {
            let errorBody: any = null;
            try {
                // tenta ler o corpo detalhado (geralmente em JSON)
                errorBody = await res.json();
            } catch {
                // fallback para texto bruto
                errorBody = await res.text().catch(() => '(no body)');
            }

            console.error(
                `[BackendClient] ❌ Request failed\n` +
                `→ URL: ${fullUrl}\n` +
                `→ Status: ${res.status} ${res.statusText}\n` +
                `→ Body: ${typeof errorBody === 'object'
                    ? JSON.stringify(errorBody, null, 2)
                    : errorBody}`
            );

            // lança erro com contexto
            throw new Error(`GET ${fullUrl} -> ${res.status} ${res.statusText}`);
        }

        // tenta parsear a resposta JSON normalmente
        try {
            const json = await res.json();
            console.log(`[BackendClient] ✅ Success → ${path}`, {
                status: res.status,
                sample: Array.isArray(json)
                    ? `Array(${json.length})`
                    : Object.keys(json).slice(0, 5),
            });
            return json as T;
        } catch (err) {
            console.error(`[BackendClient] ⚠️ JSON parse error in ${fullUrl}`, err);
            throw err;
        }
    }

    // 2.1 team/users -> UUID
    getTeamUsersByName(teamName: string) {
        const team_id = teamNameToUsersUUID(teamName); // UUID
        console.log("AAAAAAAA", this.recipientId, team_id);
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
