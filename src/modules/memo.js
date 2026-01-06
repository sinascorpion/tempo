import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, SYSTEM_CONTRACTS, TIP20_EXTENDED_ABI } from '../config/config.js';
import { getPrivateKeys, getTokenBalance } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

export async function runTransferWithMemo() {
    console.log(chalk.magenta("\n  MEMO TRANSFER MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const tokenList = Object.entries(CONFIG.TOKENS).map(([name, address]) => ({ name, address }));

    console.log(chalk.yellow('Select Token:'));
    tokenList.forEach((t, i) => console.log(chalk.blue(`  ${i + 1}. ${t.name}`)));
    let idx = parseInt(askQuestion(chalk.cyan("Choice: "))) - 1;
    if (isNaN(idx) || idx < 0) return;
    const tokenInfo = tokenList[idx];

    let amountStr = askQuestion(chalk.cyan("Amount (default 0.01): ")) || '0.01';
    let memoText = askQuestion(chalk.cyan("Memo Text (default 'test-memo'): ")) || 'test-memo';

    // Encode Memo to bytes32
    const utf8Bytes = ethers.toUtf8Bytes(memoText);
    let memoBytes32 = ethers.hexlify(utf8Bytes);
    if (utf8Bytes.length > 32) {
        log('warning', 'Memo truncated to 32 bytes');
        memoBytes32 = ethers.hexlify(utf8Bytes.slice(0, 32));
    } else {
        memoBytes32 = ethers.zeroPadBytes(memoBytes32, 32);
        // ethers.zeroPadBytes pads to left? Bytes32 usually needs right padding for strings but Solidity `bytes32` just takes 32 bytes.
        // Python code: `.ljust(32, b'\x00')` -> Right padding with zeros.
        // ethers `encodeBytes32String` handles short strings but they must be <= 31 chars (legacy limits maybe?). 
        // Better manual way:
        const bytes = new Uint8Array(32);
        bytes.set(utf8Bytes.slice(0, 32));
        memoBytes32 = ethers.hexlify(bytes);
    }

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        try {
            const tokenContract = new ethers.Contract(tokenInfo.address, TIP20_EXTENDED_ABI, wallet);
            const decimals = await tokenContract.decimals();
            const amountWei = ethers.parseUnits(amountStr, decimals);

            const balance = await tokenContract.balanceOf(wallet.address);
            if (balance < amountWei) {
                log('error', `Insufficient ${tokenInfo.name} balance`);
                continue;
            }

            const dest = ethers.Wallet.createRandom().address;
            log('info', `Sending ${amountStr} ${tokenInfo.name} to ${dest.slice(0, 10)}... (Memo: ${memoText})`);

            const tx = await tokenContract.transferWithMemo(dest, amountWei, memoBytes32);
            log('info', `TX: ${tx.hash}`);
            await tx.wait();
            log('success', 'Transfer Complete!');

        } catch (error) {
            log('error', `Failed: ${error.message}`);
        }
        await sleep(2000);
    }
}
