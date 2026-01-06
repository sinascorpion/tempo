import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, FEE_MANAGER_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys, getTokensForWallet, getTokenBalance } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runAddLiquidity() {
    console.log(chalk.magenta("\n  ADD LIQUIDITY MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const tokenList = Object.entries(CONFIG.TOKENS).map(([name, address]) => ({ name, address }));
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    // Simplied Mode Selection for Node Version (Focus on UX)
    console.log(chalk.yellow('Mode:'));
    console.log(chalk.blue('  1. Manual Selection'));
    console.log(chalk.blue('  2. Created Tokens (Auto)'));

    let mode = askQuestion(chalk.cyan("Select (1-2): "));
    const useCreated = mode === '2';

    let userDetails = { symbol: '', address: '' };
    let valDetails = { symbol: '', address: '' };

    if (!useCreated) {
        // Manual Selection
        console.log(chalk.yellow('Select User Token:'));
        tokenList.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.name}`)));
        let uIdx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
        if (isNaN(uIdx) || uIdx < 0) return;
        userDetails = { symbol: tokenList[uIdx].name, address: tokenList[uIdx].address };

        console.log(chalk.yellow('Select Validator Token:'));
        tokenList.forEach((t, i) => { if (i !== uIdx) console.log(chalk.blue(`  ${i + 1}. ${t.name}`)); });
        let vIdx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
        if (isNaN(vIdx) || vIdx < 0) return;
        valDetails = { symbol: tokenList[vIdx].name, address: tokenList[vIdx].address };
    }

    let amount = parseFloat(askQuestion(chalk.cyan("Amount (default 1000): "))) || 1000;

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        let pairs = [];
        if (useCreated) {
            const myTokens = getTokensForWallet(wallet.address);
            if (myTokens.length === 0) {
                log('warning', 'No created tokens found.');
                continue;
            }
            // Use PathUSD as Validator Token by default for created tokens
            pairs = myTokens.map(t => ({
                uToken: { symbol: t.symbol, address: t.token },
                vToken: { symbol: 'PathUSD', address: CONFIG.TOKENS.PathUSD }
            }));
        } else {
            pairs = [{ uToken: userDetails, vToken: valDetails }];
        }

        const feeManager = new ethers.Contract(SYSTEM_CONTRACTS.FEE_MANAGER, FEE_MANAGER_ABI, wallet);

        for (const pair of pairs) {
            const { uToken, vToken } = pair;
            log('info', `Adding Liquidity: ${uToken.symbol} + ${vToken.symbol}`);

            try {
                const valContract = new ethers.Contract(vToken.address, ERC20_ABI, wallet);
                const decimals = await valContract.decimals(); // Usually 6 for stables, 18 for others
                const amountWei = ethers.parseUnits(amount.toString(), decimals);

                const bal = await valContract.balanceOf(wallet.address);
                if (bal < amountWei) {
                    log('error', `Insufficient ${vToken.symbol} balance`);
                    continue;
                }

                const allow = await valContract.allowance(wallet.address, SYSTEM_CONTRACTS.FEE_MANAGER);
                if (allow < amountWei) {
                    log('info', `Approving ${vToken.symbol}...`);
                    await (await valContract.approve(SYSTEM_CONTRACTS.FEE_MANAGER, ethers.MaxUint256)).wait();
                }

                log('info', 'Minting Liquidity...');
                const tx = await feeManager.mintWithValidatorToken(
                    uToken.address,
                    vToken.address,
                    amountWei,
                    wallet.address
                );
                log('info', `TX: ${tx.hash}`);
                await tx.wait();
                log('success', 'Liquidity Added!');

            } catch (error) {
                log('error', `Failed: ${error.message}`);
            }
            await sleep(2000);
        }

        if (w < privateKeys.length - 1) await sleep(3000);
    }
}
