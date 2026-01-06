import fs from 'fs-extra';
import path from 'path';
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { log } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TOKENS_FILE = path.join(PROJECT_ROOT, 'data', 'created_tokens.json');

export function getPrivateKeys() {
    try {
        const pvPath = path.join(PROJECT_ROOT, 'pv.txt');
        if (!fs.existsSync(pvPath)) {
            log('error', 'pv.txt not found!');
            return [];
        }
        const content = fs.readFileSync(pvPath, 'utf-8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch (error) {
        log('error', `Error reading pv.txt: ${error.message}`);
        return [];
    }
}

export async function getTokenBalance(provider, walletAddress, tokenAddress, abi) {
    try {
        const contract = new ethers.Contract(tokenAddress, abi, provider);
        const balance = await contract.balanceOf(walletAddress);
        const decimals = await contract.decimals();
        const formatted = ethers.formatUnits(balance, decimals);
        return { balance, decimals, formatted };
    } catch (error) {
        return { balance: 0n, decimals: 18, formatted: '0' };
    }
}

export function loadCreatedTokens() {
    try {
        if (fs.existsSync(TOKENS_FILE)) {
            return fs.readJsonSync(TOKENS_FILE);
        }
    } catch (error) {
        log('warning', `Could not load created tokens: ${error.message}`);
    }
    return {};
}

export function saveCreatedToken(walletAddress, tokenAddress, symbol) {
    try {
        const tokens = loadCreatedTokens();
        // Normalize
        const normalizedWallet = ethers.getAddress(walletAddress);
        const normalizedToken = ethers.getAddress(tokenAddress);

        if (!tokens[normalizedWallet]) {
            tokens[normalizedWallet] = [];
        }

        const exists = tokens[normalizedWallet].some(t => t.token.toLowerCase() === normalizedToken.toLowerCase());

        if (!exists) {
            tokens[normalizedWallet].push({
                token: normalizedToken,
                symbol: symbol,
                createdAt: new Date().toISOString()
            });
            fs.outputJsonSync(TOKENS_FILE, tokens, { spaces: 2 });
        } else {
            log('warning', `Token ${symbol} already saved for this wallet.`);
        }
    } catch (error) {
        log('error', `Error saving token: ${error.message}`);
    }
}

export function getTokensForWallet(walletAddress) {
    const tokens = loadCreatedTokens();
    const normalizedWallet = ethers.getAddress(walletAddress);
    return tokens[normalizedWallet] || [];
}
