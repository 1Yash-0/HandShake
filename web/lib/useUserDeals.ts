"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Abi, ContractFunctionArgs, ContractFunctionName } from "viem";
import {
  HANDSHAKE_ESCROW_ADDRESS,
  HANDSHAKE_ESCROW_ABI,
  CHAIN_ID,
} from "./contract";

/**
 * Read all deals where the connected address is either the client or the
 * freelancer. The escrow contract only exposes `dealCount()` + `getDeal(id)`
 * — no per-user index — so we read all deal ids 0..count-1 in one
 * `useReadContracts` multicall and filter client-side.
 *
 * For the hackathon scale (a handful of demo deals) this is fine. For real
 * volume this is what an indexer is for; we noted that in the README.
 *
 * Returns `{ clientDeals, freelancerDeals, allDeals, isLoading }`.
 */

export type DealSummary = {
  id: bigint;
  client: `0x${string}`;
  freelancer: `0x${string}`;
  arbiter: `0x${string}`;
  amount: bigint;
  deadline: bigint;
  reviewWindow: bigint;
  reviewEnd: bigint;
  ciphertextHash: `0x${string}`;
  state: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

type DealTuple = readonly [
  client: `0x${string}`,
  freelancer: `0x${string}`,
  arbiter: `0x${string}`,
  amount: bigint,
  deadline: bigint,
  reviewWindow: bigint,
  reviewEnd: bigint,
  ciphertextHash: `0x${string}`,
  state: bigint,
];

function toSummary(id: bigint, t: DealTuple): DealSummary {
  return {
    id,
    client: t[0],
    freelancer: t[1],
    arbiter: t[2],
    amount: t[3],
    deadline: t[4],
    reviewWindow: t[5],
    reviewEnd: t[6],
    ciphertextHash: t[7],
    state: Number(t[8]) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  };
}

export function useUserDeals(address: `0x${string}` | undefined) {
  // Pin every read to Monad testnet so the multicall hits the Monad RPC
  // regardless of which chain the connected wallet currently sits on.
  // Without this, a wallet on Ethereum Mainnet (chain 1) makes wagmi route
  // the read through the connector client on chain 1, and viem rejects it
  // ("Chain eip155:1 is not configured in supportedNetworks") before any
  // button is ever clicked.
  const { data: countData, isLoading: countLoading } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: [
      {
        address: HANDSHAKE_ESCROW_ADDRESS,
        abi: HANDSHAKE_ESCROW_ABI,
        functionName: "dealCount",
      },
    ],
    allowFailure: false,
  });

  const count = countData ? (countData[0] as bigint) : 0n;

  // Build a multicall of getDeal(id) for every id 0..count-1.
  // The ABI is cast to viem's `Abi` type — JSON imports don't narrow to the
  // discriminated union viem expects, but the structure is identical.
  const calls = useMemo(() => {
    const n = Number(count);
    if (n <= 0) return [];
    const abi = HANDSHAKE_ESCROW_ABI as unknown as Abi;
    return Array.from({ length: n }, (_, i) => ({
      address: HANDSHAKE_ESCROW_ADDRESS,
      abi,
      functionName: "getDeal" as ContractFunctionName<typeof abi>,
      args: [BigInt(i)] as ContractFunctionArgs<typeof abi, "view", "getDeal">,
    }));
  }, [count]);

  const { data: dealsData, isLoading: dealsLoading } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: calls,
    allowFailure: false,
    query: { enabled: calls.length > 0 },
  });

  const allDeals = useMemo<DealSummary[]>(() => {
    if (!dealsData) return [];
    const arr = dealsData as unknown as DealTuple[];
    return arr
      .filter((t): t is DealTuple => Boolean(t))
      .map((t, i) => toSummary(BigInt(i), t));
  }, [dealsData]);

  const lower = address?.toLowerCase();
  const clientDeals = useMemo(
    () => (lower ? allDeals.filter((d) => d.client.toLowerCase() === lower) : []),
    [allDeals, lower],
  );
  const freelancerDeals = useMemo(
    () => (lower ? allDeals.filter((d) => d.freelancer.toLowerCase() === lower) : []),
    [allDeals, lower],
  );

  return {
    clientDeals,
    freelancerDeals,
    allDeals,
    isLoading: countLoading || dealsLoading,
    count,
  };
}
