import 'dotenv/config';
import fs from 'fs';
import { ethers } from 'ethers';
import pLimit from 'p-limit';
import promiseRetry from 'promise-retry';
import chunk from 'lodash.chunk';
import chalk from 'chalk';

// ======================== CONFIG ========================
const { RPC_URL, TO_ADDRESS } = process.env;
if (!RPC_URL || !TO_ADDRESS) {
  console.error(chalk.red('⚠️ Please ensure your .env file contains RPC_URL and TO_ADDRESS'));
  process.exit(1);
}

// BATCH & CONCURRENCY SETTINGS
const WALLET_BATCH_SIZE = 5;
const TOKEN_CONCURRENCY = 2;

// Read private keys
let privateKeys;
try {
  const data = fs.readFileSync('privatekey.txt', 'utf8').trim();
  privateKeys = data.split(/\r?\n/).filter(Boolean);
  if (!privateKeys.length) throw new Error();
} catch {
  console.error(chalk.red('⚠️ Failed to read privatekey.txt or file is empty'));
  process.exit(1);
}

// Token list and ABI
const tokenAddresses = [
  '0x2d5a4f5634041f50180A25F26b2A8364452E3152',
  '0x1428444Eacdc0Fd115dd4318FcE65B61Cd1ef399',
  '0xf4BE938070f59764C85fAcE374F92A4670ff3877',
  '0x8802b7bcF8EedCc9E1bA6C20E139bEe89dd98E83',
  '0xBEbF4E25652e7F23CCdCCcaaCB32004501c4BfF8',
  '0xFF27D611ab162d7827bbbA59F140C1E7aE56e95C'
];
const erc20Abi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// Initialize provider and concurrency limiter
const provider = new ethers.JsonRpcProvider(RPC_URL);
const limit = pLimit(TOKEN_CONCURRENCY);
const tokenMeta = {};

// Cache token metadata
async function cacheTokenMetadata() {
  for (const addr of tokenAddresses) {
    try {
      const contract = new ethers.Contract(addr, erc20Abi, provider);
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);
      tokenMeta[addr] = { name, symbol, decimals };
      console.log(chalk.green(`✅ Cached ${symbol} (${addr})`));
    } catch {
      console.warn(chalk.yellow(`⚠️ Skipped metadata for ${addr}`));
    }
  }
}

// Get gas fees
async function getGasFees() {
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei');
  const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('50', 'gwei');
  return { maxPriorityFeePerGas, maxFeePerGas };
}

// Retry helper
async function sendWithRetry(action) {
  return promiseRetry((retry, number) =>
    action().catch(err => {
      console.warn(chalk.yellow(`⚠️ Attempt ${number} failed: ${err.message}`));
      retry(err);
    })
  , { retries: 2, factor: 1.5, minTimeout: 500 });
}

// Process transfers for one token and wallet
async function processTokenTransfer(wallet, tokenAddr) {
  const { symbol, decimals } = tokenMeta[tokenAddr];
  const address = await wallet.getAddress();
  const contract = new ethers.Contract(tokenAddr, erc20Abi, wallet);

  const balance = await contract.balanceOf(address);
  if (balance === 0n) {
    console.log(chalk.blue(`⚠️ ${symbol}: zero balance`));
    return;
  }
  console.log(chalk.cyan(`🔹 ${symbol}: ${ethers.formatUnits(balance, decimals)}`));

  // Encode transfer data
  const data = contract.interface.encodeFunctionData('transfer', [TO_ADDRESS, balance]);
  const txRequest = { to: tokenAddr, from: address, data };
  const estGas = await provider.estimateGas(txRequest);
  // Use BigInt math for gas buffer
  const gasLimit = (estGas * 120n) / 100n;

  const { maxPriorityFeePerGas, maxFeePerGas } = await getGasFees();

  // Check ETH balance to cover gas cost
  const ethBalance = await provider.getBalance(address);
  // Convert maxFeePerGas to BigInt if needed
  const maxFeePerGasBI = typeof maxFeePerGas === 'bigint' ? maxFeePerGas : maxFeePerGas.toBigInt();
  const gasCost = gasLimit * maxFeePerGasBI;
  if (ethBalance < gasCost) {
    console.warn(chalk.yellow(`⚠️ Skipping ${symbol}: insufficient ETH for gas (${ethers.formatUnits(ethBalance, 18)} ETH available, need ~${ethers.formatUnits(gasCost.toString(), 18)} ETH)`));
    return;
  }

  console.log(chalk.magenta(`⛽ Gas: ${estGas.toString()} (+20% -> ${gasLimit.toString()})`));

  let tx;
  try {
    tx = await sendWithRetry(() =>
      contract.transfer(
        TO_ADDRESS,
        balance,
        { gasLimit, maxPriorityFeePerGas, maxFeePerGas }
      )
    );
  } catch (err) {
    console.warn(chalk.yellow(`⚠️ Skipping ${symbol}: ${err.message}`));
    return;
  }
  console.log(chalk.green(`📤 TX: ${tx.hash}`));
  const receipt = await tx.wait(1);
  console.log(chalk.green(`✅ ${symbol} sent in block ${receipt.blockNumber}`));
}

// Main
(async () => {
  console.log(chalk.yellow('🔌 Start transfers'));
  await cacheTokenMetadata();

  for (const chunkKeys of chunk(privateKeys, WALLET_BATCH_SIZE)) {
    console.log(chalk.yellow(`🎛️ Batch of ${chunkKeys.length}`));
    const tasks = chunkKeys.flatMap(pk => {
      const wallet = new ethers.Wallet(pk, provider);
      return tokenAddresses.map(addr => limit(() => processTokenTransfer(wallet, addr)));
    });
    await Promise.all(tasks);
    if (global.gc) global.gc();
    console.log(chalk.green('✅ Batch done'));
  }
  console.log(chalk.green('🎉 All done'));
})();
