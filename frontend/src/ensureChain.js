import { robinhoodTestnet } from "./chains.js";
import { CHAIN_ID } from "./contracts.js";

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

/** Add / switch MetaMask to Robinhood testnet before sending txs */
export async function ensureRobinhoodChain() {
  const ethereum = window.ethereum;
  if (!ethereum?.request) {
    throw new Error("No wallet found. Install MetaMask or Robinhood Wallet.");
  }

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (err) {
    if (err?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: robinhoodTestnet.name,
            rpcUrls: [...robinhoodTestnet.rpcUrls.default.http],
            nativeCurrency: robinhoodTestnet.nativeCurrency,
            blockExplorerUrls: [robinhoodTestnet.blockExplorers.default.url],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

export function formatWalletError(err) {
  if (!err) return "Transaction failed.";
  if (err.code === 4001 || err.code === "ACTION_REJECTED") {
    return "Transaction cancelled in your wallet.";
  }
  const msg =
    err.shortMessage ||
    err.details ||
    err.cause?.shortMessage ||
    err.cause?.message ||
    err.message ||
    "";
  if (/insufficient funds/i.test(msg)) {
    return "Not enough testnet ETH for gas. Get Robinhood testnet ETH from a faucet, then try again.";
  }
  if (/network/i.test(msg) && /match/i.test(msg)) {
    return "Wrong network. Switch to Robinhood testnet (chain 46630).";
  }
  return msg || "Transaction failed.";
}
