import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { eventLabel, formatDateTime, formatNumber, relativeTime } from "@/lib/format";
import type { DashboardCounts, OfferEvent } from "@/lib/types";
import { cn } from "@/lib/cn";

const stages: Array<{
  key: keyof DashboardCounts;
  label: string;
  note: string;
  dot: string;
}> = [
  { key: "draft", label: "Draft", note: "being written", dot: "bg-[var(--color-faint)]" },
  { key: "pending_approval", label: "Approval", note: "awaiting decision", dot: "bg-[var(--color-warn)]" },
  { key: "approved", label: "Approved", note: "ready to issue", dot: "bg-[var(--color-cool)]" },
  { key: "issued", label: "Issued", note: "with candidate", dot: "bg-[var(--color-cool)]" },
  { key: "viewed", label: "Viewed", note: "link opened", dot: "bg-[var(--color-cool)]" },
  { key: "accepted", label: "Accepted", note: "offer closed", dot: "bg-[var(--color-ok)]" },
];

export function LifecycleTrail({ counts }: { counts: DashboardCounts }) {
  const closed = [
    { label: "Declined", value: counts.rejected },
    { label: "Expired", value: counts.expired },
    { label: "Withdrawn", value: counts.withdrawn },
  ];

  return (
    <section
      aria-labelledby="trail-heading"
      className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="trail-heading" className="font-display text-md text-[var(--color-ink)]">
            Offer trail
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Where every offer sits in the lifecycle right now.
          </p>
        </div>
        <p className="mono text-[10px] text-[var(--color-muted)]">
          {formatNumber(counts.total)} total · measured live
        </p>
      </div>

      <ol className="mt-5 grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6">
        {stages.map((stage, index) => {
          const value = counts[stage.key];
          return (
            <li key={stage.key} className="relative flex min-w-0 flex-col gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 right-0 top-[46px] h-px",
                  index === stages.length - 1 ? "bg-transparent" : "bg-[var(--color-rule-2)]",
                )}
              />
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "figure text-[1.65rem]",
                    value > 0 ? "text-[var(--color-ink)]" : "text-[var(--color-faint)]",
                  )}
                >
                  {formatNumber(value)}
                </span>
                <span className="mono text-[9px] text-[var(--color-faint)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="relative flex h-[9px] items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-10 h-[9px] w-[9px] rounded-full border-2 bg-[var(--color-paper-2)]",
                    value > 0 ? stage.dot : "border-[var(--color-rule-2)]",
                    value > 0 && "border-transparent",
                  )}
                />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-xs font-semibold text-[var(--color-ink-2)]">
                  {stage.label}
                </span>
                <span className="truncate text-[10px] text-[var(--color-muted)]">{stage.note}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-rule)] pt-3">
        <span className="text-[10px] font-semibold text-[var(--color-muted)]">Closed without acceptance</span>
        {closed.map((item) => (
          <span key={item.label} className="inline-flex items-baseline gap-1.5">
            <span className="mono text-xs text-[var(--color-ink-2)]">{formatNumber(item.value)}</span>
            <span className="text-[10px] text-[var(--color-muted)]">{item.label}</span>
          </span>
        ))}
        <Link
          href="/offers?status=ACCEPTED"
          className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-cool-deep)] hover:underline"
        >
          Open accepted offers
          <ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

const progressStages = [
  { key: "DRAFT", label: "Draft", note: "letter being written" },
  { key: "PENDING_APPROVAL", label: "Approval", note: "internal decision" },
  { key: "APPROVED", label: "Approved", note: "ready to issue" },
  { key: "ISSUED", label: "Issued", note: "candidate link" },
  { key: "ACCEPTED", label: "Answer", note: "final response" },
] as const;

const statusRank: Record<string, number> = {
  DRAFT: 0,
  PENDING_APPROVAL: 1,
  APPROVED: 2,
  ISSUED: 3,
  REISSUED: 3,
  VIEWED: 3,
  ACCEPTED: 5,
  REJECTED: 5,
  EXPIRED: 3,
  WITHDRAWN: 2,
};

