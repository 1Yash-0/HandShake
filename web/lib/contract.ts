import { monadTestnet } from "./monad";
import mockUsdcAbi from "./abi-mockusdc.json";
import handshakeEscrowAbi from "./abi-handshakeescrow.json";

/**
 * Deployed contract addresses on Monad testnet (chainId 10143).
 *
 * Source of truth: contracts/addresses.json in the repo root, populated by the
 * Foundry broadcast at deploy time. Verified on MonadVision + Monadscan via the
 * monskills verification API (https://agents.devnads.com/v1/verify).
 *
 * Do NOT hardcode these anywhere else — import from here.
 */
export const MOCK_USDC_ADDRESS = "0x6499aB00482dCc693Fd844f162378E215d93Aac9" as const;
export const HANDSHAKE_ESCROW_ADDRESS = "0x989EA8716ba301185798223a44fBb84713AEEFC1" as const;

export const MOCK_USDC_ABI = mockUsdcAbi;
export const HANDSHAKE_ESCROW_ABI = handshakeEscrowAbi;

export const CHAIN = monadTestnet;
export const CHAIN_ID = monadTestnet.id;

/** USDC has 6 decimals (matches real USDC — see contracts/src/MockUSDC.sol). */
export const USDC_DECIMALS = 6;

/** Parse a human USDC amount into base units for contract calls. */
export function parseUsdc(amount: string): bigint {
  // Truncate to 6 decimals to avoid rounding up into insufficient-balance errors.
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || "0");
}

/** Format a base-unit USDC amount into a human-readable string (no trailing zeros). */
export function formatUsdc(units: bigint): string {
  const whole = units / 10n ** BigInt(USDC_DECIMALS);
  const frac = units % 10n ** BigInt(USDC_DECIMALS);
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Escrow state enum — must match contracts/src/HandshakeEscrow.sol State. */
export const DealState = {
  Created: 0,
  Funded: 1,
  UnderReview: 2,
  Released: 3,
  Refunded: 4,
  Disputed: 5,
  Resolved: 6,
} as const;

export type DealStateValue = (typeof DealState)[keyof typeof DealState];

export const DEAL_STATE_LABELS: Record<number, string> = {
  0: "Created",
  1: "Funded",
  2: "Under review",
  3: "Released",
  4: "Refunded",
  5: "Disputed",
  6: "Resolved",
};

/** Outcome enum — must match contracts/src/HandshakeEscrow.sol Outcome. */
export const DisputeOutcome = {
  Release: 0,
  Refund: 1,
  Split: 2,
} as const;

export type DisputeOutcomeValue = (typeof DisputeOutcome)[keyof typeof DisputeOutcome];
