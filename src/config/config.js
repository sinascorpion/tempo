import { ethers } from 'ethers';

// Console Colors (using chalk in code, but defining constants if needed manually, though chalk is preferred)
export const COLORS = {
    RESET: "\x1b[0m",
    BOLD: "\x1b[1m",
    DIM: "\x1b[2m",
    GREEN: "\x1b[32m",
    YELLOW: "\x1b[33m",
    RED: "\x1b[31m",
    CYAN: "\x1b[36m",
    MAGENTA: "\x1b[35m",
    WHITE: "\x1b[37m",
    BLUE: "\x1b[34m"
};

export const VERSION_INFO = {
    VERSION: '2.0.1',
    BUILD_DATE: '17.12.2024',
    AUTHOR: 'kazuha vip only'
};

export const CONFIG = {
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
    // ONCHAIN GM CONFIGURATION (Fill in these values)
    ONCHAINGM_CONTRACT: '0x2d91014C9Ab33821C4Fa15806c63D2C053cdD10c', // <--- REPLACE THIS
    ONCHAINGM_DEPLOY_CONTRACT: '0xa89E3e260C85d19c0b940245FDdb1e845C93dED8', // <--- REPLACE THIS
    ONCHAINGM_FEE: '15000000', // 15 * 10^6 (assuming 6 decimals for PathUSD)
    ONCHAINGM_DEPLOY_FEE: '20000000' // 20 * 10^6
};

export const SYSTEM_CONTRACTS = {
    TIP20_FACTORY: '0x20fc000000000000000000000000000000000000',
    FEE_MANAGER: '0xfeec000000000000000000000000000000000000',
    STABLECOIN_DEX: '0xdec0000000000000000000000000000000000000'
};

export const INFINITY_NAME_CONTRACT = '0x70a57af45cd15f1565808cf7b1070bac363afd8a';
export const RETRIEVER_NFT_CONTRACT = '0x603928C91Db2A58E2E689D42686A139Ad41CB51C';

export const ADDITIONAL_CONTRACTS = {
    INFINITY_NAME: INFINITY_NAME_CONTRACT,
    RETRIEVER_NFT: RETRIEVER_NFT_CONTRACT
};

// ABIs
export const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

export const TIP20_EXTENDED_ABI = [
    ...ERC20_ABI,
    "function name() view returns (string)",
    "function mint(address to, uint256 amount)",
    "function burn(uint256 amount)",
    "function transferWithMemo(address to, uint256 amount, bytes32 memo)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function grantRole(bytes32 role, address account)",
    "function decimals() view returns (uint8)"
];

export const TIP20_FACTORY_ABI = [
    "function createToken(string name, string symbol, string currency, address quoteToken, address admin) returns (address)",
    "function tokenIdCounter() view returns (uint256)",
    "function isTIP20(address token) view returns (bool)",
    "event TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)"
];

export const STABLECOIN_DEX_ABI = [
    "function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) returns (uint128 amountOut)",
    "function swapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut, uint128 maxAmountIn) returns (uint128 amountIn)",
    "function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn) view returns (uint128 amountOut)",
    "function balanceOf(address user, address token) view returns (uint128)",
    "function withdraw(address token, uint128 amount)",
    "function place(address token, uint128 amount, bool isBid, int16 tick) returns (uint128 orderId)",
    "function cancel(uint128 orderId)"
];

export const FEE_MANAGER_ABI = [
    "function userTokens(address user) view returns (address)",
    "function setUserToken(address token)",
    "function getPoolId(address userToken, address validatorToken) view returns (bytes32)",
    "function getPool(address userToken, address validatorToken) view returns (uint128 reserveUserToken, uint128 reserveValidatorToken)",
    "function mintWithValidatorToken(address userToken, address validatorToken, uint256 amountValidatorToken, address to) returns (uint256 liquidity)",
    "function liquidityBalances(bytes32 poolId, address user) view returns (uint256)",
    "function burn(address userToken, address validatorToken, uint256 liquidity, address to) returns (uint256 amountUserToken, uint256 amountValidatorToken)"
];

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const MULTICALL3_ABI = [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])"
];

export const TIP403_REGISTRY = '0x403c000000000000000000000000000000000000';
export const TIP403_REGISTRY_ABI = [
    "function createPolicy(address admin, uint8 policyType) returns (uint64)",
    "function createPolicyWithAccounts(address admin, uint8 policyType, address[] accounts) returns (uint64)",
    "function modifyPolicyWhitelist(uint64 policyId, address account, bool allowed)",
    "function modifyPolicyBlacklist(uint64 policyId, address account, bool restricted)",
    "function isAuthorized(uint64 policyId, address user) view returns (bool)",
    "event PolicyCreated(uint64 indexed policyId, address indexed admin, uint8 policyType)"
];

export const TIP20_POLICY_ABI = [
    "function transferPolicyId() view returns (uint64)",
    "function changeTransferPolicyId(uint64 newPolicyId)"
];

export const INFINITY_NAME_ABI = [
    "function register(string domain, address referrer) returns (uint256)",
    "function isAvailable(string domain) view returns (bool)",
    "function price() view returns (uint256)"
];

export const RETRIEVER_NFT_ABI = [
    "function claim(address receiver, uint256 quantity, address currency, uint256 pricePerToken, tuple(bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) allowlistProof, bytes data)",
    "function balanceOf(address owner) view returns (uint256)",
    "function name() view returns (string)"
];

export const ONCHAINGM_ABI = [
    "function onChainGM(address receiver)"
];

export const ONCHAINGM_DEPLOY_ABI = [
    "function deploy() returns (address)"
];
