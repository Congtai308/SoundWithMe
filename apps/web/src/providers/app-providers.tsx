"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { CURRENT_USER_QUERY_KEY, fetchCurrentUser } from "@/features/auth/hooks/use-auth";

/**
 * Wraps the app in a single QueryClient instance. This is where server-state
 * caching lives (Architecture Review §11) — Zustand stores are for
 * client/realtime UI state only and must not duplicate this cache.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
        },
      },
    });
    // Almost every page waits on who's signed in before asking for its own
    // data: start that request now, not after the whole page has rendered.
    if (typeof window !== "undefined") {
      void client.prefetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchCurrentUser, retry: false });
    }
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
