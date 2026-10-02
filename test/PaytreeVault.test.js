const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PaytreeVault", function () {
  const TEN_K = ethers.parseEther("10000");
  const THREE_HUNDRED = ethers.parseEther("300");
  const POOL = ethers.parseEther("1000000");

  async function fixture() {
    const [owner, user, recipient] = await ethers.getSigners();
    const MockStock = await ethers.getContractFactory("MockStock");
    const MockUSDG = await ethers.getContractFactory("MockUSDG");
    const PaytreeVault = await ethers.getContractFactory("PaytreeVault");

    const stock = await MockStock.deploy();
    const usdg = await MockUSDG.deploy();
    const vault = await PaytreeVault.deploy(await stock.getAddress(), await usdg.getAddress());

    await stock.mint(user.address, TEN_K);
    await usdg.mint(owner.address, POOL);
    await usdg.connect(owner).approve(await vault.getAddress(), POOL);
    await vault.connect(owner).seedUsdg(POOL);

    return { owner, user, recipient, stock, usdg, vault };
  }

  it("full flow: deposit → $500 cap → spend → repay → withdraw", async function () {
    const { user, recipient, stock, usdg, vault } = await fixture();

    await stock.connect(user).approve(await vault.getAddress(), TEN_K);
    await vault.connect(user).deposit(TEN_K);

    expect(await vault.previewAllowance(user.address)).to.equal(ethers.parseEther("500"));

    await vault.connect(user).spend(recipient.address, THREE_HUNDRED);
    expect(await vault.debtUsdg(user.address)).to.equal(THREE_HUNDRED);
    expect(await usdg.balanceOf(recipient.address)).to.equal(THREE_HUNDRED);

    const remaining =
      (await vault.previewAllowance(user.address)) - (await vault.debtUsdg(user.address));
    expect(remaining).to.equal(ethers.parseEther("200"));

    await usdg.mint(user.address, THREE_HUNDRED);
    await usdg.connect(user).approve(await vault.getAddress(), THREE_HUNDRED);
    await vault.connect(user).repay(THREE_HUNDRED);
    expect(await vault.debtUsdg(user.address)).to.equal(0n);

    await vault.connect(user).withdraw();
    expect(await stock.balanceOf(user.address)).to.equal(TEN_K);
    expect(await vault.stockDeposited(user.address)).to.equal(0n);
  });

  it("rejects spend above allowance", async function () {
    const { user, recipient, stock, vault } = await fixture();
    await stock.connect(user).approve(await vault.getAddress(), TEN_K);
    await vault.connect(user).deposit(TEN_K);
    await expect(
      vault.connect(user).spend(recipient.address, ethers.parseEther("501"))
    ).to.be.revertedWithCustomError(vault, "InsufficientAllowance");
  });

  it("reverts spend when vault USDG pool is empty", async function () {
    const [owner, user, recipient] = await ethers.getSigners();
    const MockStock = await ethers.getContractFactory("MockStock");
    const MockUSDG = await ethers.getContractFactory("MockUSDG");
    const PaytreeVault = await ethers.getContractFactory("PaytreeVault");

    const stock = await MockStock.deploy();
    const usdg = await MockUSDG.deploy();
    const vault = await PaytreeVault.deploy(await stock.getAddress(), await usdg.getAddress());

    await stock.mint(user.address, TEN_K);
    // No seedUsdg — pool empty
    await stock.connect(user).approve(await vault.getAddress(), TEN_K);
    await vault.connect(user).deposit(TEN_K);

    await expect(
      vault.connect(user).spend(recipient.address, THREE_HUNDRED)
    ).to.be.reverted;
  });

  it("blocks withdraw with debt", async function () {
    const { user, recipient, stock, vault } = await fixture();
    await stock.connect(user).approve(await vault.getAddress(), TEN_K);
    await vault.connect(user).deposit(TEN_K);
    await vault.connect(user).spend(recipient.address, THREE_HUNDRED);
    await expect(vault.connect(user).withdraw()).to.be.revertedWithCustomError(
      vault,
      "OutstandingDebt"
    );
  });
});
