import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, TIP20_EXTENDED_ABI } from '../config/config.js';
import { getPrivateKeys, getTokensForWallet } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runGrantRole() {
    console.log(chalk.magenta("\n  GRANT ROLE MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    console.log(chalk.yellow('Select Role:'));
    console.log(chalk.blue('  1. ISSUER_ROLE'));
    console.log(chalk.blue('  2. PAUSE_ROLE'));
    const isPause = askQuestion(chalk.cyan("Choice (1-2): ")) === '2';
    const roleName = isPause ? 'PAUSE_ROLE' : 'ISSUER_ROLE';
    const roleHash = ethers.keccak256(ethers.toUtf8Bytes(roleName));

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        const myTokens = getTokensForWallet(wallet.address);
        if (myTokens.length === 0) {
            log('warning', 'No created tokens found.');
            continue;
        }

        for (const token of myTokens) {
            try {
                const tokenContract = new ethers.Contract(token.token, TIP20_EXTENDED_ABI, wallet);
                const hasRole = await tokenContract.hasRole(roleHash, wallet.address);

                if (hasRole) {
                    log('success', `${roleName} already granted on ${token.symbol}`);
                } else {
                    log('info', `Granting ${roleName} on ${token.symbol}...`);
                    const tx = await tokenContract.grantRole(roleHash, wallet.address, { gasLimit: 200000 });
                    await tx.wait();
                    log('success', 'Role Granted!');
                }
            } catch (error) {
                log('error', `Failed for ${token.symbol}: ${error.message}`);
            }
            await sleep(1000);
        }
        await sleep(2000);
    }
}
