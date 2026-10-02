import vaultArtifact from "./generated/abis/PaytreeVault.json";
import stockArtifact from "./generated/abis/MockStock.json";
import usdgArtifact from "./generated/abis/MockUSDG.json";
import deployment from "./generated/deployments.json";

export const CHAIN_ID = Number(deployment.chainId);

export const ADDRESSES = {
  vault: deployment.PaytreeVault,
  stock: deployment.MockStock,
  usdg: deployment.MockUSDG,
};

export const vaultAbi = vaultArtifact.abi;
export const stockAbi = stockArtifact.abi;
export const usdgAbi = usdgArtifact.abi;