export function OfferProgress({ status }: { status: string }) {
  const rank = statusRank[status] ?? 0;
  const closed = status === "REJECTED" || status === "EXPIRED" || status === "WITHDRAWN";

  return (
    <section
      aria-labelledby="offer-progress-heading"
      className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="offer-progress-heading" className="font-display text-md text-[var(--color-ink)]">
          Offer trail
        </h2>
        <p className="text-xs text-[var(--color-muted)]">
          {status === "ACCEPTED"
            ? "Closed: candidate accepted."
            : status === "REJECTED"
              ? "Closed: candidate declined."
              : status === "EXPIRED"
                ? "Closed: the response window lapsed."
                : status === "WITHDRAWN"
                  ? "Closed: withdrawn by the company."
                  : "Each stage records who acted and when."}
        </p>
      </div>

      <ol className="mt-4 grid grid-cols-5">
        {progressStages.map((stage, index) => {
          const stepRank = index === 4 ? 5 : index;
          const reached = rank >= stepRank;
          const current =
            (stage.key === "ACCEPTED" && rank === 5) ||
            (index < 4 && rank === stepRank && rank < 5);
          const isAnswer = stage.key === "ACCEPTED";
          const dotTone = isAnswer
            ? status === "ACCEPTED"
              ? "border-[var(--color-ok)] bg-[var(--color-ok)]"
              : status === "REJECTED"
                ? "border-[var(--color-bad)] bg-[var(--color-bad)]"
                : reached
                  ? "border-[var(--color-ink-2)] bg-[var(--color-ink-2)]"
                  : "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]"
            : closed && index === 3
              ? "border-[var(--color-muted)] bg-[var(--color-muted)]"
              : reached
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                : "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]";
          return (
            <li key={stage.key} className="relative flex min-w-0 flex-col gap-2 pr-1">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 right-0 top-[5px] h-px",
                  index === progressStages.length - 1
                    ? "bg-transparent"
                    : reached
                      ? "bg-[var(--color-rule-2)]"
                      : "bg-[var(--color-rule)]",
                )}
              />
              <span
                aria-hidden="true"
                className={cn("relative h-[11px] w-[11px] rounded-full border-2", dotTone)}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "truncate text-xs font-semibold",
                    current ? "text-[var(--color-ink)]" : reached ? "text-[var(--color-ink-2)]" : "text-[var(--color-faint)]",
                  )}
                >
                  {stage.label}
                </span>
                <span className="hidden truncate text-[10px] text-[var(--color-muted)] sm:block">
                  {stage.note}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function OfferEventTrail({ events }: { events: OfferEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-rule-2)] px-4 py-5 text-sm text-[var(--color-muted)]">
        No events recorded yet. The trail starts when the draft is created.
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col">
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-[5px] top-2 w-px bg-[var(--color-rule-2)]"
      />
      {events.map((event) => {
        const tone =
          event.event_type === "ACCEPTED"
            ? "bg-[var(--color-ok)]"
            : event.event_type === "REJECTED"
              ? "bg-[var(--color-bad)]"
              : event.event_type === "APPROVED" || event.event_type === "ISSUED"
                ? "bg-[var(--color-cool)]"
                : event.event_type === "SUBMITTED" || event.event_type === "RETURNED"
                  ? "bg-[var(--color-warn)]"
                  : "bg-[var(--color-rule-2)]";
        return (
          <li key={event.id} className="relative flex gap-4 pb-5 pl-0 last:pb-0">
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--color-sheet)]",
                tone,
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 border-b border-[var(--color-rule)] pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {eventLabel(event.event_type)}
                </p>
                <time
                  dateTime={event.created_at}
                  className="mono text-[10px] text-[var(--color-muted)]"
                  title={formatDateTime(event.created_at)}
                >
                  {relativeTime(event.created_at)}
                </time>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                {event.actor_name ?? "System"}
                {event.actor_type === "CANDIDATE" ? " · candidate" : event.actor_type === "SYSTEM" ? " · system" : ""}
              </p>
              {event.note ? (
                <p className="mt-0.5 max-w-[68ch] text-xs leading-relaxed text-[var(--color-ink-2)]">
                  {event.note}
                </p>
              ) : null}
              {event.from_status || event.to_status ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {event.from_status ? (
                    <StatusBadge status={event.from_status} withDot={false} className="opacity-70" />
                  ) : null}
                  {event.from_status && event.to_status ? (
                    <span aria-hidden="true" className="text-[10px] text-[var(--color-faint)]">
                      to
                    </span>
                  ) : null}
                  {event.to_status ? <StatusBadge status={event.to_status} withDot={false} /> : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
