import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { monadTestnet } from "@/lib/monad";

/**
 * Wagmi config — Monad testnet only, MetaMask connector, SSR-enabled for the
 * Next.js App Router. Cookie storage persists connection state across reloads.
 */
export function getConfig() {
  return createConfig({
    chains: [monadTestnet],
    connectors: [metaMask()],
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
    },
  });
}

export type AppConfig = ReturnType<typeof getConfig>;
