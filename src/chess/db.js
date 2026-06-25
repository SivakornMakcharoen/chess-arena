import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { Security } from './security.js';

// ============================================================
// SUPABASE API WRAPPER
// ============================================================
export const DB = {
    async request(path, method = 'GET', body = null) {
        if (!Security.rateLimit('db_req', 30)) throw new Error('Rate limited');
        const opts = {
            method,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': method === 'POST' ? 'return=representation' : ''
            }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'DB error'); }
        return res.json().catch(() => null);
    },
    async upsertPlayer(email, nickname) {
        return this.request('players?on_conflict=email', 'POST', {
            email: Security.sanitize(email).toLowerCase(),
            nickname: Security.sanitize(nickname),
            rating: 0, wins: 0, losses: 0, draws: 0
        });
    },
    async getPlayer(email) {
        const rows = await this.request(`players?email=eq.${encodeURIComponent(email.toLowerCase())}&select=*&limit=1`);
        return rows?.[0] || null;
    },
    async updateStats(playerId, ratingDelta, result) {
        if (!Security.rateLimit('update_stats', 5)) return;
        const player = await this.getPlayerById(playerId);
        if (!player) return;
        const newRating = Math.max(0, Math.min(9999, player.rating + ratingDelta));
        const patch = { rating: newRating };
        if (result === 'win') patch.wins = (player.wins || 0) + 1;
        if (result === 'loss') patch.losses = (player.losses || 0) + 1;
        if (result === 'draw') patch.draws = (player.draws || 0) + 1;
        return this.request(`players?id=eq.${playerId}`, 'PATCH', patch);
    },
    async getPlayerById(id) {
        const rows = await this.request(`players?id=eq.${id}&select=*&limit=1`);
        return rows?.[0] || null;
    },
    async logGame(data) {
        return this.request('game_logs', 'POST', {
            player_id: data.playerId,
            opponent: Security.sanitize(data.opponent),
            result: data.result,
            moves_count: data.movesCount,
            rating_before: data.ratingBefore,
            rating_after: data.ratingAfter,
            game_mode: data.mode,
            created_at: new Date().toISOString()
        });
    },
    async getLeaderboard(limit = 50) {
        return this.request(`players?select=nickname,email,rating,wins,losses,draws&order=rating.desc&limit=${limit}`);
    }
};