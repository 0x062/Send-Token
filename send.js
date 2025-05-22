import 'dotenv/config';
import fs from 'fs';
import { ethers } from 'ethers';
import pLimit from 'p-limit';
import promiseRetry from 'promise-retry';
import chunk from 'lodash.chunk';

// ======================== CONFIG ========================
const { RPC_URL, TO_ADDRESS } = process.env;
if (!RPC_URL || !TO_ADDRESS) {
  console.error('⚠️ Pastikan .env berisi RPC_URL dan TO_ADDRESS');
  process.exit(1);
}

// BATCH & CONCURRENCY SETTINGS
const WALLET_BATCH_SIZE = 10;  // jumlah wallet per batch
const TOKEN_CONCURRENCY = 5;   // max proses token paralel per wallet

let privateKeys;
try {
  const data = fs.readFileSync('privatekey.txt', 'utf8').trim();
  privateKeys = data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (privateKeys.length === 0) throw new Error();
} catch {
  console.error('⚠️ Gagal baca atau file privatekey.txt kosong');
  process.exit(1);
}

tokenAddresses = [
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
    const contract = new ethers.Contract(addr, erc20Abi, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    tokenMeta[addr] = { name, symbol, decimals };
  }
}

async function sendWithRetry(action, retries = 2) {
  return promiseRetry((retry, number) => {
    return action().catch(err => {
      console.warn(`⚠️ Attempt ${number} failed: ${err.message}. Retrying...`);
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
    console.log(`⚠️ ${symbol}: saldo 0, skip`);
    return;
  }
  const formatted = ethers.utils.formatUnits(balance, decimals);
  console.log(`\n🔹 ${symbol}: saldo ${formatted}`);

  const [estGas, feeData, block] = await Promise.all([
    contract.estimateGas.transfer(TO_ADDRESS, balance),
    provider.getFeeData(),
    provider.getBlock('latest'),
  ]);

  const gasLimit = estGas.mul(120).div(100);
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  const maxFeePerGas = block.baseFeePerGas.mul(2).add(maxPriorityFeePerGas);

  console.log(`⛽ estGas: ${estGas.toString()}, gasLimit: ${gasLimit.toString()}`);
  console.log(`⛽ maxPriorityFee: ${maxPriorityFeePerGas.toString()}`);
  console.log(`⛽ maxFee: ${maxFeePerGas.toString()}`);

  const tx = await sendWithRetry(() => contract.transfer(
    TO_ADDRESS,
    balance,
    { gasLimit, maxPriorityFeePerGas, maxFeePerGas }
  ));
  console.log(`📤 Tx hash: ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`✅ ${symbol} terkirim di block ${receipt.blockNumber}`);
}

;(async () => {
  console.log('🔌 Starting Batch Transfer with Retry Logic');
  await cacheTokenMetadata();

  const walletChunks = chunk(privateKeys, WALLET_BATCH_SIZE);
  for (const chunkKeys of walletChunks) {
    console.log(`\n🎛️ Processing wallet batch: ${chunkKeys.length} wallets`);
    const tasks = chunkKeys.flatMap(pk => {
      const wallet = new ethers.Wallet(pk, provider);
      return tokenAddresses.map(addr =>
        limit(() => processTokenTransfer(wallet, addr))
      );
    });

    await Promise.all(tasks);

    // optional: trigger garbage collection if exposed
    if (global.gc) global.gc();
    console.log('✅ Batch selesai, memori dibersihkan');
  }

  console.log('🎉 All wallets processed.');
})();
