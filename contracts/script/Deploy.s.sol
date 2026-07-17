// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {HandshakeEscrow} from "../src/HandshakeEscrow.sol";

contract Deploy is Script {
    function run() external returns (MockUSDC token, HandshakeEscrow escrow) {
        vm.startBroadcast();
        token = new MockUSDC();
        escrow = new HandshakeEscrow(address(token));
        vm.stopBroadcast();

        // Console log for deployment readability.
        console.log("MockUSDC:", address(token));
        console.log("HandshakeEscrow:", address(escrow));
    }
}
