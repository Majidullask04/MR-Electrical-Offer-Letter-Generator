"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { ApiError, api } from "@/lib/api";
import type { RoleKey, StaffUser } from "@/lib/types";

interface SessionContextValue {
  user: StaffUser;
  isAdmin: boolean;
  canManageOffers: boolean;
  canApprove: boolean;
  hasRole: (role: RoleKey) => boolean;
  logout: () => void;
  loggingOut: boolean;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: api.auth.me,
    retry: false,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    function onUnauthorized() {
      queryClient.removeQueries({ queryKey: ["session"] });
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
    window.addEventListener("ol:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ol:unauthorized", onUnauthorized);
  }, [pathname, queryClient, router]);

  React.useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [pathname, query.error, router]);

  const logoutMutation = useMutation({
    mutationFn: api.auth.logout,
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  if (query.isPending) {
    return <SessionSkeleton />;
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 401) {
      return <SessionSkeleton />;
    }
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
        <h1 className="font-display text-2xl">The console could not start</h1>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          {query.error instanceof ApiError
            ? query.error.message
            : "The session could not be checked. Try again."}
        </p>
        <button
          type="button"
          className="h-9 w-fit rounded-[6px] border border-[var(--color-rule-2)] bg-[var(--color-sheet)] px-3.5 text-sm font-semibold"
          onClick={() => query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  const user = query.data;
  const roles = user.roles;
  const value: SessionContextValue = {
    user,
    isAdmin: roles.includes("SUPER_ADMIN"),
    canManageOffers: roles.includes("SUPER_ADMIN") || roles.includes("HR_MANAGER"),
    canApprove: roles.includes("SUPER_ADMIN") || roles.includes("HIRING_MANAGER"),
    hasRole: (role) => roles.includes(role),
    logout: () => logoutMutation.mutate(),
    loggingOut: logoutMutation.isPending,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = React.useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

function SessionSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1380px] flex-col gap-6 px-6 py-8" aria-busy="true">
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-8 w-28" />
      </div>
      <div className="skeleton h-24 w-full" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="skeleton h-72 w-full" />
        <div className="skeleton h-72 w-full" />
      </div>
    </div>
  );
}
