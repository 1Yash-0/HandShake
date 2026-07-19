"use client";

import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type State, WagmiProvider } from "wagmi";
import { getConfig } from "./config";

type Props = {
  children: ReactNode;
  initialState?: State;
};

/**
 * Client-side providers: wagmi + react-query. Mounted once from app/layout.tsx.
 * `initialState` hydrates the wagmi store when SSR rendered the page.
 */
export function Providers({ children, initialState }: Props) {
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
