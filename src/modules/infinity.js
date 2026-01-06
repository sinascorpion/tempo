import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, INFINITY_NAME_CONTRACT, INFINITY_NAME_ABI, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { log, sleep } from '../utils/helpers.js';

function generateRandomName(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

export async function runInfinityName() {
    console.log(chalk.magenta("\n  INFINITY NAME SERVICE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        try {
            const infinity = new ethers.Contract(INFINITY_NAME_CONTRACT, INFINITY_NAME_ABI, wallet);
            const pathUsd = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);

            const domain = generateRandomName();
            log('info', `Registering: ${domain}.tempo`);

            // Check Availability
            try {
                const avail = await infinity.isAvailable(domain);
                if (!avail) {
                    log('warning', 'Domain unavailable.');
                    continue;
                }
            } catch (e) { /* ignore read error */ }

            // Approve PathUSD
            const approveAmount = ethers.parseUnits("1000", 18); // Check decimals (usually 18 for PathUSD?) Assuming standard. 
            // Python used * 10^6? Wait. 
            // In infinity.py: `approve_amount = int(1000 * (10 ** 6))`
            // But FeeManager used * 10^6. so PathUSD uses 6 decimals maybe?
            // Safer to check decimals.
            let decimals = 18;
            try {
                decimals = await pathUsd.decimals();
            } catch { }
            const amountWei = ethers.parseUnits("1000", decimals);

            const allow = await pathUsd.allowance(wallet.address, INFINITY_NAME_CONTRACT);
            if (allow < amountWei) {
                log('info', 'Approving PathUSD...');
                await (await pathUsd.approve(INFINITY_NAME_CONTRACT, ethers.MaxUint256)).wait();
            }

            log('info', 'Registering Domain...');
            const tx = await infinity.register(domain, ethers.ZeroAddress);
            log('info', `TX: ${tx.hash}`);
            await tx.wait();
            log('success', 'Domain Registered!');

        } catch (error) {
            log('error', `Failed: ${error.message}`);
        }
        await sleep(2000);
    }
}
