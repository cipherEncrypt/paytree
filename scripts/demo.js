const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployment() {
  const p = path.join(__dirname, "deployments.json");
  if (!fs.existsSync(p)) {
    throw new Error("Missing scripts/deployments.json. Run deploy first.");
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const deployment = loadDeployment();
  const [user] = await hre.ethers.getSigners();
  // Testnet deploy uses one key; recipient only needs an address for spend().
  const recipientAddress =
    (await hre.ethers.getSigners())[1]?.address ??
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const stock = await hre.ethers.getContractAt("MockStock", deployment.MockStock);
  const usdg = await hre.ethers.getContractAt("MockUSDG", deployment.MockUSDG);
  const vault = await hre.ethers.getContractAt("PaytreeVault", deployment.PaytreeVault);

  const depositAmount = hre.ethers.parseEther("10000");
  const spendAmount = hre.ethers.parseEther("300");
  const repayAmount = hre.ethers.parseEther("300");

  console.log("User:", user.address);
  console.log("Recipient:", recipientAddress);
  console.log("Vault:", deployment.PaytreeVault);

  let bal = await stock.balanceOf(user.address);
  if (bal < depositAmount) {
    console.log("Minting stock to user for demo...");
    const owner = await stock.owner();
    if (owner.toLowerCase() === user.address.toLowerCase()) {
      await (await stock.mint(user.address, depositAmount)).wait();
    } else {
      throw new Error("User has insufficient MSTK; redeploy or fund from owner");
    }
  }

  let tx = await stock.approve(deployment.PaytreeVault, depositAmount);
  console.log("approve stock tx:", tx.hash);
  await tx.wait();

  tx = await vault.deposit(depositAmount);
  console.log("deposit tx:", tx.hash);
  await tx.wait();

  const allowance = await vault.previewAllowance(user.address);
  const debt0 = await vault.debtUsdg(user.address);
  console.log("Allowance (5% of $10k):", hre.ethers.formatEther(allowance), "USDG");
  console.log("Debt:", hre.ethers.formatEther(debt0));

  tx = await vault.spend(recipientAddress, spendAmount);
  console.log("spend tx:", tx.hash);
  await tx.wait();

  const allowanceAfterSpend = await vault.previewAllowance(user.address);
  const debtAfterSpend = await vault.debtUsdg(user.address);
  const remaining = allowanceAfterSpend - debtAfterSpend;
  console.log("Remaining spendable:", hre.ethers.formatEther(remaining), "USDG");

  const usdgOwner = await usdg.owner();
  if (usdgOwner.toLowerCase() === user.address.toLowerCase()) {
    await (await usdg.mint(user.address, repayAmount)).wait();
  } else {
    throw new Error("Fund user with USDG for repay (or mint as MockUSDG owner)");
  }

  tx = await usdg.approve(deployment.PaytreeVault, repayAmount);
  console.log("approve usdg tx:", tx.hash);
  await tx.wait();

  tx = await vault.repay(repayAmount);
  console.log("repay tx:", tx.hash);
  await tx.wait();

  console.log("Debt after repay:", hre.ethers.formatEther(await vault.debtUsdg(user.address)));

  tx = await vault.withdraw();
  console.log("withdraw tx:", tx.hash);
  await tx.wait();

  console.log(
    "Stock back in wallet:",
    hre.ethers.formatEther(await stock.balanceOf(user.address)),
    "MSTK"
  );
  console.log(
    "Recipient USDG:",
    hre.ethers.formatEther(await usdg.balanceOf(recipientAddress))
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
