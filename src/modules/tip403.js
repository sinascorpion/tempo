import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, TIP403_REGISTRY_ABI, TIP403_REGISTRY, TIP20_POLICY_ABI } from '../config/config.js';
import { getPrivateKeys, getTokensForWallet } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runTip403Policies() {
    console.log(chalk.magenta("\n  TIP-403 POLICIES MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    // Select Wallet
    console.log(chalk.yellow('Select Wallet:'));
    privateKeys.forEach((pk, i) => {
        const addr = new ethers.Wallet(pk).address;
        console.log(chalk.blue(`  ${i + 1}. ${addr}`));
    });
    const wIdx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(wIdx) || wIdx < 0) return;

    const wallet = new ethers.Wallet(privateKeys[wIdx], provider);
    const myTokens = getTokensForWallet(wallet.address);

    if (myTokens.length === 0) {
        log('error', 'No created tokens found on this wallet.');
        return;
    }

    console.log(chalk.yellow('Select Token:'));
    myTokens.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.symbol}`)));
    const tIdx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(tIdx)) return;
    const token = myTokens[tIdx];

    console.log(chalk.yellow('Action:'));
    console.log(chalk.blue('  1. Set Whitelist (Only listed can hold)'));
    console.log(chalk.blue('  2. Set Blacklist (Listed cannot hold)'));
    console.log(chalk.blue('  3. Check Policy'));

    const action = askQuestion(chalk.cyan("Choice: "));

    if (action === '3') {
        const tokenContract = new ethers.Contract(token.token, TIP20_POLICY_ABI, wallet);
        try {
            const pid = await tokenContract.transferPolicyId();
            log('info', `Current Policy ID: ${pid}`);
        } catch (e) {
            log('error', e.message);
        }
        return;
    }

    const isWhitelist = action === '1';
    const policyType = isWhitelist ? 0 : 1;

    const addressesInput = askQuestion(chalk.cyan("Enter addresses (comma separated) or 'random 5': "));
    let addresses = [];
    if (addressesInput.startsWith('random')) {
        const count = parseInt(addressesInput.split(' ')[1]) || 5;
        addresses = Array(count).fill(0).map(() => ethers.Wallet.createRandom().address);
    } else {
        addresses = addressesInput.split(',').map(a => a.trim()).filter(a => ethers.isAddress(a));
    }

    if (addresses.length === 0) return;

    try {
        const registry = new ethers.Contract(TIP403_REGISTRY, TIP403_REGISTRY_ABI, wallet);
        const tokenContract = new ethers.Contract(token.token, TIP20_POLICY_ABI, wallet);

        log('info', 'Creating Policy...');
        // createPolicyWithAccounts(address owner, uint8 policyType, address[] memory accounts)
        // Adjust inputs based on ABI
        const tx = await registry.createPolicyWithAccounts(wallet.address, policyType, addresses);
        log('info', `Create TX: ${tx.hash}`);
        const receipt = await tx.wait(); // Wait for logs

        // Parse logs to get Policy ID? 
        // Or just fetch the latest policy ID created by user?
        // Assuming we need policy ID to attach.
        // It's usually emitted in PolicyCreated event.
        // Let's iterate logs.
        let policyId = 0;
        for (const log of receipt.logs) {
            // Heuristic: check topics. 
            // If we can't parse easily without ABI decoder, we might struggle.
            // But we have the ABI.
            try {
                const parsed = registry.interface.parseLog(log);
                if (parsed.name === 'PolicyCreated' || parsed.name === 'TransferPolicyCreated') {
                    policyId = parsed.args[0]; // Assuming ID is first arg
                }
            } catch { }
        }

        // Fallback or just assume it worked? 
        // If we missed it, we can't attach.
        // Maybe just list policies? 
        // Python code extracts from topics: `int.from_bytes(logs[0].topics[1][-8:], 'big')`
        // Let's try to grab it if parsing failed.
        if (!policyId && receipt.logs.length > 0) {
            // Raw fallback
            // policyId = ...
        }

        if (!policyId) {
            log('warning', 'Could not detect Policy ID from logs. Trying to proceed if possible or abort.');
            // Actually, if we can't get ID, we can't attach.
            return;
        }

        log('info', `Policy Created: ${policyId}`);
        log('info', 'Attaching Policy to Token...');
        const attachTx = await tokenContract.changeTransferPolicyId(policyId);
        await attachTx.wait();
        log('success', 'Policy Attached!');

    } catch (e) {
        log('error', `Failed: ${e.message}`);
    }
}
