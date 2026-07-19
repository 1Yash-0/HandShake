import { defineChain } from "viem";
import { monadTestnet as viemMonadTestnet } from "viem/chains";

/**
 * Monad testnet, configured for Handshake.
 *
 * viem ships `monadTestnet` (id 10143, RPC https://testnet-rpc.monad.xyz) but
 * only lists the generic `monadexplorer.com` block explorer. We re-export the
 * chain with our verified explorers (MonadVision, Monadscan, Socialscan) so
 * every tx link in the UI points somewhere a judge can actually open.
 */
export const monadTestnet = defineChain({
  ...viemMonadTestnet,
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
    monadscan: { name: "Monadscan", url: "https://testnet.monadscan.com" },
    socialscan: { name: "Socialscan", url: "https://socialscan.com/monadtestnet" },
  },
});

export const MONAD_CHAIN_ID = monadTestnet.id; // 10143
export const MONAD_RPC_URL = monadTestnet.rpcUrls.default.http[0];

/**
 * Build an explorer tx link for any of the three explorers we verified on.
 * Falls back to MonadVision (the default) when no explorer key is passed.
 */
export function txLink(txHash: `0x${string}`, explorer: "default" | "monadscan" | "socialscan" = "default") {
  const base = monadTestnet.blockExplorers[explorer].url;
  return `${base}/tx/${txHash}`;
}

export function addressLink(
  address: `0x${string}`,
  explorer: "default" | "monadscan" | "socialscan" = "default",
) {
  const base = monadTestnet.blockExplorers[explorer].url;
  return `${base}/address/${address}`;
}
