import { AlertTriangle, Inbox, Lock } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  secondary,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-[var(--color-rule-2)] bg-[var(--color-paper-2)] px-6 py-10",
        className,
      )}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-paper-3)] text-[var(--color-muted)]">
        <Inbox size={17} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="flex max-w-[52ch] flex-col gap-1">
        <h3 className="font-display text-lg text-[var(--color-ink)]">{title}</h3>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">{description}</p>
      </div>
      {action || secondary ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

export function RestrictedState({
  title = "This area needs a different role",
  message,
  action,
  className,
}: {
  title?: string;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-5 py-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Lock
          size={17}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-[var(--color-muted)]"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-md text-[var(--color-ink)]">{title}</h3>
          <p className="max-w-[64ch] text-sm leading-relaxed text-[var(--color-muted)]">{message}</p>
        </div>
      </div>
      {action ? <div className="ml-7">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "This view could not load",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-bad)] bg-[var(--color-sheet)] px-5 py-5",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={17}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-[var(--color-bad)]"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-md text-[var(--color-ink)]">{title}</h3>
          <p className="max-w-[64ch] text-sm leading-relaxed text-[var(--color-muted)]">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="ml-7">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
