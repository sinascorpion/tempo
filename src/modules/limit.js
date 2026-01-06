import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, STABLECOIN_DEX_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runLimitOrder() {
    console.log(chalk.magenta("\n  LIMIT ORDER MODULE (AUTO-MODE)\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    // Filter valid tokens (excluding Quote Token PathUSD)
    const validTokens = Object.entries(CONFIG.TOKENS)
        .filter(([name]) => name !== 'PathUSD')
        .map(([name, address]) => ({ name, address }));

    let loopCount = askQuestion(chalk.cyan("How many orders to place per wallet? (Default: 1): "));
    loopCount = parseInt(loopCount) || 1;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    // Track statistics
    let successful = 0;
    let failed = 0;

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        // Use checksum address for DEX
        const dexAddress = ethers.getAddress(SYSTEM_CONTRACTS.STABLECOIN_DEX);
        const dex = new ethers.Contract(dexAddress, STABLECOIN_DEX_ABI, wallet);

        for (let i = 0; i < loopCount; i++) {
            try {
                // Randomize Parameters (favoring BID as per Python success)
                const tokenInfo = validTokens[Math.floor(Math.random() * validTokens.length)];

                // Force BID (Buy Token with PathUSD) to match Python success pattern
                const isBid = true;

                // Use a standard amount like the Python default (10)
                // Small amounts (1-5) might be below minimum order size on DEX
                const amountVal = 10;
                const amountStr = amountVal.toString();

                // Fixed Tick 0
                const tick = 0;

                // Resolve Token Addresses (Checksummed)
                const baseTokenAddress = ethers.getAddress(tokenInfo.address);
                const pathUSDAddress = ethers.getAddress(CONFIG.TOKENS.PathUSD);

                const tokenToApprove = isBid ? pathUSDAddress : baseTokenAddress;
                const tokenToApproveSymbol = isBid ? 'PathUSD' : tokenInfo.name;

                console.log(chalk.yellow(`  Order #${i + 1}: ${isBid ? 'BID' : 'ASK'} ${amountStr} ${tokenInfo.name} @ Tick ${tick}`));

                // Force 6 decimals exactly
                const decimals = 6;
                const amountWei = ethers.parseUnits(amountStr, decimals);

                const tokenContract = new ethers.Contract(tokenToApprove, ERC20_ABI, wallet);

                // Check Balance
                const balance = await tokenContract.balanceOf(wallet.address);
                const formattedBalance = ethers.formatUnits(balance, decimals);
                log('info', `Balance ${tokenToApproveSymbol}: ${formattedBalance}`);

                if (balance < amountWei) {
                    log('warning', `Insufficient ${tokenToApproveSymbol} balance. Needed: ${amountStr}. Skipping.`);
                    failed++;
                    continue;
                }

                // Check Allowance
                const allowance = await tokenContract.allowance(wallet.address, dexAddress);
                if (allowance < amountWei) {
                    log('info', `Approving ${tokenToApproveSymbol}...`);
                    const txApprove = await tokenContract.approve(dexAddress, ethers.MaxUint256, { gasLimit: 200000 });
                    await txApprove.wait();
                    log('success', 'Approved.');
                }

                // Double check allowance before placing
                // const verifyAllowance = await tokenContract.allowance(wallet.address, dexAddress);
                // if (verifyAllowance < amountWei) throw new Error("Approval failed or not updated yet.");

                log('info', 'Placing Order...');

                // Python: dex.place(token_address, amount, isBid, tick)
                // Note: token_address passed is the BASE token (e.g. AlphaUSD), even for BID.
                const tx = await dex.place(
                    baseTokenAddress,
                    amountWei,
                    isBid,
                    tick,
                    { gasLimit: 3000000 } // Increased gas limit to 3M
                );

                log('info', `TX: ${tx.hash}`);
                await tx.wait();
                log('success', 'Order Placed!');
                successful++;

            } catch (error) {
                log('error', `Order Failed: ${error.message}`);
                failed++;
            }

            if (i < loopCount - 1) await sleep(2000);
        }
    }

    console.log(chalk.magenta("\n  LIMIT ORDER SUMMARY"));
    console.log(chalk.green(`  Success: ${successful}`));
    console.log(chalk.red(`  Failed: ${failed}`));
}
