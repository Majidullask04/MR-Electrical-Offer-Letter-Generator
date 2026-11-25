import { cn } from "@/lib/cn";
import { statusLabel } from "@/lib/format";
import type { OfferStatus } from "@/lib/types";

const tones: Record<OfferStatus, string> = {
  DRAFT: "bg-[var(--color-paper-3)] text-[var(--color-ink-2)]",
  PENDING_APPROVAL: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  APPROVED: "bg-[var(--color-cool-soft)] text-[var(--color-cool-deep)]",
  ISSUED: "bg-[var(--color-cool-soft)] text-[var(--color-cool-deep)]",
  VIEWED: "bg-[var(--color-cool-soft)] text-[var(--color-cool-deep)]",
  REISSUED: "bg-[var(--color-cool-soft)] text-[var(--color-cool-deep)]",
  ACCEPTED: "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
  REJECTED: "bg-[var(--color-bad-soft)] text-[var(--color-bad)]",
  EXPIRED: "bg-[var(--color-paper-3)] text-[var(--color-muted)]",
  WITHDRAWN: "bg-[var(--color-paper-3)] text-[var(--color-muted)]",
};

const dots: Record<OfferStatus, string> = {
  DRAFT: "bg-[var(--color-faint)]",
  PENDING_APPROVAL: "bg-[var(--color-warn)]",
  APPROVED: "bg-[var(--color-cool)]",
  ISSUED: "bg-[var(--color-cool)]",
  VIEWED: "bg-[var(--color-cool)]",
  REISSUED: "bg-[var(--color-cool)]",
  ACCEPTED: "bg-[var(--color-ok)]",
  REJECTED: "bg-[var(--color-bad)]",
  EXPIRED: "bg-[var(--color-faint)]",
  WITHDRAWN: "bg-[var(--color-faint)]",
};

export function StatusBadge({
  status,
  className,
  withDot = true,
}: {
  status: OfferStatus | string;
  className?: string;
  withDot?: boolean;
}) {
  const key = status as OfferStatus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] px-2 py-1 text-xs font-semibold leading-none",
        tones[key] ?? "bg-[var(--color-paper-3)] text-[var(--color-ink-2)]",
        className,
      )}
    >
      {withDot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", dots[key] ?? "bg-[var(--color-faint)]")}
        />
      ) : null}
      {statusLabel(status)}
    </span>
  );
}
