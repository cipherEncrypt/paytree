const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Network:", hre.network.name, "chainId:", network.chainId.toString());
  console.log("Deployer:", deployer.address);

  const MockStock = await hre.ethers.getContractFactory("MockStock");
  const stock = await MockStock.deploy();
  await stock.waitForDeployment();
  const stockAddress = await stock.getAddress();

  const MockUSDG = await hre.ethers.getContractFactory("MockUSDG");
  const usdg = await MockUSDG.deploy();
  await usdg.waitForDeployment();
  const usdgAddress = await usdg.getAddress();

  const PaytreeVault = await hre.ethers.getContractFactory("PaytreeVault");
  const vault = await PaytreeVault.deploy(stockAddress, usdgAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  const stockMint = hre.ethers.parseEther("100000");
  const usdgPool = hre.ethers.parseEther("1000000");

  await (await stock.mint(deployer.address, stockMint)).wait();
  await (await usdg.mint(deployer.address, usdgPool)).wait();
  await (await usdg.approve(vaultAddress, usdgPool)).wait();
  await (await vault.seedUsdg(usdgPool)).wait();

  const deployed = {
    chainId: network.chainId.toString(),
    network: hre.network.name,
    deployer: deployer.address,
    MockStock: stockAddress,
    MockUSDG: usdgAddress,
    PaytreeVault: vaultAddress,
    seededUsdg: usdgPool.toString(),
    mintedStockToDeployer: stockMint.toString(),
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(deployed, null, 2));

  console.log("\n=== Paytree deployed ===");
  console.log(JSON.stringify(deployed, null, 2));
  console.log("\nSaved to scripts/deployments.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
