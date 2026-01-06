import { ethers } from 'ethers';
import chalk from 'chalk';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

// Import modules
import { runContractDeploy } from './deploy.js';
import { runFaucetClaim } from './faucet.js';
import { runSendToken } from './send.js';
import { runCreateStablecoin } from './token.js';
import { runSwapTokens } from './swap.js';
import { runAddLiquidity } from './liquidity.js';
import { runSetFeeToken } from './fee.js';
import { runMintTokens } from './mint.js';
import { runBurnTokens } from './burn.js';
import { runTransferWithMemo } from './memo.js';
import { runLimitOrder } from './limit.js';
import { runRemoveLiquidity } from './remove.js';
import { runGrantRole } from './role.js';
import { runNft } from './nft.js';
import { runInfinityName } from './infinity.js';
import { runRetrieverNft } from './retriever.js';

export async function runAutoMode() {
    console.log(chalk.magenta("\n  AUTO MODE\n"));

    const loops = parseInt(askQuestion(chalk.cyan("Number of loops per wallet (default 1): "))) || 1;

    // In strict auto mode, we might randomise activities. 
    // For now, let's implement a cycle that picks random activities.

    const actions = [
        runFaucetClaim, runSendToken, runSwapTokens,
        runTransferWithMemo, runLimitOrder, runNft, runInfinityName
    ];

    const privateKeys = getPrivateKeys();

    for (let i = 0; i < loops; i++) {
        log('info', `Loop ${i + 1}/${loops}`);

        // Randomize action
        const action = actions[Math.floor(Math.random() * actions.length)];
        log('info', `Running Auto Activity...`);

        try {
            await action();
        } catch (e) {
            log('error', `Auto Action Failed: ${e.message}`);
        }

        await sleep(5000);
    }

    log('success', 'Auto Mode Complete.');
}
