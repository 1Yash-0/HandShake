# Handshake

**Payment-protected handoffs for informal digital work, on Monad testnet.**

The client cannot lose their money, and the freelancer cannot lose control of the final work. A deal that today lives in a Discord DM — $125 for a brand kit, $40 for a logo touch-up — gets a real escrow contract with encrypted delivery, deadlines enforced in code, and an auto-release path for when the client ghosts.

Built for the **BuildAnything "Spark" hackathon**. Live on **Monad testnet** (chain id 10143).

---

## Why this exists

Small digital deals have a trust problem. Either the client pays upfront and hopes the work lands (pay-then-pray), or the freelancer ships first and hopes the invoice gets paid (ship-and-pray). One party always eats the downside. Handshake makes the **contract** hold the risk instead.

The promise:

- The **client** funds USDC into escrow *before* the freelancer ships. They can't lose their money to a ghost.
- The **freelancer** encrypts the deliverable in-browser and commits only its hash onchain. They can't lose control of the original. The key is released only when the contract says the deal is `Released`.
- If the **client ghosts** after delivery, anyone can call `releaseAfterTimeout` — the contract auto-pays the freelancer after the review window closes.
- If the **freelancer disappears**, the client calls `claimRefund` after the deadline. Full escrow returned.
- If there's a **dispute**, an arbiter resolves it: release, refund, or split 50/50.

---

## Architecture

```
handshake/
├── contracts/                    # Foundry — Solidity
│   ├── src/
│   │   ├── HandshakeEscrow.sol    # Full 8-function state machine (deployed once)
│   │   └── MockUSDC.sol           # Labeled test ERC-20 (6 decimals)
│   ├── foundry.toml               # eth-rpc-url + chain_id 10143
│   ├── script/Deploy.s.sol        # Deploys MockUSDC + Escrow
│   ├── addresses.json             # Source of truth for deployed addresses
│   └── broadcast/                # Forge broadcast receipts (gitignored)
├── web/                          # Next.js (App Router) + wagmi v3 + viem
│   ├── app/
│   │   ├── page.tsx               # landing (smooth-scroll + scrubbed reveals + parallax)
│   │   ├── create/page.tsx        # create deal + mint test USDC
│   │   ├── deal/[id]/page.tsx     # client deal view, per-state actions, unlock path
│   │   ├── handoff/[id]/page.tsx  # freelancer encrypt + upload + submit hash
│   │   ├── timeline/[id]/page.tsx # real onchain event log + edge-case state previews
│   │   └── api/
│   │       ├── upload/            # POST ciphertext → Vercel Blob
│   │       ├── key/                # GET ?dealId= → key if onchain Released else 403
│   │       ├── key/store/          # POST raw 32-byte AES key (gated store)
│   │       └── blob/              # list + sidecar routes for the unlock path
│   ├── components/                # Topbar, ConnectButton, EscrowOrbit, motion/
│   └── lib/
│       ├── monad.ts              # chain config (explorers override) + tx/address links
│       ├── contract.ts          # ABIs + deployed addresses + parseUsdc/formatUsdc
│       └── crypto.ts            # Web Crypto AES-GCM 256 + SHA-256
└── .monskills                   # built-with=monskills / chain=monad-testnet
```

### Onchain vs offchain split

**Onchain (HandshakeEscrow):** deal state, parties (client/freelancer/arbiter), amount, deadlines, ciphertext hash, outcome events. Nothing else.

**Offchain:** the file itself (encrypted, in Vercel Blob), the AES key (in a gated store, only returned when the onchain state is `Released`), the IV + filename + size sidecar.

The trust gate: `/api/key` reads `HandshakeEscrow.getState(dealId)` on **every** request. It returns the AES key only when the contract says state == `Released` (3). A malicious client can call the endpoint with any deal id — they only get the key for deals the contract has actually released.

---

## Deployed contracts

**Monad testnet (chain id 10143).** Verified on MonadVision + Monadscan via the monskills verification API.

