import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runFaucetClaim() {
    console.log(chalk.magenta("\n  FAUCET CLAIM MODULE\n"));

    const privateKeys = getPrivateKeys();
    log('info', `Found ${privateKeys.length} wallets`);

    if (privateKeys.length === 0) {
        log('error', 'No private keys found in pv.txt');
        return;
    }

    let claimCount = askQuestion(chalk.cyan("How many claims per wallet? (1-100): "));
    claimCount = parseInt(claimCount) || 1;
    if (claimCount < 1) claimCount = 1;

    log('success', `Claims set to: ${claimCount}\n`);

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    let allResults = [];

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.dim('----------------------------------------'));
        console.log(chalk.magenta(`WALLET #${w + 1}/${privateKeys.length}`));
        console.log(chalk.cyan(`Address: ${wallet.address}\n`));

        for (let i = 1; i <= claimCount; i++) {
            log('info', `Claiming faucet ${i}/${claimCount}...`);
            await sleep(CONFIG.FAUCET_PRE_CLAIM_MS || 2000);

            try {
                // Send custom RPC request
                const txHashes = await provider.send('tempo_fundAddress', [wallet.address]);

                log('success', 'Faucet claimed successfully!');
                const hashes = Array.isArray(txHashes) ? txHashes : [txHashes];

                hashes.forEach((tx, idx) => {
                    if (idx < CONFIG.FAUCET_TOKENS.length) {
                        const token = CONFIG.FAUCET_TOKENS[idx];
                        console.log(chalk.green(`  + ${token.amount} ${token.symbol}`) + chalk.dim(` : ${tx}`));
                    }
                });

                allResults.push({ success: true, address: wallet.address });

            } catch (error) {
                log('error', `Claim failed: ${error.message}`);
                allResults.push({ success: false, address: wallet.address });
            }

            if (i < claimCount) {
                log('info', `Waiting ${CONFIG.FAUCET_CLAIM_DELAY_SEC}s...`);
                await sleep(CONFIG.FAUCET_CLAIM_DELAY_SEC * 1000);
            }
        }

        if (w < privateKeys.length - 1) {
            const delay = Math.floor(Math.random() * 5) + 5;
            log('info', `Waiting ${delay}s before next wallet...`);
            await sleep(delay * 1000);
        }
    }

    const successful = allResults.filter(r => r.success).length;
    const failed = allResults.filter(r => !r.success).length;

    console.log(chalk.magenta("\n  FAUCET SUMMARY"));
    console.log(chalk.green(`  Success: ${successful}`));
    console.log(chalk.red(`  Failed: ${failed}`));
    console.log(chalk.cyan(`  Total Claims: ${allResults.length}`));

    // Default finish delay
    await sleep(CONFIG.FAUCET_FINISH_DELAY_SEC * 1000);
}
