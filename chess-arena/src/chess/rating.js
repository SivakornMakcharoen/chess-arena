// ============================================================
// RATING SYSTEM
// ============================================================
export const Rating = {
    getBotRating(r) { return Math.max(100, r + Math.floor((Math.random() - 0.5) * 100)); },
    kFactor(r) { return r < 600 ? 40 : r < 1200 ? 32 : r < 1800 ? 24 : 16; },
    calc(playerRating, oppRating, result) {
        const expected = 1 / (1 + Math.pow(10, (oppRating - playerRating) / 400));
        return Math.round(this.kFactor(playerRating) * (result - expected));
    },
    getTier(r) {
        if (r >= 2500) return { name: 'Crown', icon: '🤴🏼', class: 'tier-crown', color: '#F59E0B' };
        if (r >= 2201) return { name: 'Diamond', icon: '', class: 'tier-diamond', color: '#A78BFA' };
        if (r >= 1801) return { name: 'Emerald', icon: '🟢', class: 'tier-emerald', color: '#34D399' };
        if (r >= 1401) return { name: 'Platinum', icon: '🔷', class: 'tier-platinum', color: '#67E8F9' };
        if (r >= 1001) return { name: 'Gold', icon: '🥇', class: 'tier-gold', color: '#F59E0B' };
        if (r >= 501) return { name: 'Silver', icon: '🥈', class: 'tier-silver', color: '#94A3B8' };
        return { name: 'Bronze', icon: '🥉', class: 'tier-bronze', color: '#CD7C2F' };
    }
};

