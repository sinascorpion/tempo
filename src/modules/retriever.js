import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG, RETRIEVER_NFT_CONTRACT, RETRIEVER_NFT_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { log, sleep } from '../utils/helpers.js';

export async function runRetrieverNft() {
    console.log(chalk.magenta("\n  RETRIEVER NFT MODULE\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        try {
            const nft = new ethers.Contract(RETRIEVER_NFT_CONTRACT, RETRIEVER_NFT_ABI, wallet);

            const balBefore = await nft.balanceOf(wallet.address);
            console.log(chalk.blue(`  Balance Before: ${balBefore}`));

            const allowlistProof = {
                proof: [],
                quantityLimitPerWallet: ethers.MaxUint256,
                pricePerToken: 0,
                currency: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" // ETH sentinel
            };

            log('info', 'Minting...');
            const tx = await nft.claim(
                wallet.address,
                1,
                "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                0,
                allowlistProof,
                "0x"
            );
            log('info', `TX: ${tx.hash}`);
            await tx.wait();

            const balAfter = await nft.balanceOf(wallet.address);
            log('success', `Minted! Balance After: ${balAfter}`);

        } catch (error) {
            log('error', `Failed: ${error.message}`);
        }
        await sleep(2000);
    }
}
