import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, FEE_MANAGER_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runSetFeeToken() {
    console.log(chalk.magenta("\n  SET FEE TOKEN MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const tokenList = Object.entries(CONFIG.TOKENS).map(([name, address]) => ({ name, address }));

    console.log(chalk.yellow('Select Fee Token (Validators prefer AlphaUSD!):'));
    tokenList.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.name}`)));
    let index = parseInt(askQuestion(chalk.cyan("Choice (default 2 AlphaUSD): "))) - 1;
    if (isNaN(index)) index = 1; // Default to AlphaUSD

    const targetToken = tokenList[index];
    log('info', `Setting Fee Token to: ${targetToken.name}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        try {
            const feeManager = new ethers.Contract(SYSTEM_CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, wallet);

            // Check current
            const currentTokenAddr = await feeManager.userTokens(wallet.address);
            if (currentTokenAddr.toLowerCase() === targetToken.address.toLowerCase()) {
                log('success', 'Already set to this token.');
                continue;
            }

            // Check Balance of target token
            const tokenContract = new ethers.Contract(targetToken.address, ERC20_ABI, wallet);
            const balance = await tokenContract.balanceOf(wallet.address);
            if (balance < ethers.parseUnits("0.1", 18)) { // Assume 18 or 6? Safe threshold
                log('warning', `Low balance of ${targetToken.name}. Might fail transaction if used for gas.`);
            }

            log('info', 'Setting User Token...');
            const tx = await feeManager.setUserToken(targetToken.address);
            log('info', `TX: ${tx.hash}`);
            await tx.wait();
            log('success', 'Fee Token Updated!');

        } catch (error) {
            log('error', `Failed: ${error.message}`);
        }
        await sleep(2000);
    }
}
