import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, ERC20_ABI, STABLECOIN_DEX_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';
import { WalletStatistics } from '../utils/statistics.js';

export async function runBatchOperations() {
    console.log(chalk.magenta("\n  BATCH OPERATIONS MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    console.log(chalk.yellow('Select Batch Operation:'));
    console.log(chalk.blue('  1. Multiple Swaps (Sequential)'));
    console.log(chalk.blue('  2. Multiple Transfers (Sequential)'));

    // Note: Python had "Approve + Swap in 1 TX" but that requires a bespoke Batch Contract which might not be deployed.
    // I will stick to Sequential for now as per Python fallback logic.

    const choice = askQuestion(chalk.cyan("Choice (1-2): "));
    const stats = new WalletStatistics();
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    if (choice === '1') {
        const count = parseInt(askQuestion(chalk.cyan("Number of Swaps (2-5): "))) || 2;
        const swapPairs = [
            ['PathUSD', 'AlphaUSD'],
            ['AlphaUSD', 'BetaUSD'],
            ['BetaUSD', 'ThetaUSD'],
            ['ThetaUSD', 'PathUSD'],
            ['PathUSD', 'BetaUSD']
        ];

        for (let w = 0; w < privateKeys.length; w++) {
            const wallet = new ethers.Wallet(privateKeys[w], provider);
            console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

            for (let i = 0; i < count; i++) {
                const [inSym, outSym] = swapPairs[i % swapPairs.length];
                const inAddr = CONFIG.TOKENS[inSym];
                const outAddr = CONFIG.TOKENS[outSym];

                log('info', `${i + 1}/${count} Swapping ${inSym} -> ${outSym}...`);

                try {
                    const dex = new ethers.Contract(SYSTEM_CONTRACTS.STABLECOIN_DEX, STABLECOIN_DEX_ABI, wallet);
                    const tokenIn = new ethers.Contract(inAddr, ERC20_ABI, wallet);

                    // Check decimals
                    const amount = ethers.parseUnits("0.1", 6); // Assume 6 decimals

                    // Approve
                    const allow = await tokenIn.allowance(wallet.address, SYSTEM_CONTRACTS.STABLECOIN_DEX);
                    if (allow < amount) {
                        await (await tokenIn.approve(SYSTEM_CONTRACTS.STABLECOIN_DEX, ethers.MaxUint256)).wait();
                    }

                    // Swap
                    // Get Quote
                    let minOut = 0n;
                    try {
                        const quote = await dex.quoteSwapExactAmountIn(inAddr, outAddr, amount);
                        minOut = (quote * 99n) / 100n;
                    } catch { }

                    const tx = await dex.swapExactAmountIn(inAddr, outAddr, amount, minOut);
                    const receipt = await tx.wait();
                    log('success', `Swap Complete: ${tx.hash}`);

                    stats.recordTransaction(wallet.address, 'batch_swap', tx.hash, receipt.gasUsed.toString(), 'success');
                } catch (e) {
                    log('error', `Swap Failed: ${e.message}`);
                }
                await sleep(1000);
            }
            await sleep(2000);
        }

    } else if (choice === '2') {
        const count = parseInt(askQuestion(chalk.cyan("Number of Transfers (2-10): "))) || 2;

        for (let w = 0; w < privateKeys.length; w++) {
            const wallet = new ethers.Wallet(privateKeys[w], provider);
            console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

            const recipients = Array(count).fill(0).map(() => ethers.Wallet.createRandom().address);
            const tokenContract = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
            const amount = ethers.parseUnits("0.01", 6); // Assume 6 decimals for PathUSD

            for (let i = 0; i < count; i++) {
                log('info', `${i + 1}/${count} Transferring to ${recipients[i].slice(0, 10)}...`);
                try {
                    const tx = await tokenContract.transfer(recipients[i], amount);
                    const receipt = await tx.wait();
                    log('success', `TX: ${tx.hash}`);
                    stats.recordTransaction(wallet.address, 'batch_transfer', tx.hash, receipt.gasUsed.toString(), 'success');
                } catch (e) {
                    log('error', `Transfer Failed: ${e.message}`);
                }
                await sleep(500);
            }
            await sleep(2000);
        }
    }
}
