import chalk from 'chalk';
import { WalletStatistics } from '../utils/statistics.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { ethers } from 'ethers';
import { askQuestion } from '../utils/helpers.js';

export async function runStatistics() {
    console.log(chalk.magenta("\n  STATISTICS MODULE\n"));

    console.log(chalk.blue('  1. Show Wallet Stats'));
    console.log(chalk.blue('  2. Top 10 Active Wallets'));

    const choice = askQuestion(chalk.cyan("Choice (1-2): "));
    const stats = new WalletStatistics();

    if (choice === '1') {
        const privateKeys = getPrivateKeys();
        privateKeys.forEach((pk, i) => {
            const addr = new ethers.Wallet(pk).address;
            console.log(`  ${i + 1}. ${addr}`);
        });
        const idx = parseInt(askQuestion(chalk.cyan("Select Wallet: "))) - 1;
        if (isNaN(idx)) return;

        const walletAddr = new ethers.Wallet(privateKeys[idx]).address;
        const data = stats.getWalletStats(walletAddr);

        if (data) {
            console.log(chalk.green(`\nStats for ${walletAddr}`));
            console.log(`  Total TXs: ${data.total_transactions}`);
            console.log(`  Gas Used: ${data.total_gas_used}`);
            console.log('  Counters:', data.counters);
        } else {
            console.log(chalk.yellow('  No data found.'));
        }

    } else if (choice === '2') {
        const wallets = stats.getAllWallets();
        wallets.sort((a, b) => b.total_transactions - a.total_transactions);

        console.log(chalk.green("\n  TOP 10 ACTIVE WALLETS"));
        wallets.slice(0, 10).forEach((w, i) => {
            console.log(`  ${i + 1}. ${w.address} (${w.total_transactions} txs)`);
        });
    }
}
