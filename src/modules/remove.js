import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, FEE_MANAGER_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runRemoveLiquidity() {
    console.log(chalk.magenta("\n  REMOVE LIQUIDITY MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const tokenList = Object.entries(CONFIG.TOKENS).map(([name, address]) => ({ name, address }));

    console.log(chalk.yellow('Select User Token in Pool:'));
    tokenList.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.name}`)));
    let uIdx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(uIdx)) return;
    const userToken = tokenList[uIdx];

    console.log(chalk.yellow('Select Validator Token in Pool:'));
    tokenList.forEach((t, i) => { if (i !== uIdx) console.log(chalk.blue(`  ${i + 1}. ${t.name}`)); });
    let vIdx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(vIdx)) return;
    const valToken = tokenList[vIdx];

    let amount = parseFloat(askQuestion(chalk.cyan("LP Amount to Remove (default 1): "))) || 1;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        try {
            const feeManager = new ethers.Contract(SYSTEM_CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, wallet);

            const poolId = await feeManager.getPoolId(userToken.address, valToken.address);
            const lpBalance = await feeManager.liquidityBalances(poolId, wallet.address);

            // Assume 6 decimals for LP tokens (based on typical stablecoin mechanics in this ecosystem)
            // or just use raw amount if inputs are small integer.
            // Python code used * 10^6. Let's assume 6 decimals.
            const amountWei = ethers.parseUnits(amount.toString(), 6);

            console.log(chalk.blue(`  LP Balance: ${ethers.formatUnits(lpBalance, 6)}`));

            if (lpBalance < amountWei) {
                log('error', 'Insufficient LP Balance');
                continue;
            }

            log('info', 'Removing Liquidity...');
            const tx = await feeManager.burn(
                userToken.address,
                valToken.address,
                amountWei,
                wallet.address
            );
            log('info', `TX: ${tx.hash}`);
            await tx.wait();
            log('success', 'Liquidity Removed!');

        } catch (error) {
            log('error', `Failed: ${error.message}`);
        }
        await sleep(2000);
    }
}
