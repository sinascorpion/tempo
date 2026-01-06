import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, TIP20_EXTENDED_ABI } from '../config/config.js';
import { getPrivateKeys, getTokensForWallet } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runMintTokens() {
    console.log(chalk.magenta("\n  MINT TOKENS MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    let amountStr = askQuestion(chalk.cyan("Amount to Mint (default 1000): ")) || '1000';
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
            log('info', `Minting ${amountStr} ${token.symbol}...`);
            try {
                const tokenContract = new ethers.Contract(token.token, TIP20_EXTENDED_ABI, wallet);
                const decimals = await tokenContract.decimals();
                const amountWei = ethers.parseUnits(amountStr, decimals);

                // Check Role
                const ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ISSUER_ROLE"));
                // Try catch hasRole check in case contract doesn't support it (e.g. strict fallback)
                let hasRole = false;
                try {
                    hasRole = await tokenContract.hasRole(ISSUER_ROLE, wallet.address);
                } catch (e) {
                    log('info', 'Could not check role (function might be missing). Attempting mint anyway...');
                    hasRole = true;
                }

                if (!hasRole) {
                    log('info', 'Granting ISSUER_ROLE...');
                    try {
                        const tx = await tokenContract.grantRole(ISSUER_ROLE, wallet.address, { gasLimit: 200000 });
                        await tx.wait();
                    } catch (e) {
                        log('warning', `Grant Role failed: ${e.message}`);
                    }
                }

                const tx = await tokenContract.mint(wallet.address, amountWei, { gasLimit: 500000 });
                log('info', `TX: ${tx.hash}`);
                await tx.wait();
                log('success', `Minted ${amountStr} ${token.symbol}`);

            } catch (error) {
                log('error', `Mint failed for ${token.symbol}: ${error.code || error.message}`);
                // If it's a call exception, user might not have permission or contract is paused
            }
            await sleep(1000);
        }
        await sleep(2000);
    }
}
