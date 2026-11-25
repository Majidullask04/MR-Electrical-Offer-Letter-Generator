"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, STATUS_OPTIONS } from "@/lib/api";
import {
  formatDate,
  formatHours,
  formatINR,
  formatNumber,
  formatPercent,
  statusLabel,
} from "@/lib/format";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

export default function ReportsPage() {
  return (
    <React.Suspense fallback={<ReportsFallback />}>
      <ReportsContent />
    </React.Suspense>
  );
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const status = searchParams.get("status") ?? "";
  const position = searchParams.get("position") ?? "";

  const query = useQuery({
    queryKey: ["report", { dateFrom, dateTo, status, position }],
    queryFn: () =>
      api.reports.offers({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status || undefined,
        position: position || undefined,
      }),
  });

  function apply(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const next = params.toString();
    router.replace(next ? `/reports?${next}` : "/reports");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    apply({
      date_from: String(formData.get("date_from") ?? "").trim() || null,
      date_to: String(formData.get("date_to") ?? "").trim() || null,
      position: String(formData.get("position") ?? "").trim() || null,
    });
  }

  function quickRange(kind: "30" | "90" | "year" | "all") {
    if (kind === "all") {
      apply({ date_from: null, date_to: null });
      return;
    }
    if (kind === "year") {
      const now = new Date();
      apply({ date_from: `${now.getFullYear()}-01-01`, date_to: isoDate(now) });
      return;
    }
    apply({ date_from: daysAgo(Number(kind)), date_to: isoDate(new Date()) });
  }

  const hasFilters = Boolean(dateFrom || dateTo || status || position);
  const data = query.data;
  const exportHref = api.reports.exportUrl({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    status: status || undefined,
    position: position || undefined,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        description="Filter the register by date, status or role. Figures are measured from stored offer events, not estimates."
        actions={
          <Button variant="secondary" asChild>
            <a href={exportHref}>
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        }
        meta={
          hasFilters ? (
            <span className="text-xs text-[var(--color-muted)]">
              Filtered view
              {dateFrom || dateTo
                ? ` · ${dateFrom ? formatDate(dateFrom) : "start"} to ${dateTo ? formatDate(dateTo) : "today"}`
                : ""}
            </span>
          ) : (
            <span className="text-xs text-[var(--color-muted)]">All offers on record</span>
          )
        }
      />

      <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3" role="search">
          <Field label="From" htmlFor="report-from" className="w-[160px]">
            <Input
              key={`from-${dateFrom}`}
              id="report-from"
              name="date_from"
              type="date"
              defaultValue={dateFrom}
            />
          </Field>
          <Field label="To" htmlFor="report-to" className="w-[160px]">
            <Input
              key={`to-${dateTo}`}
              id="report-to"
              name="date_to"
              type="date"
              defaultValue={dateTo}
            />
          </Field>
          <Field label="Status" htmlFor="report-status" className="w-[180px]">
            <Select
              id="report-status"
              value={status}
              onChange={(event) => apply({ status: event.target.value || null })}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position" htmlFor="report-position" className="w-[210px]">
            <Input
              key={`position-${position}`}
              id="report-position"
              name="position"
              defaultValue={position}
              placeholder="Any position"
            />
          </Field>
          <Button type="submit" variant="secondary">
            <Search size={13} strokeWidth={2} aria-hidden="true" />
            Apply
          </Button>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                router.replace("/reports");
              }}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
              Clear
            </Button>
          ) : null}
        </form>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-rule)] pt-3">
          <span className="mr-1 text-[10px] font-semibold text-[var(--color-muted)]">Quick range</span>
          <Button variant="ghost" size="sm" onClick={() => quickRange("30")}>
            Last 30 days
          </Button>
          <Button variant="ghost" size="sm" onClick={() => quickRange("90")}>
            Last 90 days
          </Button>
          <Button variant="ghost" size="sm" onClick={() => quickRange("year")}>
            This year
          </Button>
          <Button variant="ghost" size="sm" onClick={() => quickRange("all")}>
            All time
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="skeleton h-24 w-full rounded-[10px]" />
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "The report could not load."}
          onRetry={() => query.refetch()}
        />
      ) : data ? (
        <>
          <dl className="grid gap-x-6 gap-y-4 border-y border-[var(--color-rule)] py-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Offers in range</dt>
              <dd className="figure text-2xl text-[var(--color-ink)]">{formatNumber(data.total)}</dd>
              <p className="text-[10px] text-[var(--color-muted)]">created inside the filters</p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Acceptance rate</dt>
              <dd className="figure text-2xl text-[var(--color-ok)]">
                {formatPercent(data.acceptance_rate)}
              </dd>
              <p className="text-[10px] text-[var(--color-muted)]">
                {data.acceptance_rate === null ? "no responses yet" : "of answered offers"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Decline rate</dt>
              <dd className="figure text-2xl text-[var(--color-ink)]">
                {formatPercent(data.rejection_rate)}
              </dd>
              <p className="text-[10px] text-[var(--color-muted)]">
                {data.rejection_rate === null ? "no responses yet" : "of answered offers"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Average time to accept</dt>
              <dd className="figure text-2xl text-[var(--color-ink)]">
                {formatHours(data.average_time_to_accept_hours)}
              </dd>
              <p className="text-[10px] text-[var(--color-muted)]">issue to acceptance</p>
            </div>
          </dl>

          {data.rows.length === 0 ? (
            <EmptyState
              title="No offers in this range"
              description="Widen the dates, remove the position filter, or choose a different status. The export uses the same filters."
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={() => router.replace("/reports")}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col">
              <div className="scroll-x">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Candidate</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">Annual CTC</th>
                      <th scope="col">Issued</th>
                      <th scope="col">Responded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((offer) => (
                      <tr key={offer.id}>
                        <td className="whitespace-nowrap">
                          <Link
                            href={`/offers/${offer.id}`}
                            className="mono text-xs text-[var(--color-cool-deep)] underline-offset-4 hover:underline"
                          >
                            {offer.offer_number}
                          </Link>
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-[var(--color-ink)]">
                              {offer.candidate_name}
                            </span>
                            <span className="text-[11px] text-[var(--color-muted)]">
                              {offer.candidate_email}
                            </span>
                          </div>
                        </td>
                        <td className="min-w-[150px]">
                          <span className="block text-sm text-[var(--color-ink-2)]">{offer.job_title}</span>
                          <span className="block text-[11px] text-[var(--color-muted)]">
                            {offer.department ?? "No department"}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={offer.status} />
                          <span className="mono mt-1 block text-[9px] text-[var(--color-faint)]">
                            rev {offer.revision_number}
                          </span>
                        </td>
                        <td className="mono whitespace-nowrap text-right text-xs text-[var(--color-ink-2)]">
                          {formatINR(offer.annual_ctc)}
                        </td>
                        <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                          {offer.issued_at ? formatDate(offer.issued_at) : "—"}
                        </td>
                        <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                          {offer.responded_at
                            ? `${formatDate(offer.responded_at)} · ${statusLabel(offer.status)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)] px-1 py-3">
                <p className="text-xs text-[var(--color-muted)]">
                  Showing{" "}
                  <span className="mono text-[var(--color-ink-2)]">
                    {formatNumber(data.rows.length)}
                  </span>{" "}
                  of <span className="mono text-[var(--color-ink-2)]">{formatNumber(data.total)}</span>{" "}
                  matching offers
                  {data.total > data.rows.length ? " · the CSV export includes every match" : ""}
                </p>
                <Button variant="quiet" size="sm" asChild>
                  <a href={exportHref}>
                    <Download size={13} strokeWidth={2} aria-hidden="true" />
                    Export this view
                  </a>
                </Button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ReportsFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-32 w-full rounded-[10px]" />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
