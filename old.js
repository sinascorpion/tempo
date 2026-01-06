const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const readline = require('readline');
const https = require('https');

const CONFIG = {
    RPC_URL: 'https://rpc.testnet.tempo.xyz',
    CHAIN_ID: 42429,
    EXPLORER_URL: 'https://explore.tempo.xyz',
    GAS_LIMIT: 3000000,
    MIN_DELAY_BETWEEN_WALLETS: 5,
    MAX_DELAY_BETWEEN_WALLETS: 30,
    MIN_DELAY_BETWEEN_DEPLOYS: 3,
    MAX_DELAY_BETWEEN_DEPLOYS: 10,
    FAUCET_CLAIM_DELAY_SEC: 15,
    FAUCET_FINISH_DELAY_SEC: 30,
    FAUCET_PRE_CLAIM_MS: 4000,
    TOKENS: {
        'PathUSD': '0x20c0000000000000000000000000000000000000',
        'AlphaUSD': '0x20c0000000000000000000000000000000000001',
        'BetaUSD': '0x20c0000000000000000000000000000000000002',
        'ThetaUSD': '0x20c0000000000000000000000000000000000003'
    },
    FAUCET_TOKENS: [
        { symbol: 'PathUSD', amount: '1,000,000' },
        { symbol: 'AlphaUSD', amount: '1,000,000' },
        { symbol: 'BetaUSD', amount: '1,000,000' },
        { symbol: 'ThetaUSD', amount: '1,000,000' }
    ],
    DOMAIN_REGISTRY_ADDRESS: '0x70a57AF45CD15f1565808CF7b1070bAc363aFD8a',
    DOMAIN_PAYMENT_TOKEN: '0x20c0000000000000000000000000000000000000',
    DOMAIN_REGISTRATION_FEE: '320000',
    DOMAIN_SUFFIX: '.tempo',
    ONCHAINGM_CONTRACT: '0x2d91014C9Ab33821C4Fa15806c63D2C053cdD10c',
    ONCHAINGM_DEPLOY_CONTRACT: '0xa89E3e260C85d19c0b940245FDdb1e845C93dED8',
    ONCHAINGM_FEE: '15000000',
    ONCHAINGM_DEPLOY_FEE: '20000000',
    ONCHAINGM_COOLDOWN_FILE: 'gm_cooldowns.json',
    ONCHAINGM_COOLDOWN_HOURS: 24,
    OMNIHUB_API_URL: 'https://api-v2.omnihub.xyz',
    OMNIHUB_NFT_CONTRACT: '0x960601A1180570CceC973E524301d688E20a24c2',
    OMNIHUB_COLLECTION_ID: '737491'
};

const ERC20_ABI = [
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function symbol() view returns (string)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)'
];

const DOMAIN_REGISTRY_ABI = [
    'function register(string name, address resolver) external',
    'function getRegistrationFee() view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function balanceOf(address owner) view returns (uint256)'
];

const ONCHAINGM_ABI = [
    'function onChainGM(address referrer) external',
    'function lastGMTime(address) view returns (uint256)'
];

const ONCHAINGM_DEPLOY_ABI = [
    'function deploy() external'
];

const OMNIHUB_NFT_ABI = [
    'function mint(uint256 phaseIndex, uint256 quantity, address referrer, bytes32[] calldata proof) external',
    'function balanceOf(address owner) view returns (uint256)',
    'function totalSupply() view returns (uint256)'
];

let rl = null;

function getRL() {
    if (!rl) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
    return rl;
}

function askQuestion(question) {
    return new Promise((resolve) => {
        const rli = getRL();
        rli.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ HTTP REQUEST HELPER ============

function httpRequest(url, method, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://omnihub.xyz',
                'Referer': 'https://omnihub.xyz/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
                ...headers
            }
        };
        
        if (data) {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }
        
        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${responseData.slice(0, 100)}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

function getContractSource() {
    return `
pragma solidity ^0.8.20;
contract MyContract {
    string public message = "Hello Tempo!";
    event MessageUpdated(address indexed user, string newMessage);
    function setMessage(string calldata msg_) external {
        message = msg_;
        emit MessageUpdated(msg.sender, msg_);
    }
}
`;
}

function compileContract(source) {
    console.log('\x1b[1m\x1b[36mCompiling contract...\x1b[0m');
    const input = {
        language: 'Solidity',
        sources: { 'MyContract.sol': { content: source } },
        settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }, optimizer: { enabled: true, runs: 200 } }
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) throw new Error('Contract compilation failed');
    }
    const contract = output.contracts['MyContract.sol']['MyContract'];
    console.log('\x1b[1m\x1b[32mContract compiled successfully!\x1b[0m\n');
    return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

