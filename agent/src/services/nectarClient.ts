import { ENV } from '../../../env';
import type {
    NectarOpportunityCreate, NectarOpportunityListParams, NectarOpportunity,
} from '../types/nectar';

const BASE = `https://app.nectarcrm.com.br/crm/api/1`;

export class NectarClient {
    private get headers() {
        return {
            'Content-Type': 'application/json',
        };
    }

    private withToken(url: string) {
        const u = new URL(url);
        u.searchParams.set('api_token', ENV.NECTAR.API_TOKEN);
        return u.toString();
    }

    async listOpportunities(params: NectarOpportunityListParams = {}) {
        const url = this.withToken(`${BASE}/oportunidades/`);
        const u = new URL(url);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
        });
        const res = await fetch(u, { headers: this.headers });
        if (!res.ok) throw new Error(`NECTAR LIST ${u} -> ${res.status}`);
        return res.json() as Promise<NectarOpportunity[]>;
    }

    async createOpportunity(payload: NectarOpportunityCreate) {
        const url = this.withToken(`${BASE}/oportunidades/`);
        const res = await fetch(url, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`NECTAR CREATE ${url} -> ${res.status} ${text}`);
        }
        return res.json() as Promise<NectarOpportunity>;
    }
}
