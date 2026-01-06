import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, ONCHAINGM_ABI, ONCHAINGM_DEPLOY_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

function shortHash(hash) {
    if (!hash) return '';
    return hash.slice(0, 10) + '...' + hash.slice(-8);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function countdown(seconds, message) {
    for (let i = seconds; i > 0; i--) {
        process.stdout.write(`\r${message} ${i}s... `);
        await sleep(1000);
    }
    console.log();
}

// Simple in-memory tracker or using stats system
// For now, implementing as per snippet logic (without external persistence for cooldowns, though user snippet implies it)
// We'll mimic the "canDoGM" check with a basic date check if we had persistence, but for now we'll assume always allowed or handle errors.

function canDoGM(address) {
    // Placeholder: implementation requires persistent storage (stats.json) to know last GM.
    // Assuming always true for this session or relying on contract revert if cooldown is enforced on-chain.
    // If cooldown is local, we need to read stats.
    return { canDo: true, remainingTime: 0 };
}

function recordGM(address) {
    // Placeholder to update stats
}

async function approveOnChainGM(wallet, spenderAddress, amount) {
    try {
        const tokenContract = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);

        if (currentAllowance >= BigInt(amount)) {
            console.log(chalk.green('✓ Already approved sufficient amount'));
            return { success: true, skipped: true };
        }

        console.log(chalk.cyan('⟳ Approving PathUSD...'));
        const tx = await tokenContract.approve(spenderAddress, amount, {
            gasLimit: 100000
        });

        console.log(chalk.yellow(`Approval TX: ${shortHash(tx.hash)}`));
        await tx.wait();
        console.log(chalk.green('✓ Approval successful!'));

        return { success: true, txHash: tx.hash };

    } catch (error) {
        console.log(chalk.red(`✗ Approval failed: ${error.message}`));
        return { success: false, error: error.message };
    }
}

async function executeOnChainGM(wallet) {
    try {
        const gmContract = new ethers.Contract(CONFIG.ONCHAINGM_CONTRACT, ONCHAINGM_ABI, wallet);
        console.log(chalk.cyan('⟳ Sending GM...'));

        // Note: User snippet uses '0x00...00' as receiver. 
        const tx = await gmContract.onChainGM(ethers.ZeroAddress, {
            gasLimit: 250000
        });

        console.log(chalk.yellow(`GM TX: ${shortHash(tx.hash)}`));
        const receipt = await tx.wait();

        console.log(chalk.green('✓ GM sent successfully!'));
        return { success: true, txHash: tx.hash };

    } catch (error) {
        console.log(chalk.red(`✗ GM failed: ${error.message}`));
        return { success: false, error: error.message };
    }
}

async function executeOnChainDeploy(wallet, deployNumber, totalDeploys) {
    try {
        const deployContract = new ethers.Contract(CONFIG.ONCHAINGM_DEPLOY_CONTRACT, ONCHAINGM_DEPLOY_ABI, wallet);
        console.log(chalk.cyan(`⟳ Deploying contract ${deployNumber}/${totalDeploys}...`));

        const tx = await deployContract.deploy({
            gasLimit: 250000
        });

        console.log(chalk.yellow(`Deploy TX: ${shortHash(tx.hash)}`));
        const receipt = await tx.wait();

        console.log(chalk.green('✓ Contract deployed successfully!'));
        return { success: true, txHash: tx.hash };

    } catch (error) {
        console.log(chalk.red(`✗ Deploy failed: ${error.message}`));
        return { success: false, error: error.message };
    }
}

export async function runOnChainGM() {
    console.log(chalk.magenta("\n  ONCHAIN GM MODULE\n"));

    console.log(chalk.blue('  1. Send GM (Daily)'));
    console.log(chalk.blue('  2. Deploy Contracts (Unlimited)'));

    const choice = askQuestion(chalk.cyan("Choice (1-2): "));
    const privateKeys = getPrivateKeys();
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    if (choice === '1') {
        if (CONFIG.ONCHAINGM_CONTRACT === ethers.ZeroAddress) {
            console.log(chalk.red("Error: ONCHAINGM_CONTRACT not set in config.js"));
            return;
        }

        for (let w = 0; w < privateKeys.length; w++) {
            const wallet = new ethers.Wallet(privateKeys[w], provider);
            console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

            const requiredAmount = BigInt(CONFIG.ONCHAINGM_FEE);
            const approval = await approveOnChainGM(wallet, CONFIG.ONCHAINGM_CONTRACT, requiredAmount);
            if (!approval.success) continue;

            await executeOnChainGM(wallet);
            await sleep(2000);
        }

    } else if (choice === '2') {
        if (CONFIG.ONCHAINGM_DEPLOY_CONTRACT === ethers.ZeroAddress) {
            console.log(chalk.red("Error: ONCHAINGM_DEPLOY_CONTRACT not set in config.js"));
            return;
        }

        const count = parseInt(askQuestion(chalk.cyan("Number of deploys per wallet: "))) || 1;

        for (let w = 0; w < privateKeys.length; w++) {
            const wallet = new ethers.Wallet(privateKeys[w], provider);
            console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

            const totalRequired = BigInt(CONFIG.ONCHAINGM_DEPLOY_FEE) * BigInt(count);
            const approval = await approveOnChainGM(wallet, CONFIG.ONCHAINGM_DEPLOY_CONTRACT, totalRequired);
            if (!approval.success) continue;

            for (let i = 0; i < count; i++) {
                await executeOnChainDeploy(wallet, i + 1, count);
                await sleep(1000);
            }
        }
    }
}
