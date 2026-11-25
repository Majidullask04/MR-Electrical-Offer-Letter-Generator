"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 1;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              "!rounded-[10px] !border !border-[var(--color-rule-2)] !bg-[var(--color-sheet)] !text-[var(--color-ink)] !shadow-[var(--shadow-overlay)] !font-sans",
            title: "!text-[14px] !font-semibold",
            description: "!text-[13px] !text-[var(--color-muted)]",
            actionButton:
              "!bg-[var(--color-accent)] !text-[var(--color-accent-ink)] !rounded-[6px]",
            cancelButton:
              "!bg-[var(--color-paper-3)] !text-[var(--color-ink-2)] !rounded-[6px]",
            closeButton:
              "!border-[var(--color-rule-2)] !bg-[var(--color-sheet)] !text-[var(--color-muted)]",
            success: "!border-l-[3px] !border-l-[var(--color-ok)]",
            error: "!border-l-[3px] !border-l-[var(--color-bad)]",
            info: "!border-l-[3px] !border-l-[var(--color-cool)]",
          },
        }}
      />
    </QueryClientProvider>
  );
}
