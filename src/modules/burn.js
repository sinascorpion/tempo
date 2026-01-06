import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, TIP20_EXTENDED_ABI } from '../config/config.js';
import { getPrivateKeys, getTokensForWallet } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runBurnTokens() {
    console.log(chalk.magenta("\n  BURN TOKENS MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    let amountStr = askQuestion(chalk.cyan("Amount to Burn (default 10): ")) || '10';
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        const myTokens = getTokensForWallet(wallet.address);
        if (myTokens.length === 0) {
            log('warning', 'No created tokens found for this wallet.');
            continue;
        }

        for (const token of myTokens) {
            log('info', `Burning ${amountStr} ${token.symbol}...`);
            try {
                const tokenContract = new ethers.Contract(token.token, TIP20_EXTENDED_ABI, wallet);
                const decimals = await tokenContract.decimals();
                const amountWei = ethers.parseUnits(amountStr, decimals);

                const bal = await tokenContract.balanceOf(wallet.address);
                if (bal < amountWei) {
                    log('warning', `Insufficient balance to burn ${token.symbol}`);
                    continue;
                }

                const tx = await tokenContract.burn(amountWei);
                log('info', `TX: ${tx.hash}`);
                await tx.wait();
                log('success', `Burned ${amountStr} ${token.symbol}`);

            } catch (error) {
                log('error', `Burn failed for ${token.symbol}: ${error.message}`);
            }
            await sleep(1000);
        }
        await sleep(2000);
    }
}
