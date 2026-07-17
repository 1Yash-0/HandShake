// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Clearly-labeled test ERC-20 standing in for USDC on Monad testnet.
///         6 decimals to match real USDC. Anyone may mint on testnet for the demo.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    /// @notice Faucet for the demo. Mint test tokens to any address.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
