import readlineSync from 'readline-sync';
import chalk from 'chalk';
import { clearTerminal, log, askQuestion } from './utils/helpers.js';
import { CONFIG, VERSION_INFO } from './config/config.js';

// Module imports
import { runContractDeploy } from './modules/deploy.js';
import { runFaucetClaim } from './modules/faucet.js';
import { runSendToken } from './modules/send.js';
import { runCreateStablecoin } from './modules/token.js';
import { runSwapTokens } from './modules/swap.js';
import { runAddLiquidity } from './modules/liquidity.js';
import { runSetFeeToken } from './modules/fee.js';
import { runMintTokens } from './modules/mint.js';
import { runBurnTokens } from './modules/burn.js';
import { runTransferWithMemo } from './modules/memo.js';
import { runLimitOrder } from './modules/limit.js';
import { runGrantRole } from './modules/role.js';
import { runRemoveLiquidity } from './modules/remove.js';
import { runNft } from './modules/nft.js';
import { runInfinityName } from './modules/infinity.js';
import { runRetrieverNft } from './modules/retriever.js';
import { runBatchOperations } from './modules/batch.js';
import { runTip403Policies } from './modules/tip403.js';
import { runAnalytics } from './modules/analytics.js';
import { runStatistics } from './modules/stats.js';
import { runAutoMode } from './modules/auto.js';
import { runOnChainGM } from './modules/onchain-gm.js';

function printLine(char = '=', color = 'cyan') {
    const line = char.repeat(60);
    if (color === 'cyan') {
        console.log(chalk.bold.cyan(line));
    } else if (color === 'magenta') {
        console.log(chalk.bold.magenta(line));
    } else if (color === 'green') {
        console.log(chalk.bold.green(line));
    } else if (color === 'yellow') {
        console.log(chalk.bold.yellow(line));
    } else if (color === 'red') {
        console.log(chalk.bold.red(line));
    } else {
        console.log(chalk.bold.white(line));
    }
}

function showHeader() {
    clearTerminal();
    printLine('=', 'magenta');
    console.log(chalk.bold.magenta('              TEMPO AUTO BOT  - V2.0  '));
    console.log(chalk.bold.white('              CREATED BY KAZUHA | VIP ONLY'));
    printLine('=', 'magenta');
    console.log('');
}

function showMenu() {
    showHeader();
    
    console.log(chalk.bold.cyan('  1.') + chalk.white('  Deploy Contracts'));
    console.log(chalk.bold.cyan('  2.') + chalk.white('  Faucet Claim'));
    console.log(chalk.bold.cyan('  3.') + chalk.white('  Send Token'));
    console.log(chalk.bold.cyan('  4.') + chalk.white('  Create Stablecoin'));
    console.log(chalk.bold.cyan('  5.') + chalk.white('  Swap Tokens'));
    console.log(chalk.bold.cyan('  6.') + chalk.white('  Add Liquidity'));
    console.log(chalk.bold.cyan('  7.') + chalk.white('  Set Fee Token'));
    console.log(chalk.bold.cyan('  8.') + chalk.white('  Mint Tokens'));
    console.log(chalk.bold.cyan('  9.') + chalk.white('  Burn Tokens'));
    console.log(chalk.bold.cyan(' 10.') + chalk.white('  Transfer with Memo'));
    console.log(chalk.bold.cyan(' 11.') + chalk.white('  Limit Order'));
    console.log(chalk.bold.cyan(' 12.') + chalk.white('  Remove Liquidity'));
    console.log(chalk.bold.cyan(' 13.') + chalk.white('  Grant Role ISSUER/PAUSE'));
    console.log(chalk.bold.cyan(' 14.') + chalk.white('  NFT Create and Mint'));
    console.log(chalk.bold.cyan(' 15.') + chalk.white('  InfinityName Mint Domain'));
    console.log(chalk.bold.cyan(' 16.') + chalk.white('  Retriever NFT MintAura'));
    console.log(chalk.bold.cyan(' 17.') + chalk.white('  Batch Operations'));
    console.log(chalk.bold.cyan(' 18.') + chalk.white('  TIP-403 Policies'));
    console.log(chalk.bold.cyan(' 19.') + chalk.white('  Analytics Token Balances'));
    console.log(chalk.bold.cyan(' 20.') + chalk.white('  Statistics Activity DB'));
    console.log(chalk.bold.yellow(' 21.') + chalk.white('  Auto Mode'));
    console.log(chalk.bold.yellow(' 22.') + chalk.white('  OnChain GM Deploy'));
    console.log(chalk.bold.red('  0.') + chalk.white('  Exit'));
    console.log('');
    printLine('=', 'magenta');
}

async function main() {
    while (true) {
        showMenu();
        const choice = askQuestion(chalk.bold.cyan('\nEnter your choice (0-22): '));

        try {
            switch (choice) {
                case '1':
                    await runContractDeploy();
                    break;
                case '2':
                    await runFaucetClaim();
                    break;
                case '3':
                    await runSendToken();
                    break;
                case '4':
                    await runCreateStablecoin();
                    break;
                case '5':
                    await runSwapTokens();
                    break;
                case '6':
                    await runAddLiquidity();
                    break;
                case '7':
                    await runSetFeeToken();
                    break;
                case '8':
                    await runMintTokens();
                    break;
                case '9':
                    await runBurnTokens();
                    break;
                case '10':
                    await runTransferWithMemo();
                    break;
                case '11':
                    await runLimitOrder();
                    break;
                case '12':
                    await runRemoveLiquidity();
                    break;
                case '13':
                    await runGrantRole();
                    break;
                case '14':
                    await runNft();
                    break;
                case '15':
                    await runInfinityName();
                    break;
                case '16':
                    await runRetrieverNft();
                    break;
                case '17':
                    await runBatchOperations();
                    break;
                case '18':
                    await runTip403Policies();
                    break;
                case '19':
                    await runAnalytics();
                    break;
                case '20':
                    await runStatistics();
                    break;
                case '21':
                    await runAutoMode();
                    break;
                case '22':
                    await runOnChainGM();
                    break;
                case '0':
                    clearTerminal();
                    printLine('=', 'green');
                    console.log(chalk.bold.green('                    GOODBYE'));
                    console.log(chalk.bold.white('       Thanks for using TEMPO BOT V2!'));
                    console.log(chalk.bold.white('          Created by Kazuha with love'));
                    printLine('=', 'green');
                    process.exit(0);
                    break;
                default:
                    log('error', 'Invalid choice! Please select 0-22');
            }
        } catch (error) {
            log('error', `An error occurred: ${error.message}`);
        }

        if (choice !== '0') {
            askQuestion(chalk.bold.yellow('\nPress Enter to continue...'));
        }
    }
}

main().catch(err => {
    log('error', `Fatal Error: ${err.message}`);
    process.exit(1);
});