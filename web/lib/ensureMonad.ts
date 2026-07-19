"use client";

import { useChainId, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "@/lib/contract";

/**
 * Hook that returns `ensureMonad()` — call it at the top of any contract-write
 * handler. If the connected wallet is already on Monad testnet, it's a no-op.
 * If not, it triggers a MetaMask network-switch prompt (or, on first switch,
 * an "Add Monad Testnet network" prompt) and resolves only once the wallet
 * reports the new chain.
 *
 * Behavior:
 *   - already on Monad (chainId === CHAIN_ID) → resolves immediately
 *   - on another chain → awaits wagmi's switchChainAsync, which calls
 *     wallet_switchEthereumChain (and falls back to wallet_addEthereumChain
 *     if Monad isn't yet known to the wallet — wagmi handles both)
 *   - user rejects the switch → throws (the caller's catch surfaces a concise
 *     "Transaction rejected in wallet." via conciseWalletError)
 *
 * Returns { onWrongChain, ensureMonad } so callers can:
 *   - render disabled/hints when onWrongChain (existing UX stays)
 *   - but also auto-switch on click instead of forcing the user to find the
 *     MetaMask network dropdown themselves
 */
export function useEnsureMonad(isConnected: boolean = true) {
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const onWrongChain = isConnected && chainId !== CHAIN_ID;

  async function ensureMonad(): Promise<void> {
    if (chainId === CHAIN_ID) return;
    await switchChainAsync({ chainId: CHAIN_ID });
  }

  return { onWrongChain, ensureMonad, switching, chainId };
}
