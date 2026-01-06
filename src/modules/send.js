import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys, getTokenBalance } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runSendToken() {
    console.log(chalk.magenta("\n  SEND TOKEN MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) {
        log('error', 'No private keys found');
        return;
    }

    const tokenList = Object.entries(CONFIG.TOKENS).map(([name, address]) => ({ name, address }));
    console.log(chalk.yellow('Available Tokens:'));
    tokenList.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.name}`)));
    console.log(chalk.blue(`  ${tokenList.length + 1}. All Tokens`));

    let tokenIndex = parseInt(askQuestion(chalk.cyan("Select token (number): "))) - 1;
    if (isNaN(tokenIndex) || tokenIndex < 0 || tokenIndex > tokenList.length) {
        log('error', 'Invalid selection');
        return;
    }

    const useRandomAddress = askQuestion(chalk.cyan("To Random Address? (y/n, default y): ")).toLowerCase() !== 'n';
    let toAddress = null;
    if (!useRandomAddress) {
        toAddress = askQuestion(chalk.cyan("Enter recipient address: "));
        if (!ethers.isAddress(toAddress)) {
            log('error', 'Invalid address');
            return;
        }
    }

    let amount = parseFloat(askQuestion(chalk.cyan("Amount to send (default 1): "))) || 1;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const tokensToSend = (tokenIndex === tokenList.length) ? tokenList : [tokenList[tokenIndex]];

    let successful = 0;
    let failed = 0;

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}/${privateKeys.length}: ${wallet.address}`));

        for (const token of tokensToSend) {
            const dest = useRandomAddress ? ethers.Wallet.createRandom().address : toAddress;
            log('info', `Sending ${amount} ${token.name} to ${dest.substring(0, 10)}...`);

            try {
                const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
                const decimals = await contract.decimals();
                const amountWei = ethers.parseUnits(amount.toString(), decimals);

                const balance = await contract.balanceOf(wallet.address);
                if (balance < amountWei) {
                    log('error', `Insufficient balance for ${token.name}`);
                    continue;
                }

                const tx = await contract.transfer(dest, amountWei);
                log('info', `TX Sent: ${tx.hash}`);
                await tx.wait();
                log('success', 'Transfer confirmed!');
                successful++;
            } catch (error) {
                log('error', `Transfer failed: ${error.message}`);
                failed++;
            }
            await sleep(2000);
        }

        if (w < privateKeys.length - 1) {
            const delay = Math.floor(Math.random() * 5) + 5;
            log('info', `Waiting ${delay}s before next wallet...`);
            await sleep(delay * 1000);
        }
    }

    console.log(chalk.magenta("\n  SEND SUMMARY"));
    console.log(chalk.green(`  Success: ${successful}`));
    console.log(chalk.red(`  Failed: ${failed}`));
}
