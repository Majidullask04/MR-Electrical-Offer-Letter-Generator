"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { LifecycleTrail } from "@/components/lifecycle";
import { MonthlyChart } from "@/components/monthly-chart";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PanelSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  employmentLabel,
  formatDateLong,
  formatHours,
  formatINR,
  formatNumber,
  formatPercent,
  relativeTime,
} from "@/lib/format";

export default function DashboardPage() {
  const { user, canManageOffers, canApprove } = useSession();
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard() });

  const pending = query.data?.pending_approval_count ?? 0;
  const primaryHref = canApprove && pending > 0 ? "/approvals" : "/generator";
  const primaryLabel = canApprove && pending > 0 ? "Review approvals" : "Generate offer";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offer operations"
        description={`Drafting, approvals and candidate responses for ${user.full_name.split(" ")[0]}'s desk.`}
        meta={
          <>
            <span className="text-xs text-[var(--color-muted)]">{formatDateLong(new Date())}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--color-rule-2)]" />
            <span className="text-xs text-[var(--color-muted)]">
              {formatNumber(pending)} awaiting approval
            </span>
          </>
        }
        actions={
          <>
            {canManageOffers ? (
              <Button variant="secondary" asChild>
                <Link href="/offers">Offer register</Link>
              </Button>
            ) : null}
            {canManageOffers || canApprove ? (
              <Button variant="primary" asChild>
                <Link href={primaryHref}>
                  {primaryLabel}
                  {canApprove && pending > 0 ? (
                    <span className="mono rounded-[3px] bg-[oklch(99%_0.005_80_/_0.18)] px-1.5 py-0.5 text-[10px]">
                      {pending}
                    </span>
                  ) : (
                    <Plus size={15} strokeWidth={2} aria-hidden="true" />
                  )}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : "The dashboard could not load. Try again."
          }
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <LifecycleTrail counts={query.data.counts} />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.85fr)]">
            <div className="flex min-w-0 flex-col gap-8">
              <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
                <SectionHeading
                  id="attention-heading"
                  title="Needs attention"
                  description="Offers waiting on an approval decision."
                  actions={
                    pending > 0 ? (
                      <Button variant="quiet" size="sm" asChild>
                        <Link href="/approvals">
                          Open approvals
                          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : null
                  }
                />
                {query.data.pending_offers.length === 0 ? (
                  <EmptyState
                    title="No approvals waiting"
                    description="Submitted offers land here. Nothing is blocking the desk right now."
                    action={
                      canManageOffers ? (
                        <Button variant="secondary" size="sm" asChild>
                          <Link href="/generator">Start an offer</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
                    {query.data.pending_offers.map((offer) => (
                      <li key={offer.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <Link
                            href={`/offers/${offer.id}`}
                            className="truncate text-sm font-semibold text-[var(--color-ink)] underline-offset-4 hover:underline"
                          >
                            {offer.candidate_name}
                          </Link>
                          <p className="truncate text-xs text-[var(--color-muted)]">
                            {offer.job_title} · {offer.department ?? "No department"}
                          </p>
                        </div>
                        <div className="flex flex-col items-start gap-0.5 sm:items-end">
                          <span className="mono text-[10px] text-[var(--color-muted)]">
                            {offer.offer_number}
                          </span>
                          <span className="text-[10px] text-[var(--color-muted)]">
                            created {relativeTime(offer.created_at)}
                          </span>
                        </div>
                        <StatusBadge status={offer.status} />
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/offers/${offer.id}`}>Open</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
                <SectionHeading
                  id="recent-heading"
                  title="Recent offers"
                  description="The latest records in the register."
                  actions={
                    <Button variant="quiet" size="sm" asChild>
                      <Link href="/offers">
                        View all
                        <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
                      </Link>
                    </Button>
                  }
                />
                {query.data.recent_offers.length === 0 ? (
                  <EmptyState
                    title="The register is empty"
                    description="Create the first offer to start the lifecycle trail."
                    action={
                      canManageOffers ? (
                        <Button variant="primary" size="sm" asChild>
                          <Link href="/generator">Generate offer</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="scroll-x -mx-1 px-1">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Reference</th>
                          <th scope="col">Candidate</th>
                          <th scope="col">Status</th>
                          <th scope="col" className="text-right">Annual CTC</th>
                          <th scope="col">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.recent_offers.map((offer) => (
                          <tr key={offer.id}>
                            <td className="whitespace-nowrap">
                              <Link href={`/offers/${offer.id}`} className="mono text-xs text-[var(--color-cool-deep)] hover:underline">
                                {offer.official_offer_number ?? offer.offer_number}
                              </Link>
                            </td>
                            <td>
                              <Link href={`/offers/${offer.id}`} className="flex flex-col gap-0.5">
                                <span className="text-sm font-semibold text-[var(--color-ink)]">
                                  {offer.candidate_name}
                                </span>
                                <span className="text-xs text-[var(--color-muted)]">{offer.job_title}</span>
                              </Link>
                            </td>
                            <td><StatusBadge status={offer.status} /></td>
                            <td className="mono whitespace-nowrap text-right text-xs text-[var(--color-ink-2)]">
                              {formatINR(offer.annual_ctc)}
                            </td>
                            <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                              {formatDateLong(offer.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
                <SectionHeading
                  id="activity-heading"
                  title="Offer activity"
                  description="Created, issued and accepted counts over the last twelve months."
                />
                <div className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 sm:p-5">
                  <MonthlyChart data={query.data.monthly} />
                </div>
              </section>
            </div>

            <aside className="flex min-w-0 flex-col gap-6">
              <section
                aria-labelledby="ledger-heading"
                className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5"
              >
                <SectionHeading id="ledger-heading" title="Response ledger" />
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
                  <div className="flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
                    <dt className="text-xs text-[var(--color-muted)]">Acceptance rate</dt>
                    <dd className="figure text-2xl text-[var(--color-ok)]">
                      {formatPercent(query.data.acceptance_rate)}
                    </dd>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {query.data.acceptance_rate === null ? "No responses yet" : "of offers answered"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
                    <dt className="text-xs text-[var(--color-muted)]">Decline rate</dt>
                    <dd className="figure text-2xl text-[var(--color-ink)]">
                      {formatPercent(query.data.rejection_rate)}
                    </dd>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {query.data.rejection_rate === null ? "No responses yet" : "of offers answered"}
                    </p>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
                    <dt className="text-xs text-[var(--color-muted)]">Average time to accept</dt>
                    <dd className="figure text-2xl text-[var(--color-ink)]">
                      {formatHours(query.data.time_to_accept.average_hours)}
                    </dd>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {query.data.time_to_accept.sample_size === 0
                        ? "Measured from issuance to acceptance"
                        : `From ${formatNumber(query.data.time_to_accept.sample_size)} accepted offer${
                            query.data.time_to_accept.sample_size === 1 ? "" : "s"
                          }`}
                    </p>
                  </div>
                </dl>
                {query.data.acceptance_rate !== null ? (
                  <div className="mt-4 flex h-2 overflow-hidden rounded-[2px] bg-[var(--color-paper-3)]" aria-hidden="true">
                    <span
                      className="h-full bg-[var(--color-ok)]"
                      style={{ width: `${query.data.acceptance_rate}%` }}
                    />
                    <span
                      className="h-full bg-[var(--color-bad)]"
                      style={{ width: `${query.data.rejection_rate ?? 0}%` }}
                    />
                  </div>
                ) : null}
              </section>

              <section
                aria-labelledby="positions-heading"
                className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-5"
              >
                <SectionHeading id="positions-heading" title="Positions in play" />
                {query.data.positions.length === 0 ? (
                  <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
                    Position counts appear when offers exist.
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-3">
                    {query.data.positions.map((position) => {
                      const max = query.data.positions[0]?.count || 1;
                      return (
                        <li key={position.position} className="flex flex-col gap-1.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-xs text-[var(--color-ink-2)]">{position.position}</span>
                            <span className="mono text-xs text-[var(--color-ink)]">{position.count}</span>
                          </div>
                          <div className="h-1 w-full bg-[var(--color-paper-3)]">
                            <div
                              className="h-1 bg-[var(--color-cool)]"
                              style={{ width: `${Math.max(4, (position.count / max) * 100)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="candidates-heading" className="flex flex-col gap-3">
                <SectionHeading
                  id="candidates-heading"
                  title="Recent candidates"
                  actions={
                    <Button variant="quiet" size="sm" asChild>
                      <Link href="/candidates">
                        All candidates
                        <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
                      </Link>
                    </Button>
                  }
                />
                {query.data.recent_candidates.length === 0 ? (
                  <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                    Candidates added by HR appear here.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
                    {query.data.recent_candidates.map((candidate) => (
                      <li key={candidate.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <Link
                            href={`/offers?candidate_id=${candidate.id}`}
                            className="truncate text-sm font-semibold text-[var(--color-ink)] underline-offset-4 hover:underline"
                          >
                            {candidate.full_name}
                          </Link>
                          <span className="truncate text-[10px] text-[var(--color-muted)]">
                            {candidate.applied_position} · {employmentLabel(candidate.employment_type)}
                          </span>
                        </div>
                        <span className="mono shrink-0 text-[10px] text-[var(--color-muted)]">
                          {relativeTime(candidate.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <div className="skeleton h-[190px] w-full rounded-[10px]" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.85fr)]">
        <div className="flex flex-col gap-8">
          <TableSkeleton rows={4} columns={5} />
          <TableSkeleton rows={5} columns={5} />
          <PanelSkeleton lines={4} />
        </div>
        <div className="flex flex-col gap-6">
          <PanelSkeleton lines={6} />
          <PanelSkeleton lines={5} />
        </div>
      </div>
    </div>
  );
}
