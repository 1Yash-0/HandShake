// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title HandshakeEscrow
/// @notice Payment-protected handoff for informal digital work. The client funds USDC
///         into escrow, the freelancer submits an encrypted deliverable (only its hash
///         lives onchain), and the client approves to release payment and unlock the
///         decryption key. Deadlines and refunds are enforced by code.
///
///         Onchain: deal state, parties, amount, deadlines, ciphertext hash, outcomes.
///         Offchain: the file itself, the brief, the AES key (released by a backend that
///         watches the Released event).
///
/// @dev State machine:
///        Created -> Funded -> UnderReview -> Released   (approve or timeout)
///                              UnderReview -> Disputed -> Resolved (arbiter)
///        Funded  -> Refunded                            (no delivery by deadline)
contract HandshakeEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Created, // deal terms committed, not yet funded
        Funded, // client locked USDC, awaiting deliverable
        UnderReview, // freelancer submitted ciphertext hash, client reviewing
        Released, // freelancer paid (approved or review-window expired)
        Refunded, // client refunded (no delivery by deadline)
        Disputed, // client opened a dispute, funds locked pending arbiter
        Resolved // arbiter resolved the dispute (terminal)
    }

    enum Outcome {
        Release, // pay freelancer
        Refund, // return client
        Split // 50/50
    }

    struct Deal {
        address client;
        address freelancer;
        address arbiter;
        uint256 amount; // USDC, 6 decimals
        uint256 deadline; // delivery deadline (unix seconds)
        uint256 reviewWindow; // review-window length (seconds)
        uint256 reviewEnd; // 0 until deliverable submitted
        bytes32 ciphertextHash; // hash of the encrypted file, committed on submission
        State state;
    }

    IERC20 public immutable token;
    Deal[] public deals;

    event DealCreated(uint256 indexed id, address indexed client, address indexed freelancer, address arbiter, uint256 amount, uint256 deadline, uint256 reviewWindow);
    event Funded(uint256 indexed id);
    event DeliverableSubmitted(uint256 indexed id, bytes32 ciphertextHash);
    event Approved(uint256 indexed id);
    event Disputed(uint256 indexed id);
    event Resolved(uint256 indexed id, Outcome outcome);
    event Refunded(uint256 indexed id);
    event Released(uint256 indexed id);

    constructor(address tokenAddress) {
        token = IERC20(tokenAddress);
    }

    // -----------------------------------------------------------------------
    // Core flow (wired to the UI happy path)
    // -----------------------------------------------------------------------

    /// @notice Create a deal. Caller is the client. USDC is not moved yet.
    function createDeal(
        address freelancer,
        address arbiter,
        uint256 amount,
        uint256 deadline,
        uint256 reviewWindow
    ) external returns (uint256 id) {
        require(freelancer != address(0), "freelancer zero");
        require(amount > 0, "amount zero");
        require(deadline > block.timestamp, "deadline passed");
        require(reviewWindow > 0, "review zero");
        id = deals.length;
        deals.push(
            Deal({
                client: msg.sender,
                freelancer: freelancer,
                arbiter: arbiter,
                amount: amount,
                deadline: deadline,
                reviewWindow: reviewWindow,
                reviewEnd: 0,
                ciphertextHash: bytes32(0),
                state: State.Created
            })
        );
        emit DealCreated(id, msg.sender, freelancer, arbiter, amount, deadline, reviewWindow);
    }

    /// @notice Client funds the deal. Pulls USDC via transferFrom (client must approve first).
    function fundDeal(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.Created, "not created");
        require(msg.sender == d.client, "not client");
        token.safeTransferFrom(msg.sender, address(this), d.amount);
        d.state = State.Funded;
        emit Funded(id);
    }

    /// @notice Freelancer commits the encrypted file's hash. Opens the review window.
    function submitDeliverable(uint256 id, bytes32 ciphertextHash) external {
        Deal storage d = deals[id];
        require(d.state == State.Funded, "not funded");
        require(msg.sender == d.freelancer, "not freelancer");
        require(block.timestamp <= d.deadline, "deadline passed");
        require(ciphertextHash != bytes32(0), "hash zero");
        d.ciphertextHash = ciphertextHash;
        d.reviewEnd = block.timestamp + d.reviewWindow;
        d.state = State.UnderReview;
        emit DeliverableSubmitted(id, ciphertextHash);
    }

    /// @notice Client approves. Releases payment to the freelancer.
    function approveDeal(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.UnderReview, "not under review");
        require(msg.sender == d.client, "not client");
        d.state = State.Released;
        token.safeTransfer(d.freelancer, d.amount);
        emit Approved(id);
        emit Released(id);
    }

    // -----------------------------------------------------------------------
    // Edge cases (full state machine, wired to honest state-previews for now)
    // -----------------------------------------------------------------------

    /// @notice Client opens a dispute during the review window. Funds stay locked.
    function openDispute(uint256 id) external {
        Deal storage d = deals[id];
        require(d.state == State.UnderReview, "not under review");
        require(msg.sender == d.client, "not client");
        require(block.timestamp <= d.reviewEnd, "review ended");
        d.state = State.Disputed;
        emit Disputed(id);
    }

    /// @notice Arbiter resolves a dispute: release, refund, or split.
    function resolveDispute(uint256 id, Outcome outcome) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.Disputed, "not disputed");
        require(msg.sender == d.arbiter, "not arbiter");
        d.state = State.Resolved;
        if (outcome == Outcome.Release) {
            token.safeTransfer(d.freelancer, d.amount);
        } else if (outcome == Outcome.Refund) {
            token.safeTransfer(d.client, d.amount);
        } else {
            // split 50/50
            uint256 half = d.amount / 2;
            token.safeTransfer(d.freelancer, half);
            token.safeTransfer(d.client, d.amount - half);
        }
        emit Resolved(id, outcome);
        if (outcome == Outcome.Release) emit Released(id);
    }

    /// @notice Client reclaims the escrow if the freelancer never delivered by the deadline.
    function claimRefund(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.Funded, "not funded");
        require(msg.sender == d.client, "not client");
        require(block.timestamp > d.deadline, "deadline not passed");
        d.state = State.Refunded;
        token.safeTransfer(d.client, d.amount);
        emit Refunded(id);
    }

    /// @notice Anyone can trigger auto-payout once the review window closes with no dispute.
    ///         This is the "client ghosts" outcome.
    function releaseAfterTimeout(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.UnderReview, "not under review");
        require(block.timestamp > d.reviewEnd, "review not ended");
        d.state = State.Released;
        token.safeTransfer(d.freelancer, d.amount);
        emit Released(id);
    }

    // -----------------------------------------------------------------------
    // Reads
    // -----------------------------------------------------------------------

    function getDeal(uint256 id)
        external
        view
        returns (
            address client,
            address freelancer,
            address arbiter,
            uint256 amount,
            uint256 deadline,
            uint256 reviewWindow,
            uint256 reviewEnd,
            bytes32 ciphertextHash,
            State state
        )
    {
        Deal storage d = deals[id];
        return (
            d.client,
            d.freelancer,
            d.arbiter,
            d.amount,
            d.deadline,
            d.reviewWindow,
            d.reviewEnd,
            d.ciphertextHash,
            d.state
        );
    }

    function dealCount() external view returns (uint256) {
        return deals.length;
    }

    /// @dev Convenience single-field reads the frontend polls cheaply.
    function getState(uint256 id) external view returns (State) {
        return deals[id].state;
    }

    function getDealCiphertextHash(uint256 id) external view returns (bytes32) {
        return deals[id].ciphertextHash;
    }

    function getReviewEnd(uint256 id) external view returns (uint256) {
        return deals[id].reviewEnd;
    }
}
