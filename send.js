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
const WALLET_BATCH_SIZE = 5;  // number of wallets per batch
const TOKEN_CONCURRENCY = 2;   // max parallel token processes per wallet

let privateKeys;
try {
  const data = fs.readFileSync('privatekey.txt', 'utf8').trim();
  privateKeys = data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (privateKeys.length === 0) throw new Error();
} catch {
  console.error(chalk.red('⚠️ Failed to read privatekey.txt or file is empty'));
  process.exit(1);
}

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

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const limit = pLimit(TOKEN_CONCURRENCY);
const tokenMeta = {};

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
      console.log(chalk.green(`✅ Cached metadata for token ${symbol} (${addr})`));
    } catch (err) {
      console.warn(chalk.yellow(`⚠️ Failed to fetch metadata for token at ${addr}, skipping`));
    }
  }
}

async function getGasFees(provider) {
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.utils.parseUnits('2', 'gwei');
  const maxFeePerGas = feeData.maxFeePerGas ?? ethers.utils.parseUnits('50', 'gwei');
  return { maxPriorityFeePerGas, maxFeePerGas };
}

async function sendWithRetry(action, retries = 2) {
  return promiseRetry((retry, number) => {
    return action().catch(err => {
      console.warn(chalk.yellow(`⚠️ Attempt ${number} failed: ${err.message}. Retrying...`));
      retry(err);
    });
  }, { retries, factor: 1.5, minTimeout: 500 });
}

async function processTokenTransfer(wallet, tokenAddr) {
  const { symbol, decimals } = tokenMeta[tokenAddr];
  const contract = new ethers.Contract(tokenAddr, erc20Abi, wallet);
  const address = await wallet.getAddress();

  const balance = await contract.balanceOf(address);
  if (balance.isZero()) {
    console.log(chalk.blue(`⚠️ ${symbol}: balance 0, skipping`));
    return;
  }
  const formatted = ethers.utils.formatUnits(balance, decimals);
  console.log(chalk.cyan(`\n🔹 ${symbol}: balance ${formatted}`));

  const estGas = await contract.estimateGas.transfer(TO_ADDRESS, balance);
  const gasLimit = estGas.mul(120).div(100); // 20% buffer

  const { maxPriorityFeePerGas, maxFeePerGas } = await getGasFees(provider);

  console.log(chalk.magenta(`⛽ Estimated Gas: ${estGas.toString()}, Gas Limit (with buffer): ${gasLimit.toString()}`));
  console.log(chalk.magenta(`⛽ Max Priority Fee Per Gas: ${maxPriorityFeePerGas.toString()}`));
  console.log(chalk.magenta(`⛽ Max Fee Per Gas: ${maxFeePerGas.toString()}`));

  const tx = await sendWithRetry(() => contract.transfer(
    TO_ADDRESS,
    balance,
    { gasLimit, maxPriorityFeePerGas, maxFeePerGas }
  ));
  console.log(chalk.green(`📤 Transaction Hash: ${tx.hash}`));
  const receipt = await tx.wait(1);
  console.log(chalk.green(`✅ ${symbol} transferred in block ${receipt.blockNumber}`));
}

;(async () => {
  console.log(chalk.yellow('🔌 Starting batch token transfers with retry logic'));
  await cacheTokenMetadata();

  const walletChunks = chunk(privateKeys, WALLET_BATCH_SIZE);
  for (const chunkKeys of walletChunks) {
    console.log(chalk.yellow(`\n🎛️ Processing wallet batch: ${chunkKeys.length} wallets`));
    const tasks = chunkKeys.flatMap(pk => {
      const wallet = new ethers.Wallet(pk, provider);
      return tokenAddresses.map(addr =>
        limit(() => processTokenTransfer(wallet, addr))
      );
    });

    await Promise.all(tasks);

    if (global.gc) global.gc();
    console.log(chalk.green('✅ Batch completed, memory cleaned'));
  }

  console.log(chalk.green('🎉 All wallets processed successfully.'));
})();
