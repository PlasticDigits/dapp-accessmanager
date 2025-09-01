"use client";

import { PropsWithChildren, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  darkTheme as rkDarkTheme,
  lightTheme as rkLightTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider, createConfig, cookieStorage, createStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { SUPPORTED_CHAINS, makeTransportsFromEnv } from "@/lib/chains";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [injected({ shimDisconnect: true })],
  ssr: false,
  transports: makeTransportsFromEnv(),
  storage: createStorage({ storage: cookieStorage }),
});

export default function Providers({ children }: PropsWithChildren) {
  const queryClient = useMemo(() => makeQueryClient(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={{ lightMode: rkLightTheme(), darkMode: rkDarkTheme() }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}


