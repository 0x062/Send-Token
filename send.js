import 'dotenv/config';
import fs from 'fs';
import { ethers } from 'ethers';
import pLimit from 'p-limit';
import promiseRetry from 'promise-retry';
import chunk from 'lodash.chunk';
import chalk from 'chalk';

const { RPC_URL, TO_ADDRESS } = process.env;
if (!RPC_URL || !TO_ADDRESS) {
  console.error(chalk.red('❌ Missing RPC_URL or TO_ADDRESS in .env'));
  process.exit(1);
}

const WALLET_BATCH_SIZE = 10;
const TOKEN_CONCURRENCY = 5;
const RETRY_ATTEMPTS = 3;

function loadPrivateKeys(filePath = 'privatekey.txt') {
  try {
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Empty private key list');
    return lines;
  } catch (err) {
    console.error(chalk.red('❌ Failed to read private keys:'), err.message);
    process.exit(1);
  }
}

const privateKeys = loadPrivateKeys();

const tokenAddresses = [
  '0x2d5a4f5634041f50180A25F26b2A8364452E3152',
  '0x1428444Eacdc0Fd115dd4318FcE65B61Cd1ef399',
  '0xf4BE938070f59764C85fAcE374F92A4670ff3877',
  '0x8802b7bcF8EedCc9E1bA6C20E139bEe89dd98E83',
  '0xBEbF4E25652e7F23CCdCCcaaCB32004501c4BfF8',
  '0xFF27D611ab162d7827bbbA59F140C1E7aE56e95C',
];

const erc20Abi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const limit = pLimit(TOKEN_CONCURRENCY);
const tokenMeta = {};

async function cacheTokenMetadata() {
  for (const address of tokenAddresses) {
    try {
      const contract = new ethers.Contract(address, erc20Abi, provider);
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals()
      ]);
      tokenMeta[address] = { name, symbol, decimals };
    } catch (err) {
      console.warn(chalk.yellow(`⚠️ Failed fetching metadata for ${address}: ${err.message}`));
    }
  }
}

async function sendWithRetry(action, retries = RETRY_ATTEMPTS) {
  return promiseRetry((retry, attempt) => {
    return action().catch(err => {
      console.warn(chalk.yellow(`⚠️ Attempt ${attempt} failed: ${err.message}`));
      retry(err);
    });
  }, { retries, factor: 2, minTimeout: 1000 });
}

async function processTokenTransfer(wallet, tokenAddr) {
  const { symbol, decimals } = tokenMeta[tokenAddr] || {};
  if (!symbol) {
    console.warn(chalk.yellow(`⚠️ Metadata not found for token ${tokenAddr}, skipping.`));
    return;
  }
  const contract = new ethers.Contract(tokenAddr, erc20Abi, wallet);
  const address = await wallet.getAddress();
  const balance = await contract.balanceOf(address);

  if (balance.isZero()) {
    console.log(chalk.gray(`⏩ ${symbol}: balance 0, skipping.`));
    return;
  }
  const formatted = ethers.utils.formatUnits(balance, decimals);
  console.log(chalk.cyan(`\n🔹 ${symbol} Balance: ${formatted}`));

  const estGas = await contract.estimateGas.transfer(TO_ADDRESS, balance);
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.utils.parseUnits('2', 'gwei');
  const maxFeePerGas = feeData.maxFeePerGas || ethers.utils.parseUnits('50', 'gwei');
  const gasLimit = estGas.mul(110).div(100);

  const tx = await sendWithRetry(() => contract.transfer(
    TO_ADDRESS,
    balance,
    { gasLimit, maxPriorityFeePerGas, maxFeePerGas }
  ));

  console.log(chalk.green(`📤 Sent ${symbol} TX: ${tx.hash}`));
  const receipt = await tx.wait(1);
  console.log(chalk.green(`✅ Confirmed in block ${receipt.blockNumber}`));
}

(async () => {
  console.log(chalk.bold.blue('🚀 Starting ERC20 Batch Transfers'));
  await cacheTokenMetadata();

  const walletChunks = chunk(privateKeys, WALLET_BATCH_SIZE);
  for (const [index, batch] of walletChunks.entries()) {
    console.log(chalk.magenta(`\n📦 Batch ${index + 1}/${walletChunks.length}`));

    const tasks = batch.flatMap(pk => {
      const wallet = new ethers.Wallet(pk, provider);
      return tokenAddresses.map(addr => limit(() => processTokenTransfer(wallet, addr)));
    });

    await Promise.all(tasks);
    if (global.gc) global.gc();
    console.log(chalk.gray(`🧹 Batch ${index + 1} done. Memory cleaned.`));
  }

  console.log(chalk.bold.green('\n🎉 All transfers completed.'));
})();
