import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, ERC20_ABI, FEE_MANAGER_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';

export async function runAnalytics() {
    console.log(chalk.magenta("\n  ANALYTICS MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.cyan(`\nWallet: ${wallet.address}`));

        console.log(chalk.blue('  Tokens:'));
        for (const [symbol, addr] of Object.entries(CONFIG.TOKENS)) {
            try {
                const contract = new ethers.Contract(addr, ERC20_ABI, provider);
                const bal = await contract.balanceOf(wallet.address);
                // Assume 6 decimals for most, check config if varied.
                // Using formatted string
                console.log(`    ${symbol}: ${ethers.formatUnits(bal, 6)}`); // Adjust decimal assumption if needed
            } catch (e) {
                console.log(`    ${symbol}: Error`);
            }
        }

        console.log(chalk.blue('  LP Positions (Alpha/Beta/Theta + PathUSD):'));
        const feeManager = new ethers.Contract(SYSTEM_CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, provider);
        const pairs = ['AlphaUSD', 'BetaUSD', 'ThetaUSD'];

        for (const coin of pairs) {
            try {
                const uToken = CONFIG.TOKENS[coin];
                const vToken = CONFIG.TOKENS.PathUSD;
                const poolId = await feeManager.getPoolId(uToken, vToken);
                const lp = await feeManager.liquidityBalances(poolId, wallet.address);
                if (lp > 0n) {
                    console.log(`    ${coin}/PathUSD LP: ${ethers.formatUnits(lp, 6)}`);
                }
            } catch { }
        }
    }
}