function getPrivateKeys() {
    try {
        const content = fs.readFileSync('pv.txt', 'utf8');
        return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    } catch (error) {
        console.log('\x1b[1m\x1b[31mError reading pv.txt: ' + error.message + '\x1b[0m');
        return [];
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomMessage() {
    const messages = ["Hello Tempo", "GM Tempo", "GN Tempo", "Testing Tempo", "Done Tempo", "Success Tempo"];
    return messages[Math.floor(Math.random() * messages.length)];
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function shortHash(hash) {
    return hash.slice(0, 10) + '...' + hash.slice(-6);
}

async function countdown(seconds, message = 'Next action in') {
    for (let i = seconds; i > 0; i--) {
        process.stdout.write(`\r\x1b[1m\x1b[33m${message}: ${formatTime(i)}   \x1b[0m`);
        await sleep(1000);
    }
    process.stdout.write(`\r\x1b[1m\x1b[32m${message}: Ready!                              \x1b[0m\n`);
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function animatedSpinner(ms, text) {
    const startTime = Date.now();
    let frameIndex = 0;
    
    while (Date.now() - startTime < ms) {
        process.stdout.write(`\r\x1b[1m\x1b[36m${spinnerFrames[frameIndex]} ${text}\x1b[0m`);
        frameIndex = (frameIndex + 1) % spinnerFrames.length;
        await sleep(80);
    }
    process.stdout.write('\r' + ' '.repeat(text.length + 10) + '\r');
}

function loadGMCooldowns() {
    try {
        if (fs.existsSync(CONFIG.ONCHAINGM_COOLDOWN_FILE)) {
            const data = fs.readFileSync(CONFIG.ONCHAINGM_COOLDOWN_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('\x1b[1m\x1b[33mCooldown file not found, creating new one...\x1b[0m');
    }
    return {};
}

function saveGMCooldowns(cooldowns) {
    try {
        fs.writeFileSync(CONFIG.ONCHAINGM_COOLDOWN_FILE, JSON.stringify(cooldowns, null, 2));
    } catch (error) {
        console.log('\x1b[1m\x1b[31mError saving cooldowns: ' + error.message + '\x1b[0m');
    }
}

function canDoGM(address) {
    const cooldowns = loadGMCooldowns();
    const lastGM = cooldowns[address.toLowerCase()];
    
    if (!lastGM) return { canDo: true, remainingTime: 0 };
    
    const now = Date.now();
    const cooldownMs = CONFIG.ONCHAINGM_COOLDOWN_HOURS * 60 * 60 * 1000;
    const timePassed = now - lastGM;
    
    if (timePassed >= cooldownMs) {
        return { canDo: true, remainingTime: 0 };
    }
    
    const remainingMs = cooldownMs - timePassed;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    
    return { canDo: false, remainingTime: remainingSeconds };
}

function recordGM(address) {
    const cooldowns = loadGMCooldowns();
    cooldowns[address.toLowerCase()] = Date.now();
    saveGMCooldowns(cooldowns);
}

function generateRandomDomainName() {
    const prefixes = ['crypto', 'web3', 'meta', 'defi', 'nft', 'dao', 'eth', 'tempo', 'chain', 'block', 'pixel', 'cyber', 'nova', 'alpha', 'beta', 'gamma', 'delta', 'omega', 'zen', 'neo', 'super', 'hyper', 'ultra', 'mega', 'giga', 'turbo', 'swift', 'flash', 'storm', 'thunder'];
    const suffixes = ['hub', 'lab', 'pro', 'dev', 'io', 'xyz', 'ai', 'fi', 'x', 'max', 'plus', 'prime', 'core', 'net', 'tech', 'node', 'vault', 'zone', 'base', 'port', 'wave', 'pulse', 'flow', 'mint', 'swap', 'pay', 'cash', 'gold', 'star', 'moon'];
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const number = Math.floor(Math.random() * 10000);
    
    const patterns = [
        `${prefix}${suffix}`,
        `${prefix}${suffix}${number}`,
        `${prefix}${number}`,
        `${prefix}${number}${suffix}`,
        `${suffix}${prefix}`,
        `${suffix}${prefix}${number}`,
        `${prefix}${Math.floor(Math.random() * 100)}${suffix}`,
        `${prefix}${suffix}${Math.floor(Math.random() * 100)}`,
    ];
    
    const name = patterns[Math.floor(Math.random() * patterns.length)].toLowerCase();
    return name.replace(/[^a-z0-9]/g, '');
}

function validateDomainName(name) {
    const validPattern = /^[a-z0-9]+$/;
    
    if (!name || name.length < 3) {
        return { valid: false, reason: 'Domain name must be at least 3 characters' };
    }
    
    if (name.length > 32) {
        return { valid: false, reason: 'Domain name must be 32 characters or less' };
    }
    
    if (!validPattern.test(name)) {
        return { valid: false, reason: 'Domain name can only contain lowercase letters (a-z) and numbers (0-9).' };
    }
    
    return { valid: true };
}

function sanitizeDomainName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ============ GET ALL TOKEN BALANCES ============

async function getAllTokenBalances(wallet) {
    const balances = {};
    
    for (const [symbol, address] of Object.entries(CONFIG.TOKENS)) {
        try {
            const contract = new ethers.Contract(address, ERC20_ABI, wallet);
            const balance = await contract.balanceOf(wallet.address);
            const decimals = await contract.decimals();
            balances[symbol] = {
                balance,
                decimals,
                formatted: ethers.formatUnits(balance, decimals)
            };
        } catch (error) {
            balances[symbol] = { balance: 0n, decimals: 6, formatted: '0' };
        }
    }
    
    return balances;
}

async function displayTokenBalances(wallet) {
    const balances = await getAllTokenBalances(wallet);
    
    console.log('\x1b[1m\x1b[34mToken Balances:\x1b[0m');
    for (const [symbol, info] of Object.entries(balances)) {
        const formatted = parseFloat(info.formatted).toLocaleString('en-US', { maximumFractionDigits: 2 });
        console.log(`\x1b[1m\x1b[36m  ${symbol}: ${formatted}\x1b[0m`);
    }
    console.log();
    
    return balances;
}

// ============ OMNIHUB NFT MODULE ============

async function omniHubRequestNonce(address) {
    try {
        const data = await httpRequest(
            `${CONFIG.OMNIHUB_API_URL}/auth/request-nonce`,
            'POST',
            { address }
        );
        return { success: true, nonce: data.nonce };
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Request nonce failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function omniHubLogin(address, signature) {
    try {
        const data = await httpRequest(
            `${CONFIG.OMNIHUB_API_URL}/auth/login`,
            'POST',
            { address, signature }
        );
        return { success: true, token: data.token.token, user: data.user };
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Login failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function omniHubVerifyPhase(token, collectionId) {
    try {
        const data = await httpRequest(
            `${CONFIG.OMNIHUB_API_URL}/collections/${collectionId}/phases/verify`,
            'GET',
            null,
            { 'Authorization': `Bearer ${token}` }
        );
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function omniHubAuthenticate(wallet) {
    console.log('\x1b[1m\x1b[36m⟳ Authenticating with OmniHub...\x1b[0m');
    
    await animatedSpinner(1500, 'Requesting nonce...');
    const nonceResult = await omniHubRequestNonce(wallet.address);
    
    if (!nonceResult.success) {
        return { success: false, error: 'Failed to get nonce' };
    }
    
    console.log('\x1b[1m\x1b[32m✓ Nonce received\x1b[0m');
    
    await animatedSpinner(1000, 'Signing message...');
    
    try {
        const signature = await wallet.signMessage(nonceResult.nonce);
        console.log('\x1b[1m\x1b[32m✓ Message signed\x1b[0m');
        
        await animatedSpinner(1500, 'Logging in...');
        const loginResult = await omniHubLogin(wallet.address, signature);
        
        if (!loginResult.success) {
            return { success: false, error: 'Login failed' };
        }
        
        console.log('\x1b[1m\x1b[32m✓ Logged in successfully\x1b[0m');
        console.log(`\x1b[1m\x1b[34mUser ID: ${loginResult.user.id}\x1b[0m`);
        
        await animatedSpinner(1000, 'Verifying mint phase...');
        const verifyResult = await omniHubVerifyPhase(loginResult.token, CONFIG.OMNIHUB_COLLECTION_ID);
        
        if (!verifyResult.success) {
            console.log('\x1b[1m\x1b[33m⚠ Phase verification (public mint)\x1b[0m');
        } else {
            console.log('\x1b[1m\x1b[32m✓ Phase verified\x1b[0m');
        }
        
        return { success: true, token: loginResult.token, user: loginResult.user };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Signing failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function omniHubMintNFT(wallet, quantity = 1) {
    try {
        const nftContract = new ethers.Contract(CONFIG.OMNIHUB_NFT_CONTRACT, OMNIHUB_NFT_ABI, wallet);
        
        console.log(`\x1b[1m\x1b[36m⟳ Minting ${quantity} NFT(s)...\x1b[0m`);
        
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await nftContract.mint(
            0,
            quantity,
            '0x0000000000000000000000000000000000000000',
            [],
            {
                gasLimit: 250000,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            }
        );
        
        console.log(`\x1b[1m\x1b[33mMint TX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('Mint transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32m✓ NFT(s) minted successfully!\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}\x1b[0m`);
        
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() === CONFIG.OMNIHUB_NFT_CONTRACT.toLowerCase()) {
                if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    if (log.topics.length >= 4) {
                        const tokenId = BigInt(log.topics[3]);
                        console.log(`\x1b[1m\x1b[35mToken ID: ${tokenId}\x1b[0m`);
                    }
                }
                if (log.topics[0] === '0x25b428dfde728ccfaddad7e29e4ac23c24ed7fd1a6e3e3f91894a9a073f5dfff') {
                    console.log(`\x1b[1m\x1b[35mMinted Event Detected\x1b[0m`);
                }
            }
        }
        
        return { success: true, txHash: tx.hash };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Mint failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function runOmniHubMint() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m         OMNIHUB NFT MINT MODULE           \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    console.log('\x1b[1m\x1b[33mCollection: OmniHub NFT\x1b[0m');
    console.log('\x1b[1m\x1b[33mContract: ' + CONFIG.OMNIHUB_NFT_CONTRACT + '\x1b[0m');
    console.log('\x1b[1m\x1b[33mFee: ThetaUSD (Gas only - Free Mint)\x1b[0m\n');
    
    try {
        const privateKeys = getPrivateKeys();
        console.log(`\x1b[1m\x1b[36mFound ${privateKeys.length} wallet(s)\x1b[0m\n`);
        
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found in pv.txt\x1b[0m');
            await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
            return;
        }
        
        let mintCount = 1;
        while (true) {
            const input = await askQuestion('\x1b[1m\x1b[36mNumber of mints per wallet (1-10): \x1b[0m');
            const v = parseInt(input);
            if (!isNaN(v) && v >= 1 && v <= 10) {
                mintCount = v;
                break;
            }
            console.log('\x1b[1m\x1b[31mEnter a number between 1 - 10\x1b[0m');
        }
        
        console.log(`\n\x1b[1m\x1b[32mMint count set to: ${mintCount}\x1b[0m\n`);
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        
        const allResults = [];
        
        for (let w = 0; w < wallets.length; w++) {
            const wallet = wallets[w];
            
            console.log('\x1b[90m────────────────────────────────────────────\x1b[0m');
            console.log(`\x1b[1m\x1b[35mWALLET #${w + 1}/${wallets.length}\x1b[0m`);
            console.log(`\x1b[1m\x1b[36mAddress: ${wallet.address}\x1b[0m\n`);
            
            await displayTokenBalances(wallet);
            
            const authResult = await omniHubAuthenticate(wallet);
            
            if (!authResult.success) {
                console.log('\x1b[1m\x1b[31m✗ Authentication failed, skipping wallet\x1b[0m');
                allResults.push({ wallet: wallet.address, success: false, reason: 'auth_failed' });
                continue;
            }
            
            await countdown(getRandomInt(2, 4), 'Starting mint in');
            
            for (let m = 1; m <= mintCount; m++) {
                console.log(`\n\x1b[1m\x1b[35m--- Mint ${m}/${mintCount} ---\x1b[0m`);
                
                await animatedSpinner(2000, 'Preparing mint transaction...');
                const mintResult = await omniHubMintNFT(wallet, 1);
                
                allResults.push({
                    wallet: wallet.address,
                    mintNumber: m,
                    ...mintResult
                });
                
                if (m < mintCount) {
                    await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_DEPLOYS, CONFIG.MAX_DELAY_BETWEEN_DEPLOYS), 'Next mint in');
                }
            }
            
            if (w < wallets.length - 1) {
                console.log();
                await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_WALLETS, CONFIG.MAX_DELAY_BETWEEN_WALLETS), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[90m────────────────────────────────────────────\x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m        OMNIHUB NFT MINT SUMMARY           \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        
        const successful = allResults.filter(r => r.success);
        const failed = allResults.filter(r => !r.success);
        
        console.log(`\x1b[1m\x1b[32mSuccessful Mints: ${successful.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[36mTotal Attempts: ${allResults.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[33mWallets: ${wallets.length}\x1b[0m`);
        
        console.log('\n\x1b[1m\x1b[32mOmniHub NFT Mint completed.\x1b[0m\n');
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mOmniHub Mint Error: ${error.message}\x1b[0m`);
    }
    
    await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
}

// ============ ONCHAINGM MODULE ============

async function approveOnChainGM(wallet, spenderAddress, amount) {
    try {
        const tokenContract = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
        
        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        
        if (currentAllowance >= BigInt(amount)) {
            console.log('\x1b[1m\x1b[32m✓ Already approved sufficient amount\x1b[0m');
            return { success: true, skipped: true };
        }
        
        console.log('\x1b[1m\x1b[36m⟳ Approving PathUSD...\x1b[0m');
        
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await tokenContract.approve(
            spenderAddress,
            amount,
            {
                gasLimit: 50000,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            }
        );
        
        console.log(`\x1b[1m\x1b[33mApproval TX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('Approval transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32m✓ Approval successful! Block: ${receipt.blockNumber}\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}\x1b[0m`);
        
        return { success: true, txHash: tx.hash };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Approval failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function executeOnChainGM(wallet) {
    try {
        const gmContract = new ethers.Contract(CONFIG.ONCHAINGM_CONTRACT, ONCHAINGM_ABI, wallet);
        
        console.log('\x1b[1m\x1b[36m⟳ Sending GM...\x1b[0m');
        
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await gmContract.onChainGM(
            '0x0000000000000000000000000000000000000000',
            {
                gasLimit: 250000,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            }
        );
        
        console.log(`\x1b[1m\x1b[33mGM TX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('GM transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32m✓ GM sent successfully!\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}\x1b[0m`);
        
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() === CONFIG.ONCHAINGM_CONTRACT.toLowerCase()) {
                if (log.topics[0] === '0x76feec8f634d54c51dce46c46adbd8d7d205e7ae324e069cd71285f00be1f159') {
                    const tokenId = BigInt(log.topics[3]);
                    console.log(`\x1b[1m\x1b[35mNFT Token ID: ${tokenId}\x1b[0m`);
                }
            }
        }
        
        return { success: true, txHash: tx.hash };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ GM failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function executeOnChainDeploy(wallet, deployNumber, totalDeploys) {
    try {
        const deployContract = new ethers.Contract(CONFIG.ONCHAINGM_DEPLOY_CONTRACT, ONCHAINGM_DEPLOY_ABI, wallet);
        
        console.log(`\x1b[1m\x1b[36m⟳ Deploying contract ${deployNumber}/${totalDeploys}...\x1b[0m`);
        
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await deployContract.deploy({
            gasLimit: 250000,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        });
        
        console.log(`\x1b[1m\x1b[33mDeploy TX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('Deploy transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32m✓ Contract deployed successfully!\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}\x1b[0m`);
        
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() === CONFIG.ONCHAINGM_DEPLOY_CONTRACT.toLowerCase()) {
                if (log.topics[0] === '0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688') {
                    const deployedAddress = '0x' + log.data.slice(26, 66);
                    console.log(`\x1b[1m\x1b[35mDeployed Contract: ${deployedAddress}\x1b[0m`);
                }
            }
        }
        
        return { success: true, txHash: tx.hash };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Deploy failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function runOnChainGM() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m          ONCHAIN GM MODULE                \x1b[0m');
    console.log('\x1b[1m\x1b[36m       (Daily - 24 Hour Cooldown)          \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    console.log('\x1b[1m\x1b[33mCost: 15 PathUSD per GM\x1b[0m');
    console.log('\x1b[1m\x1b[33mCooldown: 24 hours per wallet\x1b[0m\n');
    
    try {
        const privateKeys = getPrivateKeys();
        console.log(`\x1b[1m\x1b[36mFound ${privateKeys.length} wallet(s)\x1b[0m\n`);
        
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found in pv.txt\x1b[0m');
            await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
            return;
        }
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        
        const allResults = [];
        
        for (let w = 0; w < wallets.length; w++) {
            const wallet = wallets[w];
            
            console.log('\x1b[90m────────────────────────────────────────────\x1b[0m');
            console.log(`\x1b[1m\x1b[35mWALLET #${w + 1}/${wallets.length}\x1b[0m`);
            console.log(`\x1b[1m\x1b[36mAddress: ${wallet.address}\x1b[0m\n`);
            
            const cooldownStatus = canDoGM(wallet.address);
            
            if (!cooldownStatus.canDo) {
                console.log(`\x1b[1m\x1b[33m⏳ Cooldown active. Time remaining: ${formatTime(cooldownStatus.remainingTime)}\x1b[0m`);
                console.log('\x1b[1m\x1b[33mSkipping this wallet...\x1b[0m');
                allResults.push({ wallet: wallet.address, success: false, reason: 'cooldown' });
                continue;
            }
            
            const tokenContract = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
            const balance = await tokenContract.balanceOf(wallet.address);
            const decimals = await tokenContract.decimals();
            const formattedBalance = ethers.formatUnits(balance, decimals);
            
            console.log(`\x1b[1m\x1b[34mPathUSD Balance: ${parseFloat(formattedBalance).toLocaleString('en-US', { maximumFractionDigits: 2 })}\x1b[0m`);
            
            const requiredAmount = BigInt(CONFIG.ONCHAINGM_FEE);
            
            if (balance < requiredAmount) {
                console.log(`\x1b[1m\x1b[31m✗ Insufficient PathUSD. Need: 15, Have: ${formattedBalance}\x1b[0m`);
                allResults.push({ wallet: wallet.address, success: false, reason: 'insufficient_balance' });
                continue;
            }
            
            await animatedSpinner(2000, 'Preparing approval...');
            const approvalResult = await approveOnChainGM(wallet, CONFIG.ONCHAINGM_CONTRACT, requiredAmount.toString());
            
            if (!approvalResult.success) {
                allResults.push({ wallet: wallet.address, success: false, reason: 'approval_failed' });
                continue;
            }
            
            if (!approvalResult.skipped) {
                await countdown(getRandomInt(3, 5), 'Sending GM in');
            }
            
            await animatedSpinner(2000, 'Preparing GM...');
            const gmResult = await executeOnChainGM(wallet);
            
            if (gmResult.success) {
                recordGM(wallet.address);
                allResults.push({ wallet: wallet.address, success: true, txHash: gmResult.txHash });
            } else {
                allResults.push({ wallet: wallet.address, success: false, reason: gmResult.error });
            }
            
            if (w < wallets.length - 1) {
                console.log();
                await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_WALLETS, CONFIG.MAX_DELAY_BETWEEN_WALLETS), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[90m────────────────────────────────────────────\x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m           ONCHAIN GM SUMMARY              \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        
        const successful = allResults.filter(r => r.success);
        const failed = allResults.filter(r => !r.success && r.reason !== 'cooldown');
        const cooldownSkipped = allResults.filter(r => r.reason === 'cooldown');
        
        console.log(`\x1b[1m\x1b[32mSuccessful: ${successful.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[33mOn Cooldown: ${cooldownSkipped.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[36mTotal Wallets: ${wallets.length}\x1b[0m`);
        
        console.log('\n\x1b[1m\x1b[32mOnChain GM completed.\x1b[0m\n');
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mOnChain GM Error: ${error.message}\x1b[0m`);
    }
    
    await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
}

async function runOnChainDeploy() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m        DEPLOY ON CHAIN MODULE             \x1b[0m');
    console.log('\x1b[1m\x1b[36m          (No Cooldown - Unlimited)        \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    console.log('\x1b[1m\x1b[33mCost: 20 PathUSD per deploy\x1b[0m');
    console.log('\x1b[1m\x1b[33mNo cooldown - deploy as many as you want!\x1b[0m\n');
    
    try {
        const privateKeys = getPrivateKeys();
        console.log(`\x1b[1m\x1b[36mFound ${privateKeys.length} wallet(s)\x1b[0m\n`);
        
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found in pv.txt\x1b[0m');
            await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
            return;
        }
        
        let deployCount = 1;
        while (true) {
            const input = await askQuestion('\x1b[1m\x1b[36mNumber of deploys per wallet (1-100): \x1b[0m');
            const v = parseInt(input);
            if (!isNaN(v) && v >= 1 && v <= 100) {
                deployCount = v;
                break;
            }
            console.log('\x1b[1m\x1b[31mEnter a number between 1 - 100\x1b[0m');
        }
        
        console.log(`\n\x1b[1m\x1b[32mDeploy count set to: ${deployCount}\x1b[0m`);
        console.log(`\x1b[1m\x1b[33mTotal cost per wallet: ${deployCount * 20} PathUSD\x1b[0m\n`);
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        
        const allResults = [];
        
        for (let w = 0; w < wallets.length; w++) {
            const wallet = wallets[w];
            
            console.log('\x1b[90m────────────────────────────────────────────\x1b[0m');
            console.log(`\x1b[1m\x1b[35mWALLET #${w + 1}/${wallets.length}\x1b[0m`);
            console.log(`\x1b[1m\x1b[36mAddress: ${wallet.address}\x1b[0m\n`);
            
            const tokenContract = new ethers.Contract(CONFIG.TOKENS.PathUSD, ERC20_ABI, wallet);
            const balance = await tokenContract.balanceOf(wallet.address);
            const decimals = await tokenContract.decimals();
            const formattedBalance = ethers.formatUnits(balance, decimals);
            
            console.log(`\x1b[1m\x1b[34mPathUSD Balance: ${parseFloat(formattedBalance).toLocaleString('en-US', { maximumFractionDigits: 2 })}\x1b[0m`);
            
            const totalRequired = BigInt(CONFIG.ONCHAINGM_DEPLOY_FEE) * BigInt(deployCount);
            const totalRequiredFormatted = ethers.formatUnits(totalRequired, decimals);
            
            if (balance < totalRequired) {
                console.log(`\x1b[1m\x1b[31m✗ Insufficient PathUSD. Need: ${totalRequiredFormatted}, Have: ${formattedBalance}\x1b[0m`);
                
                const possibleDeploys = Number(balance / BigInt(CONFIG.ONCHAINGM_DEPLOY_FEE));
                
                if (possibleDeploys === 0) {
                    console.log('\x1b[1m\x1b[31mCannot do any deploys with current balance.\x1b[0m');
                    allResults.push({ wallet: wallet.address, success: false, reason: 'insufficient_balance' });
                    continue;
                }
                
                console.log(`\x1b[1m\x1b[33mCan do ${possibleDeploys} deploy(s) instead.\x1b[0m`);
            }
            
            const approveAmount = totalRequired > balance ? balance : totalRequired;
            
            await animatedSpinner(2000, 'Preparing approval...');
            const approvalResult = await approveOnChainGM(wallet, CONFIG.ONCHAINGM_DEPLOY_CONTRACT, approveAmount.toString());
            
            if (!approvalResult.success) {
                allResults.push({ wallet: wallet.address, success: false, reason: 'approval_failed' });
                continue;
            }
            
            if (!approvalResult.skipped) {
                await countdown(getRandomInt(3, 5), 'Starting deploys in');
            }
            
            const actualDeployCount = Math.min(deployCount, Number(balance / BigInt(CONFIG.ONCHAINGM_DEPLOY_FEE)));
            
            for (let d = 1; d <= actualDeployCount; d++) {
                console.log(`\n\x1b[1m\x1b[35m--- Deploy ${d}/${actualDeployCount} ---\x1b[0m`);
                
                await animatedSpinner(2000, 'Preparing deploy...');
                const deployResult = await executeOnChainDeploy(wallet, d, actualDeployCount);
                
                allResults.push({
                    wallet: wallet.address,
                    deployNumber: d,
                    ...deployResult
                });
                
                if (d < actualDeployCount) {
                    await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_DEPLOYS, CONFIG.MAX_DELAY_BETWEEN_DEPLOYS), 'Next deploy in');
                }
            }
            
            if (w < wallets.length - 1) {
                console.log();
                await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_WALLETS, CONFIG.MAX_DELAY_BETWEEN_WALLETS), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[90m────────────────────────────────────────────\x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m        DEPLOY ON CHAIN SUMMARY            \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        
        const successful = allResults.filter(r => r.success);
        const failed = allResults.filter(r => !r.success);
        
        console.log(`\x1b[1m\x1b[32mSuccessful Deploys: ${successful.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[36mTotal Attempts: ${allResults.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[33mWallets: ${wallets.length}\x1b[0m`);
        
        console.log('\n\x1b[1m\x1b[32mDeploy on Chain completed.\x1b[0m\n');
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mDeploy on Chain Error: ${error.message}\x1b[0m`);
    }
    
    await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
}
// ============ DOMAIN REGISTRATION MODULE ============

async function approveDomainPayment(wallet, amount) {
    try {
        const tokenContract = new ethers.Contract(CONFIG.DOMAIN_PAYMENT_TOKEN, ERC20_ABI, wallet);
        
        const currentAllowance = await tokenContract.allowance(wallet.address, CONFIG.DOMAIN_REGISTRY_ADDRESS);
        
        if (currentAllowance >= BigInt(amount)) {
            console.log('\x1b[1m\x1b[32m✓ Already approved sufficient amount\x1b[0m');
            return { success: true, skipped: true };
        }
        
        console.log('\x1b[1m\x1b[36m⟳ Approving PathUSD for domain registration...\x1b[0m');
        
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await tokenContract.approve(
            CONFIG.DOMAIN_REGISTRY_ADDRESS,
            amount,
            {
                gasLimit: 100000,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            }
        );
        
        console.log(`\x1b[1m\x1b[33mApproval TX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('Approval transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32m✓ Approval successful! Block: ${receipt.blockNumber}\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}\x1b[0m`);
        
        return { success: true, txHash: tx.hash };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Approval failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function registerDomain(wallet, domainName) {
    try {
        const registryContract = new ethers.Contract(CONFIG.DOMAIN_REGISTRY_ADDRESS, DOMAIN_REGISTRY_ABI, wallet);
        
        console.log(`\x1b[1m\x1b[36m⟳ Registering domain: ${domainName}${CONFIG.DOMAIN_SUFFIX}\x1b[0m`);
        
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await registryContract.register(
            domainName,
            '0x0000000000000000000000000000000000000000',
            {
                gasLimit: 500000,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            }
        );
        
        console.log(`\x1b[1m\x1b[33mRegister TX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('Registration transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32m✓ Domain registered successfully!\x1b[0m`);
        console.log(`\x1b[1m\x1b[36mDomain: ${domainName}${CONFIG.DOMAIN_SUFFIX}\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}\x1b[0m`);
        
        return { success: true, txHash: tx.hash, domain: `${domainName}${CONFIG.DOMAIN_SUFFIX}` };
        
    } catch (error) {
        console.log(`\x1b[1m\x1b[31m✗ Registration failed: ${error.message}\x1b[0m`);
        return { success: false, error: error.message };
    }
}

async function registerDomainFull(wallet, domainName, registerNumber, totalRegistrations) {
    console.log(`\n\x1b[1m\x1b[35m--- Registration ${registerNumber}/${totalRegistrations} ---\x1b[0m`);
    console.log(`\x1b[1m\x1b[36mWallet: ${wallet.address}\x1b[0m`);
    console.log(`\x1b[1m\x1b[33mDomain: ${domainName}${CONFIG.DOMAIN_SUFFIX}\x1b[0m\n`);
    
    const validation = validateDomainName(domainName);
    if (!validation.valid) {
        console.log(`\x1b[1m\x1b[31m✗ Invalid domain name: ${validation.reason}\x1b[0m`);
        return { success: false, reason: 'invalid_name' };
    }
    
    const tokenContract = new ethers.Contract(CONFIG.DOMAIN_PAYMENT_TOKEN, ERC20_ABI, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);
    const decimals = await tokenContract.decimals();
    const formattedBalance = ethers.formatUnits(balance, decimals);
    
    console.log(`\x1b[1m\x1b[34mPathUSD Balance: ${parseFloat(formattedBalance).toLocaleString('en-US', { maximumFractionDigits: 2 })}\x1b[0m`);
    
    const requiredAmount = BigInt(CONFIG.DOMAIN_REGISTRATION_FEE);
    
    if (balance < requiredAmount) {
        console.log(`\x1b[1m\x1b[31m✗ Insufficient PathUSD balance. Need: 0.32, Have: ${formattedBalance}\x1b[0m`);
        return { success: false, reason: 'insufficient_balance' };
    }
    
    await animatedSpinner(2000, 'Preparing approval...');
    const approvalResult = await approveDomainPayment(wallet, requiredAmount.toString());
    
    if (!approvalResult.success) {
        return { success: false, reason: 'approval_failed' };
    }
    
    if (!approvalResult.skipped) {
        await countdown(getRandomInt(3, 5), 'Registering in');
    }
    
    await animatedSpinner(2000, 'Preparing registration...');
    const registerResult = await registerDomain(wallet, domainName);
    
    return registerResult;
}

async function runRegisterDomain() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m        REGISTER DOMAIN MODULE             \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    try {
        const privateKeys = getPrivateKeys();
        console.log(`\x1b[1m\x1b[36mFound ${privateKeys.length} wallet(s)\x1b[0m\n`);
        
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found in pv.txt\x1b[0m');
            await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
            return;
        }
        
        console.log('\x1b[1m\x1b[33mSelect domain name type:\x1b[0m');
        console.log('\x1b[1m\x1b[32m  1. Manual (enter your own name)\x1b[0m');
        console.log('\x1b[1m\x1b[32m  2. Random (auto-generate random names)\x1b[0m\n');
        
        const nameTypeChoice = await askQuestion('\x1b[1m\x1b[36mEnter choice (1-2): \x1b[0m');
        const useManualName = nameTypeChoice === '1';
        
        let manualDomainName = '';
        if (useManualName) {
            while (true) {
                manualDomainName = await askQuestion('\x1b[1m\x1b[36mEnter domain name (without .tempo): \x1b[0m');
                manualDomainName = sanitizeDomainName(manualDomainName);
                const validation = validateDomainName(manualDomainName);
                
                if (validation.valid) {
                    console.log(`\x1b[1m\x1b[32m✓ Domain name valid: ${manualDomainName}${CONFIG.DOMAIN_SUFFIX}\x1b[0m\n`);
                    break;
                } else {
                    console.log(`\x1b[1m\x1b[31m✗ ${validation.reason}\x1b[0m\n`);
                }
            }
        }
        
        let registerCount = 1;
        while (true) {
            const input = await askQuestion('\x1b[1m\x1b[36mNumber of domains per wallet (1-10): \x1b[0m');
            const v = parseInt(input);
            if (!isNaN(v) && v >= 1 && v <= 10) {
                registerCount = v;
                break;
            }
            console.log('\x1b[1m\x1b[31mEnter a number between 1 - 10\x1b[0m');
        }
        
        console.log(`\n\x1b[1m\x1b[32mRegistration count set to: ${registerCount}\x1b[0m\n`);
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        
        const allResults = [];
        
        for (let w = 0; w < wallets.length; w++) {
            const wallet = wallets[w];
            
            console.log('\x1b[90m────────────────────────────────────────────\x1b[0m');
            console.log(`\x1b[1m\x1b[35mWALLET #${w + 1}/${wallets.length}\x1b[0m`);
            console.log(`\x1b[1m\x1b[36mAddress: ${wallet.address}\x1b[0m`);
            
            for (let i = 1; i <= registerCount; i++) {
                let domainName;
                
                if (useManualName) {
                    domainName = registerCount > 1 ? `${manualDomainName}${i}` : manualDomainName;
                } else {
                    domainName = generateRandomDomainName();
                }
                
                const result = await registerDomainFull(wallet, domainName, i, registerCount);
                allResults.push({ wallet: wallet.address, domain: `${domainName}${CONFIG.DOMAIN_SUFFIX}`, ...result });
                
                if (i < registerCount) {
                    console.log();
                    await countdown(getRandomInt(5, 10), 'Next registration in');
                }
            }
            
            if (w < wallets.length - 1) {
                console.log();
                await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_WALLETS, CONFIG.MAX_DELAY_BETWEEN_WALLETS), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[90m────────────────────────────────────────────\x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m       DOMAIN REGISTRATION SUMMARY         \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        
        const successful = allResults.filter(r => r.success);
        const failed = allResults.filter(r => !r.success);
        
        console.log(`\x1b[1m\x1b[32mSuccessful: ${successful.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed.length}\x1b[0m`);
        
        if (successful.length > 0) {
            console.log('\n\x1b[1m\x1b[32mRegistered Domains:\x1b[0m');
            successful.forEach((r, idx) => {
                console.log(`\x1b[1m\x1b[36m  ${idx + 1}. ${r.domain}\x1b[0m`);
            });
        }
        
        console.log('\n\x1b[1m\x1b[32mDomain registration completed.\x1b[0m\n');
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mDomain Registration Error: ${error.message}\x1b[0m`);
    }
    
    await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
}

// ============ FAUCET MODULE ============

async function claimFaucetSingle(wallet, provider, claimNumber, totalClaims) {
    const address = wallet.address;
    
    await animatedSpinner(CONFIG.FAUCET_PRE_CLAIM_MS, `Preparing claim ${claimNumber}/${totalClaims}...`);
    process.stdout.write(`\r\x1b[1m\x1b[36m⟳ Sending faucet request...\x1b[0m                         `);
    
    try {
        const txHashes = await provider.send('tempo_fundAddress', [address]);
        
        process.stdout.write(`\r\x1b[1m\x1b[32m✓ Faucet claimed successfully!                         \x1b[0m\n`);
        
        console.log(`\n\x1b[1m\x1b[36m${claimNumber}.\x1b[0m`);
        console.log('\x1b[1m\x1b[32mBerhasil claim faucet\x1b[0m');
        
        if (Array.isArray(txHashes)) {
            txHashes.forEach((tx, idx) => {
                const token = CONFIG.FAUCET_TOKENS[idx];
                if (!token) return;
                console.log(`\x1b[1m\x1b[32m✓\x1b[0m \x1b[1m\x1b[37m${token.amount} ${token.symbol}\x1b[0m \x1b[90m:\x1b[0m \x1b[1m\x1b[36m${CONFIG.EXPLORER_URL}/tx/${tx}\x1b[0m`);
            });
        }
        
        return { success: true, address, txHashes };
        
    } catch (error) {
        process.stdout.write(`\r\x1b[1m\x1b[31m✗ Claim ${claimNumber} failed!                         \x1b[0m\n`);
        console.log(`\x1b[1m\x1b[31mError: ${error.message}\x1b[0m`);
        return { success: false, address, error: error.message };
    }
}

async function runFaucetClaim() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m         FAUCET CLAIM MODULE (RPC)         \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    try {
        const privateKeys = getPrivateKeys();
        console.log(`\x1b[1m\x1b[36mFound ${privateKeys.length} wallet(s)\x1b[0m\n`);
        
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found in pv.txt\x1b[0m');
            await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
            return;
        }
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        
        let claimCount = 1;
        while (true) {
            const input = await askQuestion('\x1b[1m\x1b[36mJumlah claim faucet per wallet (1-100): \x1b[0m');
            const v = parseInt(input);
            if (!isNaN(v) && v >= 1 && v <= 100) {
                claimCount = v;
                break;
            }
            console.log('\x1b[1m\x1b[31mMasukkan angka 1 - 100\x1b[0m');
        }
        
        console.log(`\n\x1b[1m\x1b[32mClaim count set to: ${claimCount}\x1b[0m\n`);
        
        const allResults = [];
        
        for (let w = 0; w < wallets.length; w++) {
            const wallet = wallets[w];
            
            console.log('\x1b[90m────────────────────────────────────────────\x1b[0m');
            console.log(`\x1b[1m\x1b[35mWALLET #${w + 1}/${wallets.length}\x1b[0m`);
            console.log(`\x1b[1m\x1b[36mAddress: ${wallet.address}\x1b[0m\n`);
            
            for (let i = 1; i <= claimCount; i++) {
                const result = await claimFaucetSingle(wallet, provider, i, claimCount);
                allResults.push(result);
                
                if (i < claimCount) {
                    console.log();
                    await countdown(CONFIG.FAUCET_CLAIM_DELAY_SEC, 'Next claim in');
                    console.log();
                }
            }
            
            if (w < wallets.length - 1) {
                console.log();
                await countdown(getRandomInt(5, 10), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[90m────────────────────────────────────────────\x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m           FAUCET CLAIM SUMMARY            \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        
        const successful = allResults.filter(r => r.success);
        const failed = allResults.filter(r => !r.success);
        
        console.log(`\x1b[1m\x1b[32mSuccessful: ${successful.length}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed.length}\x1b[0m`);
        
        console.log('\n\x1b[1m\x1b[32mSemua claim faucet selesai.\x1b[0m\n');
        
        await countdown(CONFIG.FAUCET_FINISH_DELAY_SEC, 'Kembali ke main menu dalam');
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mFaucet Error: ${error.message}\x1b[0m`);
        await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
    }
}

// ============ DEPLOY MODULE ============

async function deployContract(wallet, abi, bytecode, deployNumber, walletIndex) {
    try {
        console.log(`\n\x1b[1m\x1b[35mDEPLOYMENT #${deployNumber} - WALLET #${walletIndex}\x1b[0m`);
        console.log(`\x1b[1m\x1b[36mDeployer: ${wallet.address}\x1b[0m`);
        
        await displayTokenBalances(wallet);
        
        const randomGas = getRandomInt(2500000, CONFIG.GAS_LIMIT);
        console.log(`\x1b[1m\x1b[34mGas Limit: ${randomGas}\x1b[0m`);
        console.log('\x1b[1m\x1b[36mDeploying contract...\x1b[0m');
        const factory = new ethers.ContractFactory(abi, bytecode, wallet);
        const contract = await factory.deploy({ gasLimit: randomGas });
        console.log('\x1b[1m\x1b[33mWaiting for deployment...\x1b[0m');
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();
        console.log('\x1b[1m\x1b[32mContract deployed!\x1b[0m');
        console.log(`\x1b[1m\x1b[36mAddress: ${contractAddress}\x1b[0m`);
        console.log(`\x1b[1m\x1b[34mExplorer: ${CONFIG.EXPLORER_URL}/address/${contractAddress}\x1b[0m`);
        if (Math.random() > 0.3) {
            await countdown(getRandomInt(2, 5), 'Updating message in');
            const newMsg = getRandomMessage();
            console.log(`\x1b[1m\x1b[36mSetting message: "${newMsg}"\x1b[0m`);
            const tx = await contract.setMessage(newMsg, { gasLimit: getRandomInt(80000, 120000) });
            console.log(`\x1b[1m\x1b[34mTX Hash: ${tx.hash}\x1b[0m`);
            await tx.wait();
            console.log('\x1b[1m\x1b[32mMessage updated!\x1b[0m');
        }
        return { success: true };
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mDeployment failed: ${error.message}\x1b[0m`);
        return { success: false };
    }
}

async function runContractDeploy() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m          CONTRACT DEPLOY MODULE           \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    const answer = await askQuestion('\x1b[1m\x1b[36mHow many times to deploy per wallet? \x1b[0m');
    let deployCount = parseInt(answer);
    if (isNaN(deployCount) || deployCount < 1) {
        console.log('\x1b[1m\x1b[31mInvalid input, using default: 2\x1b[0m');
        deployCount = 2;
    }
    console.log(`\n\x1b[1m\x1b[32mDeploy count set to: ${deployCount}\x1b[0m\n`);
    
    try {
        const source = getContractSource();
        const { abi, bytecode } = compileContract(source);
        const privateKeys = getPrivateKeys();
        console.log(`\x1b[1m\x1b[36mFound ${privateKeys.length} wallet(s)\x1b[0m\n`);
        
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found in pv.txt\x1b[0m');
            return;
        }
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        let successful = 0, failed = 0;
        
        for (let i = 0; i < wallets.length; i++) {
            console.log(`\n\x1b[1m\x1b[35mWALLET #${i + 1}/${wallets.length}: ${wallets[i].address}\x1b[0m`);
            for (let j = 0; j < deployCount; j++) {
                const result = await deployContract(wallets[i], abi, bytecode, j + 1, i + 1);
                result.success ? successful++ : failed++;
                if (j < deployCount - 1) {
                    await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_DEPLOYS, CONFIG.MAX_DELAY_BETWEEN_DEPLOYS), `Next deployment`);
                }
            }
            if (i < wallets.length - 1) {
                await countdown(getRandomInt(CONFIG.MIN_DELAY_BETWEEN_WALLETS, CONFIG.MAX_DELAY_BETWEEN_WALLETS), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m              DEPLOY SUMMARY               \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log(`\x1b[1m\x1b[32mSuccessful: ${successful}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed}\x1b[0m`);
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mDeploy Error: ${error.message}\x1b[0m`);
    }
}

// ============ TOKEN MODULE ============

async function getTokenBalance(wallet, tokenAddress) {
    try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const balance = await contract.balanceOf(wallet.address);
        const decimals = await contract.decimals();
        return { balance, decimals, formatted: ethers.formatUnits(balance, decimals) };
    } catch (error) {
        return { balance: 0n, decimals: 18, formatted: '0' };
    }
}

async function sendToken(wallet, tokenAddress, tokenSymbol, to, amount, retryCount = 0) {
    const maxRetries = 3;
    try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const decimals = await contract.decimals();
        const amountWei = ethers.parseUnits(amount.toString(), decimals);
        const balanceInfo = await getTokenBalance(wallet, tokenAddress);
        
        if (balanceInfo.balance < amountWei) {
            console.log(`\x1b[1m\x1b[31mInsufficient ${tokenSymbol} balance. Have: ${balanceInfo.formatted}, Need: ${amount}\x1b[0m`);
            return { success: false, reason: 'insufficient_balance' };
        }

        console.log(`\x1b[1m\x1b[36mSending ${amount} ${tokenSymbol} to ${to.slice(0, 10)}...\x1b[0m`);
        
        const nonce = await wallet.getNonce();
        const feeData = await wallet.provider.getFeeData();
        
        const tx = await contract.transfer(to, amountWei, {
            gasLimit: 100000,
            nonce: nonce,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        });
        
        console.log(`\x1b[1m\x1b[33mTX: ${shortHash(tx.hash)}\x1b[0m`);
        
        const receipt = await tx.wait(1);
        
        if (receipt.status === 0) {
            throw new Error('Transaction reverted');
        }
        
        console.log(`\x1b[1m\x1b[32mSent successfully! Block: ${receipt.blockNumber}\x1b[0m`);
        return { success: true };
        
    } catch (error) {
        if (retryCount < maxRetries && (error.message.includes('reverted') || error.message.includes('nonce'))) {
            console.log(`\x1b[1m\x1b[33mRetrying... (${retryCount + 1}/${maxRetries})\x1b[0m`);
            await sleep(3000);
            return sendToken(wallet, tokenAddress, tokenSymbol, to, amount, retryCount + 1);
        }
        console.log(`\x1b[1m\x1b[31mSend failed: ${error.message.slice(0, 100)}\x1b[0m`);
        return { success: false, reason: 'error' };
    }
}

async function runSendToken() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m            SEND TOKEN MODULE              \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    
    const tokenList = Object.entries(CONFIG.TOKENS);
    console.log('\x1b[1m\x1b[33mAvailable Tokens:\x1b[0m');
    tokenList.forEach(([name], i) => console.log(`\x1b[1m\x1b[34m  ${i + 1}. ${name}\x1b[0m`));
    console.log(`\x1b[1m\x1b[34m  ${tokenList.length + 1}. Send All Tokens\x1b[0m\n`);
    
    const tokenChoice = await askQuestion('\x1b[1m\x1b[36mSelect token (number): \x1b[0m');
    const tokenIndex = parseInt(tokenChoice) - 1;
    if (isNaN(tokenIndex) || tokenIndex < 0 || tokenIndex > tokenList.length) {
        console.log('\x1b[1m\x1b[31mInvalid selection\x1b[0m');
        return;
    }
    
    console.log('\n\x1b[1m\x1b[33mDestination:\x1b[0m');
    console.log('\x1b[1m\x1b[34m  1. Random Address\x1b[0m');
    console.log('\x1b[1m\x1b[34m  2. Manual Address\x1b[0m\n');
    
    const destChoice = await askQuestion('\x1b[1m\x1b[36mSelect destination (1-2): \x1b[0m');
    let toAddress;
    if (destChoice === '1') {
        toAddress = ethers.Wallet.createRandom().address;
        console.log(`\x1b[1m\x1b[33mRandom address: ${toAddress}\x1b[0m`);
    } else {
        toAddress = await askQuestion('\x1b[1m\x1b[36mEnter destination address: \x1b[0m');
        if (!ethers.isAddress(toAddress)) {
            console.log('\x1b[1m\x1b[31mInvalid address\x1b[0m');
            return;
        }
    }
    
    const amountInput = await askQuestion('\x1b[1m\x1b[36mAmount per TX (default 1): \x1b[0m');
    const amount = amountInput || '1';
    
    const txCountInput = await askQuestion('\x1b[1m\x1b[36mNumber of TXs per token (default 1): \x1b[0m');
    const txCount = parseInt(txCountInput) || 1;
    
    try {
        const privateKeys = getPrivateKeys();
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found\x1b[0m');
            return;
        }
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        const tokensToSend = tokenIndex === tokenList.length ? tokenList : [tokenList[tokenIndex]];
        
        let successful = 0, failed = 0;
        
        for (let w = 0; w < wallets.length; w++) {
            console.log(`\n\x1b[1m\x1b[35mWallet #${w + 1}: ${wallets[w].address}\x1b[0m`);
            
            for (const [symbol, address] of tokensToSend) {
                console.log(`\n\x1b[1m\x1b[33m--- ${symbol} ---\x1b[0m`);
                
                for (let t = 0; t < txCount; t++) {
                    console.log(`\n\x1b[1m\x1b[36mTX ${t + 1}/${txCount}\x1b[0m`);
                    const result = await sendToken(wallets[w], address, symbol, toAddress, amount);
                    
                    if (result.success) {
                        successful++;
                    } else {
                        failed++;
                        if (result.reason === 'insufficient_balance') break;
                    }
                    
                    if (t < txCount - 1 && result.success) {
                        await countdown(getRandomInt(3, 6), 'Next TX in');
                    }
                }
                
                await countdown(getRandomInt(2, 4), 'Next token in');
            }
            
            if (w < wallets.length - 1) {
                await countdown(getRandomInt(5, 10), 'Next wallet in');
            }
        }
        
        console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[36m              SEND SUMMARY                 \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log(`\x1b[1m\x1b[32mSuccessful: ${successful}\x1b[0m`);
        console.log(`\x1b[1m\x1b[31mFailed: ${failed}\x1b[0m`);
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mSend Error: ${error.message}\x1b[0m`);
    }
}

// ============ AUTO ALL MODULE ============

async function runAutoAll() {
    console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m             AUTO ALL MODULE               \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    console.log('\x1b[1m\x1b[33mThis will run: Faucet -> Deploy -> Send\x1b[0m\n');
    
    let faucetClaimCount = 1;
    while (true) {
        const input = await askQuestion('\x1b[1m\x1b[36mFaucet claims per wallet (1-100, default 1): \x1b[0m');
        if (!input) { faucetClaimCount = 1; break; }
        const v = parseInt(input);
        if (!isNaN(v) && v >= 1 && v <= 100) { faucetClaimCount = v; break; }
        console.log('\x1b[1m\x1b[31mMasukkan angka 1 - 100\x1b[0m');
    }
    
    const deployInput = await askQuestion('\x1b[1m\x1b[36mDeploys per wallet (default 2): \x1b[0m');
    const deployCount = parseInt(deployInput) || 2;
    
    const sendAmount = await askQuestion('\x1b[1m\x1b[36mSend amount per token (default 1): \x1b[0m') || '1';
    
    try {
        const privateKeys = getPrivateKeys();
        if (privateKeys.length === 0) {
            console.log('\x1b[1m\x1b[31mNo private keys found\x1b[0m');
            return;
        }
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        const source = getContractSource();
        const { abi, bytecode } = compileContract(source);
        const tokenList = Object.entries(CONFIG.TOKENS);
        
        for (let w = 0; w < wallets.length; w++) {
            const wallet = wallets[w];
            console.log(`\n\x1b[1m\x1b[35m========== WALLET #${w + 1}/${wallets.length} ==========\x1b[0m`);
            console.log(`\x1b[1m\x1b[36m${wallet.address}\x1b[0m\n`);
            
            // STEP 1: FAUCET
            console.log('\x1b[1m\x1b[33m--- STEP 1: FAUCET ---\x1b[0m');
            for (let fc = 1; fc <= faucetClaimCount; fc++) {
                await claimFaucetSingle(wallet, provider, fc, faucetClaimCount);
                if (fc < faucetClaimCount) {
                    console.log();
                    await countdown(CONFIG.FAUCET_CLAIM_DELAY_SEC, 'Next claim in');
                    console.log();
                }
            }
            await countdown(getRandomInt(5, 10), 'Next step in');
            
            // STEP 2: DEPLOY
            console.log('\n\x1b[1m\x1b[33m--- STEP 2: DEPLOY ---\x1b[0m');
            for (let d = 0; d < deployCount; d++) {
                await deployContract(wallet, abi, bytecode, d + 1, w + 1);
                if (d < deployCount - 1) await countdown(getRandomInt(5, 8), 'Next deploy in');
            }
            await countdown(getRandomInt(5, 10), 'Next step in');
            
            // STEP 3: SEND
            console.log('\n\x1b[1m\x1b[33m--- STEP 3: SEND ---\x1b[0m');
            const randomTo = ethers.Wallet.createRandom().address;
            console.log(`\x1b[1m\x1b[34mSending to random: ${randomTo}\x1b[0m`);
            
            for (const [symbol, address] of tokenList) {
                const balanceInfo = await getTokenBalance(wallet, address);
                console.log(`\n\x1b[1m\x1b[36m${symbol} balance: ${balanceInfo.formatted}\x1b[0m`);
                
                if (parseFloat(balanceInfo.formatted) >= parseFloat(sendAmount)) {
                    await sendToken(wallet, address, symbol, randomTo, sendAmount);
                } else {
                    console.log(`\x1b[1m\x1b[33mSkipping ${symbol} (insufficient balance)\x1b[0m`);
                }
                await countdown(getRandomInt(3, 6), 'Next token in');
            }
            
            if (w < wallets.length - 1) await countdown(getRandomInt(10, 20), 'Next wallet in');
        }
        
        console.log('\n\x1b[1m\x1b[35m============================================\x1b[0m');
        console.log('\x1b[1m\x1b[32m          AUTO ALL COMPLETED!              \x1b[0m');
        console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
        
    } catch (error) {
        console.error(`\x1b[1m\x1b[31mAuto All Error: ${error.message}\x1b[0m`);
    }
}

// ============ MENU ============

async function showMenu() {
    console.clear();
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m          Tempo Testnet Auto Bot           \x1b[0m');
    console.log('\x1b[1m\x1b[36m        Created by Kazuha VIP only         \x1b[0m');
    console.log('\x1b[1m\x1b[35m============================================\x1b[0m\n');
    console.log('\x1b[1m\x1b[36mSelect an option:\x1b[0m\n');
    console.log('\x1b[1m\x1b[32m  1. Mint OmniHub NFT\x1b[0m');
    console.log('\x1b[1m\x1b[32m  2. Deploy Contracts\x1b[0m');
    console.log('\x1b[1m\x1b[32m  3. Claim Faucet\x1b[0m');
    console.log('\x1b[1m\x1b[32m  4. Send Tokens\x1b[0m');
    console.log('\x1b[1m\x1b[32m  5. Auto All\x1b[0m');
    console.log('\x1b[1m\x1b[32m  6. Register Domain\x1b[0m');
    console.log('\x1b[1m\x1b[33m  7. OnChain GM (Daily - 24h Cooldown)\x1b[0m');
    console.log('\x1b[1m\x1b[33m  8. Deploy on Chain\x1b[0m');
    console.log('\x1b[1m\x1b[31m  9. Exit\x1b[0m\n');
}

async function main() {
    while (true) {
        await showMenu();
        const choice = await askQuestion('\x1b[1m\x1b[36mEnter your choice (1-9): \x1b[0m');
        
        switch (choice) {
            case '1':
                await runOmniHubMint();
                break;
            case '2':
                await runContractDeploy();
                await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
                break;
            case '3':
                await runFaucetClaim();
                break;
            case '4':
                await runSendToken();
                await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
                break;
            case '5':
                await runAutoAll();
                await askQuestion('\n\x1b[1m\x1b[33mPress Enter to continue...\x1b[0m');
                break;
            case '6':
                await runRegisterDomain();
                break;
            case '7':
                await runOnChainGM();
                break;
            case '8':
                await runOnChainDeploy();
                break;
            case '9':
                console.log('\n\x1b[1m\x1b[35mGoodbye!\x1b[0m\n');
                if (rl) rl.close();
                process.exit(0);
            default:
                console.log('\x1b[1m\x1b[31mInvalid choice! Please select 1-9\x1b[0m');
                await sleep(1500);
        }
    }
}

// Handle exit
process.on('SIGINT', () => {
    console.log('\n\x1b[1m\x1b[35mGoodbye!\x1b[0m\n');
    if (rl) rl.close();
    process.exit(0);
});

main().catch((error) => {
    console.error(`\x1b[1m\x1b[31mFatal Error: ${error.message}\x1b[0m`);
    if (rl) rl.close();
    process.exit(1);
});
