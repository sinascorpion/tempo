import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, STABLECOIN_DEX_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys, getTokenBalance } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runSwapTokens() {
    console.log(chalk.magenta("\n  SWAP TOKENS MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const tokenList = Object.entries(CONFIG.TOKENS).map(([name, address]) => ({ name, address }));

    // Select Token In
    console.log(chalk.yellow('Select Token To Sell (TokenIn):'));
    tokenList.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.name}`)));
    const inIndex = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(inIndex) || inIndex < 0) return;
    const tokenIn = tokenList[inIndex];

    // Select Token Out
    console.log(chalk.yellow('Select Token To Buy (TokenOut):'));
    tokenList.forEach((t, i) => {
        if (i !== inIndex) console.log(chalk.blue(`  ${i + 1}. ${t.name}`));
    });
    const outIndex = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(outIndex) || outIndex < 0) return;
    const tokenOut = tokenList[outIndex];

    const amount = parseFloat(askQuestion(chalk.cyan("Amount (default 1): "))) || 1;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        try {
            const dex = new ethers.Contract(SYSTEM_CONTRACTS.STABLECOIN_DEX, STABLECOIN_DEX_ABI, wallet);
            const tokenInContract = new ethers.Contract(tokenIn.address, ERC20_ABI, wallet);
            const tokenOutContract = new ethers.Contract(tokenOut.address, ERC20_ABI, wallet);

            // Assume 6 decimals for stables as per python code hint
            // Actually config doesn't specify decimals, but swap.py used 1e6.
            // But PathUSD might be 18? Python code said "6 decimals для стейблкоинов".
            // Safer to read decimals dynamically.
            const decimalsIn = await tokenInContract.decimals();
            const amountIn = ethers.parseUnits(amount.toString(), decimalsIn);

            const balance = await tokenInContract.balanceOf(wallet.address);
            if (balance < amountIn) {
                log('error', `Insufficient ${tokenIn.name} balance`);
                continue;
            }

            // Approve DEX
            const allowance = await tokenInContract.allowance(wallet.address, SYSTEM_CONTRACTS.STABLECOIN_DEX);
            if (allowance < amountIn) {
                log('info', 'Approving DEX...');
                const tx = await tokenInContract.approve(SYSTEM_CONTRACTS.STABLECOIN_DEX, ethers.MaxUint256);
                await tx.wait();
            }

            // Check Liquidity
            let hasLiquidity = false;
            let expectedOut = 0n;
            try {
                expectedOut = await dex.quoteSwapExactAmountIn(tokenIn.address, tokenOut.address, amountIn);
                if (expectedOut > 0n) {
                    hasLiquidity = true;
                    // Format output
                    const decimalsOut = await tokenOutContract.decimals();
                    console.log(chalk.green(`  Expected Output: ${ethers.formatUnits(expectedOut, decimalsOut)} ${tokenOut.name}`));
                }
            } catch (e) { /* ignore */ }

            if (!hasLiquidity) {
                log('warning', 'No liquidity! Placing Limit Order...');

                // Auto-liquidity logic from Python
                // If selling PathUSD -> BUY tokenOut (BID)
                // If selling other -> SELL tokenOut (ASK) ?? No, python logic:
                // if token_in == PathUSD: selling PathUSD, buying TokenOut. -> Place ASK for TokenOut? 
                // Wait. Python code:
                // if token_in == PathUSD:
                //    check token_out balance.
                //    place(token_out, order_amount, FALSE (Ask), 0).
                //    Wait, if I am selling PathUSD, I am buying TokenOut. Why place ASK for TokenOut?
                //    An ASK for TokenOut means I am SELLING TokenOut for PathUSD.
                //    If I execute this order, I will convert TokenOut -> PathUSD.
                //    This creates liquidity for someone who wants to Sell PathUSD -> TokenOut (which is ME right now).
                //    Aha! I am placing a maker order on the OTHER SIDE so I can swap against it?
                //    Or maybe I am placing order to BE the execution?
                //    Actually, `place` creates a limit order.
                //    If I want to SWAP, I need a matching order.
                //    So if I want to Sell A and Buy B.
                //    I need someone Selling B and Buying A.
                //    So I place an order Selling B (ASK) ?? But I need to HAVE B to sell it?
                //    Yes, Python code checks `if token_out_balance >= order_amount`.
                //    So it uses the wallet's *other* token balance to seed liquidity.

                const PathUSD = CONFIG.TOKENS.PathUSD.toLowerCase();
                const amountOrder = amountIn * 2n; // Double amount

                if (tokenIn.address.toLowerCase() === PathUSD) {
                    // Selling PathUSD. Need liquidity to Buy PathUSD (from me).
                    // So we place an ASK order on TokenOut (Selling TokenOut for PathUSD).
                    // Check TokenOut balance.
                    const balOut = await tokenOutContract.balanceOf(wallet.address);
                    if (balOut >= amountOrder) {
                        log('info', `Placing ASK order for ${tokenOut.name} to create liquidity...`);

                        const allowOut = await tokenOutContract.allowance(wallet.address, SYSTEM_CONTRACTS.STABLECOIN_DEX);
                        if (allowOut < amountOrder) {
                            await (await tokenOutContract.approve(SYSTEM_CONTRACTS.STABLECOIN_DEX, ethers.MaxUint256)).wait();
                        }

                        const placeTx = await dex.place(tokenOut.address, amountOrder, false, 0); // false = ASK
                        await placeTx.wait();
                        log('success', 'Order placed.');
                        await sleep(3000);
                        hasLiquidity = true; // Assume yes
                    } else {
                        log('error', `Cannot place liquidity order: Insufficient ${tokenOut.name}`);
                    }
                } else {
                    // Selling Other Token. Need liquidity to Buy Other Token (from me).
                    // So we place a BID order on Other Token (Buying Other Token with PathUSD).
                    // Wait, Python logic led to ASK on TokenOut. 
                    // Let's trust Python logic:
                    // If token_in != PathUSD:
                    //    Check TokenOut balance.
                    //    Place ASK on TokenOut.
                    //    Wait, TokenOut IS PathUSD usually if pairing.
                    //    If I Sell Alpha -> Buy PathUSD.
                    //    I need someone Selling PathUSD -> Buying Alpha (BID on Alpha).
                    //    Or ASK on PathUSD?
                    //    DEX usually has Base/Quote.

                    // Python Logic simplified:
                    // if token_in == PathUSD: place ASK on tokenOut.
                    // elif token_out == PathUSD: place BID on tokenIn.
                    // else: place ASK on tokenOut.

                    if (tokenOut.address.toLowerCase() === PathUSD) {
                        const balIn = await tokenInContract.balanceOf(wallet.address);
                        // wait, use PathUSD balance.
                        const pathUsdContract = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
                        const balPath = await pathUsdContract.balanceOf(wallet.address);

                        if (balPath >= amountOrder) {
                            log('info', `Placing BID order for ${tokenIn.name}...`);
                            const allow = await pathUsdContract.allowance(wallet.address, SYSTEM_CONTRACTS.STABLECOIN_DEX);
                            if (allow < amountOrder) await (await pathUsdContract.approve(SYSTEM_CONTRACTS.STABLECOIN_DEX, ethers.MaxUint256)).wait();

                            const placeTx = await dex.place(tokenIn.address, amountOrder, true, 0); // true = BID
                            await placeTx.wait();
                            hasLiquidity = true;
                        }
                    } else {
                        // Both not PathUSD? Weird but fallback to ASK on TokenOut
                        const balOut = await tokenOutContract.balanceOf(wallet.address);
                        if (balOut >= amountOrder) {
                            const allow = await tokenOutContract.allowance(wallet.address, SYSTEM_CONTRACTS.STABLECOIN_DEX);
                            if (allow < amountOrder) await (await tokenOutContract.approve(SYSTEM_CONTRACTS.STABLECOIN_DEX, ethers.MaxUint256)).wait();
                            await (await dex.place(tokenOut.address, amountOrder, false, 0)).wait();
                            hasLiquidity = true;
                        }
                    }
                }
            }

            if (hasLiquidity) {
                // Re-quote
                try {
                    expectedOut = await dex.quoteSwapExactAmountIn(tokenIn.address, tokenOut.address, amountIn);
                } catch { expectedOut = 0n; }
            }

            if (expectedOut > 0n) {
                log('info', 'Swapping...');
                const minOut = (expectedOut * 99n) / 100n; // 1% slippage
                const tx = await dex.swapExactAmountIn(tokenIn.address, tokenOut.address, amountIn, minOut);
                log('info', `Swap TX: ${tx.hash}`);
                await tx.wait();
                log('success', 'Swap Complete!');
            } else {
                log('error', 'Swap failed: No liquidity even after order placement.');
            }

        } catch (error) {
            log('error', `Error: ${error.message}`);
        }
        await sleep(2000);
    }
}
