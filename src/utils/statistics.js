import fs from 'fs-extra';
import path from 'path';

const STATS_FILE = path.join(process.cwd(), 'data', 'stats.json');

export class WalletStatistics {
    constructor() {
        this.data = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(STATS_FILE)) {
                return fs.readJsonSync(STATS_FILE);
            }
        } catch (e) { }
        return { wallets: {} };
    }

    save() {
        try {
            fs.ensureDirSync(path.dirname(STATS_FILE));
            fs.writeJsonSync(STATS_FILE, this.data, { spaces: 2 });
        } catch (e) {
            console.error('Failed to save stats:', e);
        }
    }

    recordTransaction(address, type, txHash, gasUsed, status, details = {}) {
        if (!this.data.wallets[address]) {
            this.data.wallets[address] = {
                address,
                first_activity: new Date().toISOString(),
                total_transactions: 0,
                total_gas_used: 0,
                counters: {}
            };
        }

        const w = this.data.wallets[address];
        w.last_activity = new Date().toISOString();
        w.total_transactions++;
        w.total_gas_used += parseInt(gasUsed || 0);

        if (!w.counters[type]) w.counters[type] = 0;
        w.counters[type]++;

        this.save();
    }

    getWalletStats(address) {
        return this.data.wallets[address] || null;
    }

    getAllWallets() {
        return Object.values(this.data.wallets);
    }
}
