// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockStock. Testnet MSTK.
contract MockStock is ERC20, Ownable {
    constructor() ERC20("Mock Stock", "MSTK") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Mint 100k MSTK to the caller (testnet faucet).
    function drip() external {
        _mint(msg.sender, 100_000 ether);
    }
}
