import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, TIP20_FACTORY_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys, saveCreatedToken } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

function generateRandomName() {
    const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Nova', 'Stellar', 'Crypto', 'Hyper', 'Super'];
    const suffixes = ['Dollar', 'Coin', 'Cash', 'Pay', 'Token', 'Credit', 'Gold', 'Silver'];
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}

function generateRandomSymbol() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 3; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result + 'USD';
}

export async function runCreateStablecoin() {
    console.log(chalk.magenta("\n  CREATE STABLECOIN MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const useRandom = askQuestion(chalk.cyan("Use random names? (y/n, default y): ")).toLowerCase() !== 'n';
    let fixedName, fixedSymbol;
    if (!useRandom) {
        fixedName = askQuestion(chalk.cyan("Token Name: "));
        fixedSymbol = askQuestion(chalk.cyan("Token Symbol: "));
    }

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    let successful = 0;
    let failed = 0;

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}/${privateKeys.length}: ${wallet.address}`));

        const name = useRandom ? generateRandomName() : fixedName;
        const symbol = useRandom ? generateRandomSymbol() : fixedSymbol;
        log('info', `Creating Token: ${name} (${symbol})`);

        try {
            const factory = new ethers.Contract(SYSTEM_CONTRACTS.TIP20_FACTORY, TIP20_FACTORY_ABI, wallet);

            const tx = await factory.createToken(
                name,
                symbol,
                "USD",
                CONFIG.TOKENS.PathUSD,
                wallet.address
            );
            log('info', `Creation TX: ${tx.hash}`);

            const receipt = await tx.wait();

            // Find TokenCreated event
            let tokenAddress = null;
            for (const log of receipt.logs) {
                try {
                    const parsed = factory.interface.parseLog(log);
                    if (parsed && parsed.name === 'TokenCreated') {
                        tokenAddress = parsed.args.token;
                        break;
                    }
                } catch (e) { continue; }
            }

            if (tokenAddress) {
                log('success', `Token Created at: ${tokenAddress}`);
                saveCreatedToken(wallet.address, tokenAddress, symbol);
                successful++;

                // Grant Role
                log('info', 'Granting ISSUER_ROLE...');
                // Ensure fee is approved if needed (logic simplified: try to grant, if fail usually means fee/allowance issue)
                // Actually, python code checks allowance of fee token (PathUSD)
                try {
                    const pathUsd = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
                    const allowance = await pathUsd.allowance(wallet.address, tokenAddress);
                    if (allowance < ethers.parseUnits("1000", 6)) { // Assuming 6 decimals or 18? PathUSD likely 18 but config says stablecoin dex uses uint128 implies maybe less? actually standard erc20 usually 18 unless specified. PathUSD usually 18.
                        log('info', 'Approving PathUSD for fee...');
                        const appTx = await pathUsd.approve(tokenAddress, ethers.MaxUint256);
                        await appTx.wait();
                    }

                    // Grant Role on the new token
                    const tokenContract = new ethers.Contract(tokenAddress, [
                        "function grantRole(bytes32 role, address account)",
                        "function ISSUER_ROLE() view returns (bytes32)"
                        // Note: ISSUER_ROLE is usually a constant keccak("ISSUER_ROLE"), not a view function, but we can compute it manually.
                    ], wallet);

                    const ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ISSUER_ROLE"));
                    const grantTx = await tokenContract.grantRole(ISSUER_ROLE, wallet.address);
                    await grantTx.wait();
                    log('success', 'ISSUER_ROLE granted!');

                } catch (roleErr) {
                    log('warning', `Failed to grant role: ${roleErr.message}`);
                }

            } else {
                log('warning', 'Token address not found in logs');
            }

        } catch (error) {
            log('error', `Creation failed: ${error.message}`);
            failed++;
        }

        if (w < privateKeys.length - 1) await sleep(5000);
    }
}
