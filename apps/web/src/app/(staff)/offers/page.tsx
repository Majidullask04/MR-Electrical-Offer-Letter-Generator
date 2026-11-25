"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Printer, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useSession } from "@/lib/auth";
import { api, STATUS_OPTIONS } from "@/lib/api";
import { formatDate, formatINR, formatNumber } from "@/lib/format";

export default function OffersPage() {
  return (
    <React.Suspense fallback={<OffersFallback />}>
      <OffersContent />
    </React.Suspense>
  );
}

function OffersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canManageOffers, canApprove } = useSession();

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const candidateId = searchParams.get("candidate_id") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const candidateQuery = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => api.candidates.get(candidateId),
    enabled: Boolean(candidateId),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["offers", { q, status, candidateId, page }],
    queryFn: () =>
      api.offers.list({
        q: q || undefined,
        status: status || undefined,
        candidate_id: candidateId || undefined,
        page,
        page_size: 20,
      }),
  });

  function updateParams(updates: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    const next = params.toString();
    router.replace(next ? `/offers?${next}` : "/offers");
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const value = searchInputRef.current?.value ?? "";
    updateParams({ q: value.trim() || null });
  }

  const hasFilters = Boolean(q || status || candidateId);
  const data = query.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Offers"
        description="Every offer letter in one register, from first draft to the candidate's answer."
        actions={
          <>
            {canApprove ? (
              <Button variant="secondary" asChild>
                <Link href="/approvals">Approvals</Link>
              </Button>
            ) : null}
            {canManageOffers ? (
              <Button variant="primary" asChild>
                <Link href="/generator">
                  Generate offer
                  <Plus size={15} strokeWidth={2} aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2" role="search">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[340px]">
            <Search
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
            />
            <Input
              key={q}
              ref={searchInputRef}
              defaultValue={q}
              placeholder="Reference, candidate or role"
              aria-label="Search offers"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Select
            value={status}
            onChange={(event) => updateParams({ status: event.target.value || null })}
            aria-label="Filter by status"
            className="w-[190px]"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (searchInputRef.current) searchInputRef.current.value = "";
                router.replace("/offers");
              }}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {candidateId ? (
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-tag)] bg-[var(--color-cool-soft)] px-2 py-1 text-xs font-semibold text-[var(--color-cool-deep)]">
              Candidate: {candidateQuery.data?.full_name ?? "selected candidate"}
              <button
                type="button"
                onClick={() => updateParams({ candidate_id: null })}
                aria-label="Clear candidate filter"
                className="rounded-[2px] p-0.5 hover:bg-[var(--color-cool-tint)]"
              >
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {data ? (
            <p className="text-xs text-[var(--color-muted)]">
              <span className="mono text-[var(--color-ink-2)]">{formatNumber(data.total)}</span>{" "}
              {data.total === 1 ? "offer" : "offers"}
              {hasFilters ? " match these filters" : " in the register"}
            </p>
          ) : null}
        </div>
      </div>

      {query.isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "The offer register could not load."}
          onRetry={() => query.refetch()}
        />
      ) : data && data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No offers match these filters"
            description="Try a shorter search, a different status, or clear the filters to see the whole register."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (searchInputRef.current) searchInputRef.current.value = "";
                  router.replace("/offers");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No offers yet"
            description="The register fills when HR creates the first draft. Offers keep their reference for life."
            action={
              canManageOffers ? (
                <Button variant="primary" size="sm" asChild>
                  <Link href="/generator">Generate offer</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : data ? (
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
                  <th scope="col">Validity</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((offer) => (
                  <tr key={offer.id}>
                    <td className="whitespace-nowrap">
                      <Link
                        href={`/offers/${offer.id}`}
                        className="mono text-xs font-semibold text-[var(--color-cool-deep)] underline-offset-4 hover:underline"
                      >
                        {offer.official_offer_number ?? offer.offer_number}
                      </Link>
                      <span className="mono mt-0.5 block text-[9px] text-[var(--color-faint)]">
                        {offer.official_offer_number ? `${offer.offer_number} · ` : ""}rev {offer.revision_number}
                      </span>
                    </td>
                    <td>
                      <Link href={`/offers/${offer.id}`} className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--color-ink)]">
                          {offer.candidate_name}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)]">
                          {offer.candidate_email ?? "No email"}
                        </span>
                      </Link>
                    </td>
                    <td className="min-w-[150px]">
                      <span className="block text-sm text-[var(--color-ink-2)]">{offer.job_title}</span>
                      <span className="block text-[11px] text-[var(--color-muted)]">
                        {offer.department ?? "No department"}
                      </span>
                    </td>
                    <td><StatusBadge status={offer.status} /></td>
                    <td className="mono whitespace-nowrap text-right text-xs text-[var(--color-ink-2)]">
                      {formatINR(offer.annual_ctc)}
                    </td>
                    <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                      {offer.expires_at ? formatDate(offer.expires_at) : "Not set"}
                    </td>
                    <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                      {formatDate(offer.created_at)}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" asChild title="Download PDF">
                          <a href={`${api.offers.pdf(offer.id)}?download=true`} download>
                            <Download size={13} strokeWidth={2} aria-hidden="true" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Print offer letter"
                          onClick={() => {
                            const w = window.open(api.offers.pdf(offer.id), "_blank", "noopener");
                            w?.addEventListener("load", () => {
                              try { w.print(); } catch { /* viewer print */ }
                            });
                          }}
                        >
                          <Printer size={13} strokeWidth={2} aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="sm" asChild title="Verify offer">
                          <Link href="/verify">
                            <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            pageSize={data.page_size}
            onPageChange={(nextPage) => updateParams({ page: String(nextPage) }, false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function OffersFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-9 w-full max-w-[700px]" />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
