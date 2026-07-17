// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {HandshakeEscrow} from "../src/HandshakeEscrow.sol";

contract HandshakeEscrowTest is Test {
    MockUSDC token;
    HandshakeEscrow escrow;

    address client = address(0xC1);
    address freelancer = address(0xF1);
    address arbiter = address(0xA1);
    uint256 amount = 125_000000; // 125 USDC, 6 decimals
    uint256 deadline;
    uint256 reviewWindow = 48 hours;

    function setUp() public {
        token = new MockUSDC();
        escrow = new HandshakeEscrow(address(token));
        deadline = block.timestamp + 7 days;
        token.mint(client, amount);
        vm.startPrank(client);
        token.approve(address(escrow), amount);
        vm.stopPrank();
    }

    function test_happyPath() public {
        // create (as client)
        vm.prank(client);
        uint256 id = escrow.createDeal(freelancer, arbiter, amount, deadline, reviewWindow);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Created));

        // fund
        vm.prank(client);
        escrow.fundDeal(id);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Funded));
        assertEq(token.balanceOf(address(escrow)), amount);

        // submit deliverable
        bytes32 hash = keccak256("ciphertext");
        vm.prank(freelancer);
        escrow.submitDeliverable(id, hash);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.UnderReview));
        assertEq(escrow.getDealCiphertextHash(id), hash);

        // approve
        vm.prank(client);
        escrow.approveDeal(id);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Released));
        assertEq(token.balanceOf(freelancer), amount);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_refundWhenNoDelivery() public {
        vm.prank(client);
        uint256 id = escrow.createDeal(freelancer, arbiter, amount, deadline, reviewWindow);
        vm.prank(client);
        escrow.fundDeal(id);

        // warp past deadline
        vm.warp(deadline + 1);
        vm.prank(client);
        escrow.claimRefund(id);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Refunded));
        assertEq(token.balanceOf(client), amount);
    }

    function test_autoReleaseAfterReviewTimeout() public {
        vm.prank(client);
        uint256 id = escrow.createDeal(freelancer, arbiter, amount, deadline, reviewWindow);
        vm.prank(client);
        escrow.fundDeal(id);
        vm.prank(freelancer);
        escrow.submitDeliverable(id, keccak256("ct"));

        // warp past review window
        vm.warp(block.timestamp + reviewWindow + 1);
        escrow.releaseAfterTimeout(id);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Released));
        assertEq(token.balanceOf(freelancer), amount);
    }

    function test_disputeThenArbiterRefunds() public {
        vm.prank(client);
        uint256 id = escrow.createDeal(freelancer, arbiter, amount, deadline, reviewWindow);
        vm.prank(client);
        escrow.fundDeal(id);
        vm.prank(freelancer);
        escrow.submitDeliverable(id, keccak256("ct"));

        vm.prank(client);
        escrow.openDispute(id);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Disputed));

        vm.prank(arbiter);
        escrow.resolveDispute(id, HandshakeEscrow.Outcome.Refund);
        assertEq(uint8(escrow.getState(id)), uint8(HandshakeEscrow.State.Resolved));
        assertEq(token.balanceOf(client), amount);
    }
}
