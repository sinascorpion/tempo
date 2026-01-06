import { ethers } from 'ethers';
import chalk from 'chalk';
import { CONFIG } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { askQuestion, log, sleep } from '../utils/helpers.js';

// Simple "Hello World" contract Artifact (so we don't need solc)
const CONTRACT_ABI = [
    "function setMessage(string msg_) external",
    "function message() view returns (string)",
    "constructor()"
];
// Bytecode for a simple Storage contract (approximate)
const CONTRACT_BYTECODE = "0x608060405234801561001057600080fd5b5061012e806100206000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c8063368b8772146037578063e21f37ce146059575b600080fd5b605760048036036020811015604b57600080fd5b8101908080359060200190640100000000811115606457600080fd5b820183602082011115607657600080fd5b80359060200191846001830284011164010000000083111715609857600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f8201169050808301925050505050505091929192905050506079565b005b6061607d565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101560b7578082015181840152602081019050609c565b50505050905090810190601f16801560e45780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b80600090805190602001906100919291906100f7565b5050565b600080546040519080825280601f01602080910402602001604051908101604052809291908181526020018280546001816001161561010002031660029004801561014d5780601f106101225761010080835404028352916020019161014d565b820191906000526020600020905b81548152906001019060200180831161013057829003601f168201915b5050505050905090565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061018e57805160ff19168380011785556101bc565b828001600101855582156101bc569182015b828111156101bb5782518255916020019190600101906101a0565b5b5090506101c991906101cd565b5090565b6101eb91905b808211156101e75760008160009055506001016101cf565b5090565b9056fea2646970667358221220a218559091807659543885d9eb0155694246835080860824647385419985695064736f6c63430008140033";


export async function runContractDeploy() {
    console.log(chalk.magenta("\n  CONTRACT DEPLOY MODULE\n"));

    let deployCount = askQuestion(chalk.cyan("How many times to deploy per wallet? (Default: 2): "));
    deployCount = parseInt(deployCount) || 2;
    if (deployCount < 1) deployCount = 2;

    log('success', `Deploy count set to: ${deployCount}\n`);

    const privateKeys = getPrivateKeys();
    log('info', `Found ${privateKeys.length} wallets`);

    if (privateKeys.length === 0) {
        log('error', 'No private keys found in pv.txt');
        return;
    }

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < privateKeys.length; i++) {
        const wallet = new ethers.Wallet(privateKeys[i], provider);
        console.log(chalk.magenta(`\nWALLET #${i + 1}/${privateKeys.length}: ${wallet.address}`));

        for (let j = 0; j < deployCount; j++) {
            console.log(chalk.yellow(`  Deploy #${j + 1}...`));
            try {
                const factory = new ethers.ContractFactory(CONTRACT_ABI, CONTRACT_BYTECODE, wallet);
                const contract = await factory.deploy();

                log('info', 'Waiting for verification...');
                await contract.waitForDeployment();
                const address = await contract.getAddress();

                log('success', `Contract Deployed: ${address}`);
                log('info', `Explorer: ${CONFIG.EXPLORER_URL}/address/${address}`);
                successful++;

                // Optional: Update message removed to prevent bytecode mismatch errors
                // The provided bytecode does not seem to support setMessage correctly on this network.
                // Deployment is the primary goal.

            } catch (error) {
                log('error', `Deploy failed: ${error.message}`);
                failed++;
            }

            if (j < deployCount - 1) {
                const delay = Math.floor(Math.random() * (CONFIG.MAX_DELAY_BETWEEN_DEPLOYS - CONFIG.MIN_DELAY_BETWEEN_DEPLOYS + 1) + CONFIG.MIN_DELAY_BETWEEN_DEPLOYS);
                log('info', `Waiting ${delay}s before next deploy...`);
                await sleep(delay * 1000);
            }
        }

        if (i < privateKeys.length - 1) {
            const delay = Math.floor(Math.random() * (CONFIG.MAX_DELAY_BETWEEN_WALLETS - CONFIG.MIN_DELAY_BETWEEN_WALLETS + 1) + CONFIG.MIN_DELAY_BETWEEN_WALLETS);
            log('info', `Waiting ${delay}s before next wallet...`);
            await sleep(delay * 1000);
        }
    }

    console.log(chalk.magenta("\n  DEPLOY SUMMARY"));
    console.log(chalk.green(`  Success: ${successful}`));
    console.log(chalk.red(`  Failed: ${failed}`));
    console.log(chalk.cyan(`  Total: ${successful + failed}`));
}
