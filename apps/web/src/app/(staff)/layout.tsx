"use client";

import * as React from "react";

import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/lib/auth";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div
          className="mx-auto flex min-h-dvh w-full max-w-[1380px] flex-col gap-6 px-6 py-8"
          aria-busy="true"
        >
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      }
    >
      <SessionProvider>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </React.Suspense>
  );
}
