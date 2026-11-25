"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  FileCode2,
  FilePlus2,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { formatNumber, initials, relativeTime, roleLabel } from "@/lib/format";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generator", label: "Generate", icon: FilePlus2 },
  { href: "/offers", label: "Offers", icon: FileText },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/verify", label: "Verify", icon: ShieldCheck },
  { href: "/templates", label: "Templates", icon: FileCode2 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, loggingOut } = useSession();
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications,
    refetchInterval: 60_000,
  });
  const attention = notifications.data?.attention_count ?? 0;
  const pendingApprovals =
    notifications.data?.items.filter((item) => item.type === "approval").length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[6px] focus:bg-[var(--color-sheet)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-[var(--shadow-overlay)]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--color-rule)] bg-[var(--color-paper)]">
        <div className="mx-auto flex h-[var(--topbar-h)] w-full max-w-[var(--page-max)] items-center gap-3 px-4 sm:px-6">
          <Link
            href="/dashboard"
            aria-label="MR. ELECTRICAL WORKS OfferLater home"
            className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-focus)]"
          >
            <Image
              src="/brand/logo.png"
              alt=""
              width={34}
              height={34}
              className="h-[30px] w-[30px] shrink-0"
              priority
            />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-display text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
                MR. ELECTRICAL WORKS
              </span>
              <span className="mono mt-1 text-[10px] text-[var(--color-muted)]">OfferLater</span>
            </span>
          </Link>

          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[var(--color-rule)] min-[72rem]:block" />

          <nav aria-label="Primary" className="hidden min-[72rem]:flex min-[72rem]:items-center min-[72rem]:gap-0.5">
            {navigation.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[13px] font-medium whitespace-nowrap transition-[color,background-color] duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
                    active
                      ? "text-[var(--color-ink)] after:absolute after:inset-x-2 after:-bottom-[13px] after:h-[2px] after:bg-[var(--color-accent)]"
                      : "text-[var(--color-muted)]",
                  )}
                >
                  {item.label}
                  {item.href === "/approvals" && pendingApprovals > 0 ? (
                    <span className="mono rounded-[3px] bg-[var(--color-accent-soft)] px-1 py-0.5 text-[10px] font-semibold leading-none text-[var(--color-accent-deep)]">
                      {pendingApprovals}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <NotificationsMenu attention={attention} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 gap-2 px-1.5 min-[68rem]:px-2"
                  aria-label="Account menu"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-rule-2)] bg-[var(--color-sheet)] font-display text-[11px] font-semibold text-[var(--color-ink-2)]">
                    {initials(user.full_name)}
                  </span>
                  <span className="hidden max-w-[120px] flex-col items-start leading-tight min-[80rem]:flex">
                    <span className="w-full truncate text-xs font-semibold text-[var(--color-ink)]">
                      {user.full_name}
                    </span>
                    <span className="w-full truncate text-[10px] font-normal text-[var(--color-muted)]">
                      {roleLabel(user.primary_role)}
                    </span>
                  </span>
                  <ChevronDown
                    size={13}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="hidden text-[var(--color-muted)] min-[80rem]:block"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[260px]">
                <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
                  <span className="text-sm font-semibold text-[var(--color-ink)]">{user.full_name}</span>
                  <span className="truncate text-xs font-normal text-[var(--color-muted)]">
                    {user.email}
                  </span>
                  <span className="mt-1 w-fit rounded-[3px] bg-[var(--color-paper-3)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-ink-2)]">
                    {roleLabel(user.primary_role)}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
                  <KeyRound size={14} strokeWidth={2} aria-hidden="true" />
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => logout()}
                  disabled={loggingOut}
                  className="text-[var(--color-bad)] data-[highlighted]:bg-[var(--color-bad-soft)] data-[highlighted]:text-[var(--color-bad)]"
                >
                  <LogOut size={14} strokeWidth={2} aria-hidden="true" />
                  {loggingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <MobileMenu pathname={pathname} pendingApprovals={pendingApprovals} />
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[var(--page-max)] flex-1 px-4 py-6 sm:px-6 sm:py-8"
      >
        {children}
      </main>

      <footer className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[var(--page-max)] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-[var(--color-muted)] sm:px-6">
          <p>
            MR. ELECTRICAL WORKS · OfferLater
          </p>
          <p className="mono text-[10px]">
            Udyam UDYAM-TS-25-0046549 · Patancheru, Telangana
          </p>
        </div>
      </footer>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

function NotificationsMenu({ attention }: { attention: number }) {
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications,
    refetchInterval: 60_000,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            attention > 0 ? `Notifications, ${formatNumber(attention)} need attention` : "Notifications"
          }
        >
          <Bell size={17} strokeWidth={1.9} aria-hidden="true" />
          {attention > 0 ? (
            <span
              aria-hidden="true"
              className="mono absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[9px] font-semibold leading-none text-[var(--color-accent-ink)]"
            >
              {attention > 9 ? "9+" : attention}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-rule)] px-3 py-2.5">
          <p className="text-xs font-semibold text-[var(--color-ink)]">Notifications</p>
          {attention > 0 ? (
            <span className="text-[10px] text-[var(--color-warn)]">{attention} need attention</span>
          ) : null}
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {query.isPending ? (
            <div className="flex flex-col gap-2 p-2" aria-busy="true">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ) : query.isError ? (
            <div className="px-2 py-4">
              <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                Notifications could not load.
              </p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="mt-2 text-xs font-semibold text-[var(--color-cool-deep)] underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : query.data.items.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[var(--color-muted)]">
              No new activity. Approvals and candidate responses will appear here.
            </p>
          ) : (
            query.data.items.map((item) => (
              <DropdownMenuItem key={item.id} asChild className="items-start py-2.5">
                <Link href={item.href} className="flex flex-col gap-0.5">
                  <span className="flex w-full items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        item.tone === "attention"
                          ? "bg-[var(--color-warn)]"
                          : item.tone === "positive"
                            ? "bg-[var(--color-ok)]"
                            : "bg-[var(--color-faint)]",
                      )}
                    />
                    <span className="text-xs font-semibold text-[var(--color-ink)]">{item.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">
                      {relativeTime(item.created_at)}
                    </span>
                  </span>
                  <span className="pl-3.5 text-xs leading-relaxed text-[var(--color-muted)]">
                    {item.detail}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-rule)] px-3 py-2">
          <Link href="/approvals" className="text-xs font-semibold text-[var(--color-cool-deep)] hover:underline">
            Approvals
          </Link>
          <Link href="/offers" className="text-xs font-semibold text-[var(--color-cool-deep)] hover:underline">
            Offer register
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileMenu({
  pathname,
  pendingApprovals,
}: {
  pathname: string;
  pendingApprovals: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-[72rem]:hidden"
          aria-label="Open navigation menu"
        >
          <Menu size={18} strokeWidth={2} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[260px]">
        <DropdownMenuLabel>Navigate</DropdownMenuLabel>
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(active && "bg-[var(--color-paper-2)] font-semibold text-[var(--color-ink)]")}
              >
                <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                {item.label}
                {item.href === "/approvals" && pendingApprovals > 0 ? (
                  <span className="mono ml-auto rounded-[3px] bg-[var(--color-accent-soft)] px-1 py-0.5 text-[10px] font-semibold text-[var(--color-accent-deep)]">
                    {pendingApprovals}
                  </span>
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/offers/new" className="font-semibold text-[var(--color-accent-deep)]">
            Advanced offer builder
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
