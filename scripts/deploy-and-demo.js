const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function deploy() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  const MockStock = await hre.ethers.getContractFactory("MockStock");
  const stock = await MockStock.deploy();
  await stock.waitForDeployment();

  const MockUSDG = await hre.ethers.getContractFactory("MockUSDG");
  const usdg = await MockUSDG.deploy();
  await usdg.waitForDeployment();

  const PaytreeVault = await hre.ethers.getContractFactory("PaytreeVault");
  const vault = await PaytreeVault.deploy(await stock.getAddress(), await usdg.getAddress());
  await vault.waitForDeployment();

  const stockMint = hre.ethers.parseEther("100000");
  const usdgPool = hre.ethers.parseEther("1000000");
  const vaultAddress = await vault.getAddress();

  await (await stock.mint(deployer.address, stockMint)).wait();
  await (await usdg.mint(deployer.address, usdgPool)).wait();
  await (await usdg.approve(vaultAddress, usdgPool)).wait();
  await (await vault.seedUsdg(usdgPool)).wait();

  const deployed = {
    chainId: network.chainId.toString(),
    network: hre.network.name,
    deployer: deployer.address,
    MockStock: await stock.getAddress(),
    MockUSDG: await usdg.getAddress(),
    PaytreeVault: vaultAddress,
  };

  fs.writeFileSync(path.join(__dirname, "deployments.json"), JSON.stringify(deployed, null, 2));
  console.log("Deployed:", deployed);
  return deployed;
}

async function runDemo(deployment) {
  const [user, recipient] = await hre.ethers.getSigners();
  const stock = await hre.ethers.getContractAt("MockStock", deployment.MockStock);
  const usdg = await hre.ethers.getContractAt("MockUSDG", deployment.MockUSDG);
  const vault = await hre.ethers.getContractAt("PaytreeVault", deployment.PaytreeVault);

  const depositAmount = hre.ethers.parseEther("10000");
  const spendAmount = hre.ethers.parseEther("300");
  const repayAmount = hre.ethers.parseEther("300");

  let tx = await stock.approve(deployment.PaytreeVault, depositAmount);
  console.log("1. approve stock:", tx.hash);
  await tx.wait();

  tx = await vault.deposit(depositAmount);
  console.log("2. deposit $10k stock:", tx.hash);
  await tx.wait();

  console.log("   allowance:", hre.ethers.formatEther(await vault.previewAllowance(user.address)), "USDG");

  tx = await vault.spend(recipient.address, spendAmount);
  console.log("3. spend $300:", tx.hash);
  await tx.wait();

  const remaining =
    (await vault.previewAllowance(user.address)) - (await vault.debtUsdg(user.address));
  console.log("   remaining spendable:", hre.ethers.formatEther(remaining), "USDG");

  // Demo: user received USDG elsewhere; mint repay amount from token owner for the script.
  await (await usdg.mint(user.address, repayAmount)).wait();

  tx = await usdg.approve(deployment.PaytreeVault, repayAmount);
  console.log("4. approve usdg repay:", tx.hash);
  await tx.wait();

  tx = await vault.repay(repayAmount);
  console.log("5. repay $300:", tx.hash);
  await tx.wait();

  tx = await vault.withdraw();
  console.log("6. withdraw stock:", tx.hash);
  await tx.wait();

  console.log("Done. Recipient USDG:", hre.ethers.formatEther(await usdg.balanceOf(recipient.address)));
}

async function main() {
  const reuse = process.env.REUSE_DEPLOYMENT === "1";
  let deployment;
  if (reuse && fs.existsSync(path.join(__dirname, "deployments.json"))) {
    deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "deployments.json"), "utf8"));
    console.log("Reusing", deployment);
  } else {
    deployment = await deploy();
  }
  await runDemo(deployment);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
