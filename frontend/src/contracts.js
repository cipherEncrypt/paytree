import vaultArtifact from "../../artifacts/contracts/PaytreeVault.sol/PaytreeVault.json";
import stockArtifact from "../../artifacts/contracts/MockStock.sol/MockStock.json";
import usdgArtifact from "../../artifacts/contracts/MockUSDG.sol/MockUSDG.json";
import deployment from "../../scripts/deployments.json";

export const CHAIN_ID = Number(deployment.chainId);

export const ADDRESSES = {
  vault: deployment.PaytreeVault,
  stock: deployment.MockStock,
  usdg: deployment.MockUSDG,
};

export const vaultAbi = vaultArtifact.abi;
export const stockAbi = stockArtifact.abi;
export const usdgAbi = usdgArtifact.abi;
