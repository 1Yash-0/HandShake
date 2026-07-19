"use client";

import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { useMemo } from "react";
import { Wallet, LogOut, Plus } from "lucide-react";
import { monadTestnet } from "@/lib/monad";

/**
 * MetaMask connect button — wagmi-backed, no hardcoded addresses.
 *
 * States:
 *   - disconnected → "Connect wallet" (opens MetaMask)
 *   - connected, wrong chain → "Switch to Monad testnet"
 *   - connected, right chain → truncated 0x… address + disconnect on click
 */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const chainId = useChainId();

  const metaMask = connectors.find((c) => c.id === "io.metamask" || c.name.toLowerCase().includes("metamask")) ?? connectors[0];

  const short = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""),
    [address],
  );

  const onWrongChain = isConnected && chainId !== monadTestnet.id;

  if (!isConnected) {
    return (
      <button
        className="btn btn-dark"
        onClick={async () => {
          if (!metaMask) return;
          try {
            await connectAsync({ connector: metaMask, chainId: monadTestnet.id });
          } catch {
            // user rejected or no provider — try plain connect, MetaMask will prompt network add
            await connectAsync({ connector: metaMask });
          }
        }}
      >
        <Wallet size={16} />
        Connect wallet
      </button>
    );
  }

  if (onWrongChain) {
    return (
      <button
        className="btn btn-danger"
        onClick={async () => {
          if (!metaMask) return;
          await connectAsync({ connector: metaMask, chainId: monadTestnet.id });
        }}
      >
        <Plus size={16} />
        Switch to Monad testnet
      </button>
    );
  }

  return (
    <button
      className="btn btn-soft"
      title="Disconnect"
      onClick={async () => {
        await disconnectAsync();
      }}
    >
      <span className="pill pill-green" aria-hidden>
        <span className="pill-dot" />
      </span>
      <span className="mono">{short}</span>
      <LogOut size={14} />
    </button>
  );
}