| Contract | Address | Explorer |
|---|---|---|
| MockUSDC | `0x6499aB00482dCc693Fd844f162378E215d93Aac9` | [MonadVision](https://testnet.monadvision.com/address/0x6499aB00482dCc693Fd844f162378E215d93Aac9) · [Monadscan](https://testnet.monadscan.com/address/0x6499aB00482dCc693Fd844f162378E215d93Aac9) |
| HandshakeEscrow | `0x989EA8716ba301185798223a44fBb84713AEEFC1` | [MonadVision](https://testnet.monadvision.com/address/0x989EA8716ba301185798223a44fBb84713AEEFC1) · [Monadscan](https://testnet.monadscan.com/address/0x989EA8716ba301185798223a44fBb84713AEEFC1) |

Source of truth: [`contracts/addresses.json`](contracts/addresses.json) (also records deploy txs, verification GUIDs, constructor args).

Compiler: `solc v0.8.28+commit.7893614a`, `evmVersion=prague`, optimizer 200 runs.

---

## The escrow state machine

```
Created ──fundDeal──▶ Funded ──submitDeliverable──▶ UnderReview ──approveDeal──▶ Released
                      │                              │
                      │                              ├──openDispute──▶ Disputed ──resolveDispute──▶ Resolved
                      │                              │
                      │                              └──releaseAfterTimeout──▶ Released  (client ghosts)
                      │
                      └──claimRefund (after deadline, no delivery)──▶ Refunded
```

Functions (all on `HandshakeEscrow`, full Solidity in [`contracts/src/HandshakeEscrow.sol`](contracts/src/HandshakeEscrow.sol)):

| Function | Caller | State transition | Wired? |
|---|---|---|---|
| `createDeal(freelancer, arbiter, amount, deadline, reviewWindow)` | client | → Created | ✅ `/create` |
| `fundDeal(id)` | client | Created → Funded | ✅ `/deal/[id]` |
| `submitDeliverable(id, ciphertextHash)` | freelancer | Funded → UnderReview | ✅ `/handoff/[id]` |
| `approveDeal(id)` | client | UnderReview → Released | ✅ `/deal/[id]` |
| `openDispute(id)` | client | UnderReview → Disputed | ✅ `/deal/[id]` |
| `resolveDispute(id, outcome)` | arbiter | Disputed → Resolved | state-preview |
| `claimRefund(id)` | client | Funded → Refunded | state-preview |
| `releaseAfterTimeout(id)` | anyone | UnderReview → Released | state-preview |

The **happy path** (create → fund → encrypt + submit → approve → unlock) is fully wired end-to-end. The **edge cases** (dispute resolution, refund, timeout auto-release) are deployed and callable — the timeline page renders them as clearly-labeled *state previews* showing the function and the state transition, not faked as executed.

---

## Local setup

### Prerequisites
- Node 20+ (built and tested on Node 24)
- A MetaMask wallet configured for Monad testnet (chain id 10143, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadvision.com`)

### Frontend only (the fastest path — contracts are already deployed)

```bash
cd web
npm install
npm run dev
# open http://localhost:3000
```

Connect MetaMask, switch to Monad testnet if prompted, then go to `/create` and run the demo flow below.

### Full stack (contracts + frontend)

```bash
# Contracts — requires Foundry (forge, cast)
cd contracts
forge install                              # pulls OpenZeppelin
forge build

# (Deploy is already done — addresses in addresses.json. To redeploy:)
# 1. Fund a wallet from https://testnet.monad.xyz/faucet
# 2. forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz \
#      --broadcast --private-key $PRIVATE_KEY --slow
# 3. Update web/lib/contract.ts with the new addresses

# Frontend
cd ../web
npm install
npm run dev
```

### Environment variables

Set these in `web/.env.local` (or in the Vercel project settings for production):

```env
# Required for the encrypted-handoff flow (ciphertext + key storage)
BLOB_READ_WRITE_TOKEN=vercel_blob_xxxxxx   # from https://vercel.com/dashboard/stores
```

Get a Blob token by creating a Vercel Blob store at https://vercel.com/dashboard/stores and copying the read-write token.

The frontend runs **without** `BLOB_READ_WRITE_TOKEN` — landing, create, and deal-view all work. Only the encrypted-handoff upload path (step 3 of the demo flow) and the key-release unlock path (step 5) need it.

---

## Demo flow (the happy path)

You'll need **two** browser sessions to play both roles. Easiest: one normal window (the client) + one incognito window (the freelancer), each with MetaMask connected to a different test account.

### Step 1 — Mint test USDC (client)

1. Open `http://localhost:3000` in the client window, connect MetaMask.
2. Click **"Run the $125 demo"** → `/create`.
3. In the right sidebar, click **"Mint 1,000 test USDC"**. Sign the MetaMask tx.
4. Your test USDC balance shows ~1000.

### Step 2 — Create the deal (client)

1. In the form, paste the **freelancer's** address (from your second MetaMask account).
2. Amount: `125`. Review window: `48` hours. Deadline: `7` days.
3. Click **"Create deal (2 txs)"**. Sign the `approve` tx (allows the escrow to pull 125 USDC), then sign the `createDeal` tx.
4. You're redirected to `/deal/0`.

### Step 3 — Fund escrow (client)

1. On `/deal/0`, click **"Fund 125 USDC"**. Sign the `fundDeal` tx.
2. The pill flips to **Funded**.

### Step 4 — Encrypt and submit the deliverable (freelancer)

1. Open `http://localhost:3000/deal/0` in the freelancer window, switch MetaMask to the freelancer account.
2. Click **"Encrypt & submit deliverable"** → `/handoff/0`.
3. Pick any file (try a small text or image file for the demo).
4. Click **"Encrypt & submit"**. The browser:
   - Generates a fresh AES-GCM 256 key.
   - Encrypts the file in-memory (plaintext never leaves the tab).
   - Uploads the ciphertext to Vercel Blob.
   - Uploads the AES key to the gated key store.
   - Uploads an IV + filename + size sidecar.
   - Submits `submitDeliverable(dealId, sha256(ciphertext))` onchain.
5. You see the ciphertext hash + the submit tx link. The deal pill flips to **Under review**.

### Step 5 — Approve and release (client)

1. Back in the client window, refresh `/deal/0`.
2. Click **"Approve & release"**. Sign the `approveDeal` tx.
3. The contract pays 125 USDC to the freelancer and emits `Released`. The pill flips to **Released**.

### Step 6 — Unlock the original (client)

1. On the same page, click **"Unlock original"**.
2. The browser:
   - Calls `/api/key?dealId=0` — the API reads `getState(0)` onchain, sees `Released`, returns the AES key.
   - Fetches the ciphertext blob + the IV sidecar.
   - Decrypts the file in-memory with the released key.
   - Triggers a download of the original file.
3. The file you get back is byte-identical to what the freelancer uploaded. The hash onchain proves it.

### Verify on chain

Every step above is a real tx. Open the timeline at `/timeline/0` to see every event the contract emitted, each with a real MonadVision tx link.

---

## What's not wired yet (honest)

- `resolveDispute`, `claimRefund`, `releaseAfterTimeout` are deployed and callable from a script or block explorer, but the UI only renders them as **state previews** in the timeline. Upgrading them to real UI buttons is the natural next step.
- The arbiter role is wired into the contract (the `resolveDispute` caller must match `deal.arbiter`). The UI doesn't have an arbiter screen yet — for the demo, the arbiter defaults to the client's own address.
- The key-release API stores keys in Vercel Blob at a deterministic path. For production this should be a KMS or DB with per-deal isolation.

---

## Built with

- **Monad testnet** (chain id 10143) — `https://testnet-rpc.monad.xyz`
- **Foundry** — Solidity contracts, deployment, verification
- **OpenZeppelin** — ERC20, SafeERC20, ReentrancyGuard
- **wagmi v3** + **viem** — React hooks + EVM client
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Framer Motion** + **Lenis** — scroll-scrubbed reveals + parallax + smooth-scroll
- **Vercel Blob** — ciphertext + key + sidecar storage
- **Web Crypto API** — AES-GCM 256, in-browser encryption
- **monskills** — the Monad scaffold/verification toolchain (verified on MonadVision + Monadscan with one API call)

---

## License

MIT.
