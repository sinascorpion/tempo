import { ethers } from 'ethers';
import chalk from 'chalk';
import solc from 'solc';
import { CONFIG, SYSTEM_CONTRACTS, ERC20_ABI } from '../config/config.js';
import { getPrivateKeys } from '../utils/wallet.js';
import { log, sleep } from '../utils/helpers.js';

function getContractSource(name, symbol) {
    const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '');
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${cleanSymbol}NFT {
    string public name = "${name}";
    string public symbol = "${symbol}";
    
    uint256 private _tokenIdCounter;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string) private _tokenColors;
    
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    
    function totalSupply() public view returns (uint256) { return _tokenIdCounter; }
    function balanceOf(address owner) public view returns (uint256) { return _balances[owner]; }
    function ownerOf(uint256 tokenId) public view returns (address) { return _owners[tokenId]; }
    
    function mint(address to, string memory color) public returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _owners[tokenId] = to;
        _balances[to]++;
        _tokenColors[tokenId] = color;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }
    
    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return string(abi.encodePacked("data:application/json,{name:", _toString(tokenId), "}"));
    }
    
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) { digits--; buffer[digits] = bytes1(uint8(48 + value % 10)); value /= 10; }
        return string(buffer);
    }
}`;
}

function compileNFT(name, symbol) {
    const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '');
    const source = getContractSource(name, symbol);
    const input = {
        language: 'Solidity',
        sources: { [`${cleanSymbol}NFT.sol`]: { content: source } },
        settings: { outputSelection: { '*': { '*': ['*'] } } }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const contract = output.contracts[`${cleanSymbol}NFT.sol`][`${cleanSymbol}NFT`];
    return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

function getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9', '#74B9FF', '#A29BFE'];
    return colors[Math.floor(Math.random() * colors.length)];
}

export async function runNft() {
    console.log(chalk.magenta("\n  NFT MODULE (CREATE & MINT)\n"));

    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) return;

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    for (let w = 0; w < privateKeys.length; w++) {
        const wallet = new ethers.Wallet(privateKeys[w], provider);
        console.log(chalk.magenta(`\nWALLET #${w + 1}: ${wallet.address}`));

        // Generate Random Name/Symbol
        const suffix = Math.random().toString(36).substring(7).toUpperCase();
        const name = `Test NFT ${suffix}`;
        const symbol = `T${suffix}`;
        console.log(chalk.blue(`  Collection: ${name} (${symbol})`));

        try {
            log('info', 'Compiling Contract...');
            const { abi, bytecode } = compileNFT(name, symbol);

            log('info', 'Deploying Contract...');
            const factory = new ethers.ContractFactory(abi, bytecode, wallet);
            const contract = await factory.deploy();
            await contract.waitForDeployment();
            const address = await contract.getAddress();
            log('success', `Deployed at: ${address}`);

            log('info', 'Minting NFTs...');
            const mintCount = 2;
            for (let i = 0; i < mintCount; i++) {
                const color = getRandomColor();
                const tx = await contract.mint(wallet.address, color);
                log('info', `  Mint TX: ${tx.hash}`);
                await tx.wait();
                log('success', `  Minted NFT #${i} (${color})`);
                await sleep(2000);
            }

        } catch (error) {
            log('error', `Failed: ${error.message}`);
        }
        await sleep(3000);
    }
}
