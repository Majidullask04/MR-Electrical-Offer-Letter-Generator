"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, UserCheck, UserX, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { CandidateFormDialog } from "@/components/candidate-form-dialog";
import { PageHeader } from "@/components/page-header";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { employmentLabel, formatDate, formatNumber, relativeTime } from "@/lib/format";
import type { Candidate } from "@/lib/types";

export default function CandidatesPage() {
  return (
    <React.Suspense fallback={<CandidatesFallback />}>
      <CandidatesContent />
    </React.Suspense>
  );
}

function CandidatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { canManageOffers } = useSession();

  const q = searchParams.get("q") ?? "";
  const includeInactive = searchParams.get("inactive") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["candidates", { q, includeInactive, page }],
    queryFn: () =>
      api.candidates.list({
        q: q || undefined,
        include_inactive: includeInactive,
        page,
        page_size: 20,
      }),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Candidate | null>(null);
  const [toggleTarget, setToggleTarget] = React.useState<Candidate | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (candidate: Candidate) =>
      api.candidates.update(candidate.id, { is_active: !candidate.is_active }),
    onSuccess: (saved) => {
      toast.success(saved.is_active ? "Candidate reactivated." : "Candidate deactivated.");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setToggleTarget(null);
      setToggleError(null);
    },
    onError: (error) => setToggleError(errorMessage(error)),
  });

  function updateParams(updates: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    const next = params.toString();
    router.replace(next ? `/candidates?${next}` : "/candidates");
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const value = searchInputRef.current?.value ?? "";
    updateParams({ q: value.trim() || null });
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(candidate: Candidate) {
    setEditing(candidate);
    setFormOpen(true);
  }

  const hasFilters = Boolean(q) || includeInactive;
  const data = query.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Candidates"
        description="People who can receive an offer. A candidate record supplies the starting role and joining details for the builder."
        actions={
          canManageOffers ? (
            <Button variant="primary" onClick={openCreate}>
              Add candidate
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3">
        <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2" role="search">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[360px]">
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
              placeholder="Name, email, phone or position"
              aria-label="Search candidates"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 text-xs text-[var(--color-ink-2)]">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) =>
                updateParams({ inactive: event.target.checked ? "1" : null })
              }
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            Include inactive
          </label>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (searchInputRef.current) searchInputRef.current.value = "";
                router.replace("/candidates");
              }}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </form>

        {data ? (
          <p className="text-xs text-[var(--color-muted)]">
            <span className="mono text-[var(--color-ink-2)]">{formatNumber(data.total)}</span>{" "}
            {data.total === 1 ? "candidate" : "candidates"}
            {hasFilters ? " match these filters" : " on record"}
            {includeInactive ? " · including inactive records" : " · active only"}
          </p>
        ) : null}
      </div>

      {query.isPending ? (
        <TableSkeleton rows={7} columns={6} />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "The candidate register could not load."}
          onRetry={() => query.refetch()}
        />
      ) : data && data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No candidates match these filters"
            description="Try a shorter search, or include inactive records to see candidates who were deactivated."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (searchInputRef.current) searchInputRef.current.value = "";
                  router.replace("/candidates");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No candidates yet"
            description="Add the first candidate so HR can draft an offer. Records can be edited and deactivated, but offers keep their own copy of the terms."
            action={
              canManageOffers ? (
                <Button variant="primary" size="sm" onClick={openCreate}>
                  Add candidate
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
                  <th scope="col">Candidate</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Position</th>
                  <th scope="col">Joining</th>
                  <th scope="col">Record</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((candidate) => (
                  <tr key={candidate.id} className={candidate.is_active ? undefined : "opacity-65"}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--color-ink)]">
                          {candidate.full_name}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)]">
                          added {relativeTime(candidate.created_at)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {candidate.email ? (
                          <a
                            href={`mailto:${candidate.email}`}
                            className="text-xs text-[var(--color-cool-deep)] underline-offset-4 hover:underline"
                          >
                            {candidate.email}
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--color-muted)]">No email</span>
                        )}
                        <span className="mono text-[10px] text-[var(--color-muted)]">
                          {candidate.phone ?? "No phone"}
                        </span>
                      </div>
                    </td>
                    <td className="min-w-[150px]">
                      <span className="block text-sm text-[var(--color-ink-2)]">
                        {candidate.applied_position}
                      </span>
                      <span className="block text-[11px] text-[var(--color-muted)]">
                        {employmentLabel(candidate.employment_type)}
                        {candidate.department ? ` · ${candidate.department}` : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                      {candidate.proposed_joining_date
                        ? formatDate(candidate.proposed_joining_date)
                        : "Not set"}
                    </td>
                    <td>
                      <span
                        className={
                          candidate.is_active
                            ? "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] bg-[var(--color-ok-soft)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-ok)]"
                            : "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] bg-[var(--color-paper-3)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-muted)]"
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={
                            candidate.is_active
                              ? "h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
                              : "h-1.5 w-1.5 rounded-full bg-[var(--color-faint)]"
                          }
                        />
                        {candidate.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/offers?candidate_id=${candidate.id}`}>Offers</Link>
                        </Button>
                        {canManageOffers ? (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => openEdit(candidate)}>
                              <Pencil size={12} strokeWidth={2} aria-hidden="true" />
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setToggleTarget(candidate);
                                setToggleError(null);
                              }}
                            >
                              {candidate.is_active ? (
                                <UserX size={12} strokeWidth={2} aria-hidden="true" />
                              ) : (
                                <UserCheck size={12} strokeWidth={2} aria-hidden="true" />
                              )}
                              {candidate.is_active ? "Deactivate" : "Reactivate"}
                            </Button>
                          </>
                        ) : null}
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

      <CandidateFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        candidate={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["candidates"] });
        }}
      />

      <ActionDialog
        open={toggleTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToggleTarget(null);
            setToggleError(null);
          }
        }}
        title={
          toggleTarget?.is_active
            ? `Deactivate ${toggleTarget?.full_name ?? "this candidate"}?`
            : `Reactivate ${toggleTarget?.full_name ?? "this candidate"}?`
        }
        description={
          toggleTarget?.is_active
            ? "Inactive candidates cannot be picked for a new offer. Existing offers and their history stay untouched, and you can reactivate the record at any time."
            : "The candidate becomes selectable in the offer builder again. Their details are unchanged."
        }
        confirmLabel={toggleTarget?.is_active ? "Deactivate" : "Reactivate"}
        loading={toggleMutation.isPending}
        onConfirm={() => toggleTarget && toggleMutation.mutate(toggleTarget)}
      >
        {toggleError ? (
          <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
            {toggleError}
          </p>
        ) : null}
      </ActionDialog>
    </div>
  );
}

function CandidatesFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-9 w-full max-w-[600px]" />
      <TableSkeleton rows={7} columns={6} />
    </div>
  );
}
