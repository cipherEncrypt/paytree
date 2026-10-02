// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PaytreeVault. Lock stock, spend USDG from the vault pool.
/// @notice 5% allowance on 1:1 notional (1 token = $1). No oracle in this version.
contract PaytreeVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant ALLOWANCE_BPS = 500; // 5%

    IERC20 public immutable stockToken;
    IERC20 public immutable usdgToken;

    mapping(address => uint256) public stockDeposited;
    mapping(address => uint256) public debtUsdg;

    event Deposited(address indexed user, uint256 stockAmount);
    event Spent(address indexed user, address indexed to, uint256 usdgAmount);
    event Repaid(address indexed user, uint256 usdgAmount);
    event Withdrawn(address indexed user, uint256 stockAmount);
    event UsdgSeeded(uint256 amount);

    error ZeroAmount();
    error InvalidRecipient();
    error InsufficientAllowance();
    error OutstandingDebt();
    error NoStockDeposited();

    constructor(address stock_, address usdg_) Ownable(msg.sender) {
        stockToken = IERC20(stock_);
        usdgToken = IERC20(usdg_);
    }

    /// @notice Spendable USDG cap = 5% of deposited stock notional (computed, not stored).
    function previewAllowance(address user) public view returns (uint256) {
        return (stockDeposited[user] * ALLOWANCE_BPS) / 10_000;
    }

    function deposit(uint256 stockAmount) external nonReentrant {
        if (stockAmount == 0) revert ZeroAmount();
        stockToken.safeTransferFrom(msg.sender, address(this), stockAmount);
        stockDeposited[msg.sender] += stockAmount;
        emit Deposited(msg.sender, stockAmount);
    }

    /// @notice Draw USDG from the vault cash pool; stock remains locked as collateral.
    function spend(address to, uint256 usdgAmount) external nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (usdgAmount == 0) revert ZeroAmount();

        uint256 cap = previewAllowance(msg.sender);
        if (debtUsdg[msg.sender] + usdgAmount > cap) revert InsufficientAllowance();

        debtUsdg[msg.sender] += usdgAmount;
        usdgToken.safeTransfer(to, usdgAmount);
        emit Spent(msg.sender, to, usdgAmount);
    }

    function repay(uint256 usdgAmount) external nonReentrant {
        if (usdgAmount == 0) revert ZeroAmount();

        uint256 debt = debtUsdg[msg.sender];
        uint256 pay = usdgAmount > debt ? debt : usdgAmount;
        if (pay == 0) revert ZeroAmount();

        usdgToken.safeTransferFrom(msg.sender, address(this), pay);
        debtUsdg[msg.sender] = debt - pay;
        emit Repaid(msg.sender, pay);
    }

    function withdraw() external nonReentrant {
        if (debtUsdg[msg.sender] != 0) revert OutstandingDebt();
        uint256 amount = stockDeposited[msg.sender];
        if (amount == 0) revert NoStockDeposited();

        stockDeposited[msg.sender] = 0;
        stockToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Fund the vault USDG cash pool (one-time or top-up by owner).
    function seedUsdg(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        usdgToken.safeTransferFrom(msg.sender, address(this), amount);
        emit UsdgSeeded(amount);
    }
}
