"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, RestrictedState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { formatINR, formatNumber, relativeTime } from "@/lib/format";
import type { OfferSummary } from "@/lib/types";

type Decision = "approve" | "return";

export default function ApprovalsPage() {
  return (
    <React.Suspense fallback={<ApprovalsFallback />}>
      <ApprovalsContent />
    </React.Suspense>
  );
}

function ApprovalsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { canApprove } = useSession();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const query = useQuery({
    queryKey: ["approvals", page],
    queryFn: () =>
      api.offers.list({ status: "PENDING_APPROVAL", page, page_size: 20 }),
  });

  const [selected, setSelected] = React.useState<OfferSummary | null>(null);
  const [decision, setDecision] = React.useState<Decision>("approve");
  const [comments, setComments] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No offer selected.");
      if (decision === "approve") return api.offers.approve(selected.id, comments.trim() || undefined);
      return api.offers.returnToHr(selected.id, comments.trim());
    },
    onSuccess: () => {
      toast.success(decision === "approve" ? "Offer approved." : "Offer returned to HR as a draft.");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setSelected(null);
      setComments("");
      setError(null);
    },
    onError: (mutationError) => {
      setError(errorMessage(mutationError));
      query.refetch();
    },
  });

  function openDecision(offer: OfferSummary, next: Decision) {
    setSelected(offer);
    setDecision(next);
    setComments("");
    setError(null);
  }

  function changePage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const next = params.toString();
    router.replace(next ? `/approvals?${next}` : "/approvals");
  }

  const data = query.data;
  const oldest = data?.items.reduce<string | null>(
    (earliest, offer) => (!earliest || offer.created_at < earliest ? offer.created_at : earliest),
    null,
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Approvals"
        description="Every submitted revision waits here for an approver's decision. HR can edit a returned draft and resubmit it."
        meta={
          data ? (
            <>
              <span className="text-xs text-[var(--color-muted)]">
                <span className="mono text-[var(--color-ink-2)]">{formatNumber(data.total)}</span>{" "}
                {data.total === 1 ? "offer" : "offers"} awaiting a decision
              </span>
              {oldest ? (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--color-rule-2)]" />
                  <span className="text-xs text-[var(--color-muted)]">
                    oldest submitted {relativeTime(oldest)}
                  </span>
                </>
              ) : null}
            </>
          ) : null
        }
      />

      {!canApprove ? (
        <RestrictedState
          title="Read-only approval queue"
          message="Hiring managers and super admins record approval decisions. Your role can still open each offer to review its terms, but the decision buttons stay with an approver."
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/offers?status=PENDING_APPROVAL">Open the filtered register</Link>
            </Button>
          }
        />
      ) : null}

      {query.isPending ? (
        <TableSkeleton rows={5} columns={5} />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "The approval queue could not load."}
          onRetry={() => query.refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="Nothing is waiting for approval"
          description="When HR submits a draft, it appears here with the revision that needs a decision. Nothing is blocking the desk right now."
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/offers">Open the offer register</Link>
            </Button>
          }
        />
      ) : data ? (
        <div className="flex flex-col">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Role</th>
                  <th scope="col">Revision</th>
                  <th scope="col" className="text-right">Annual CTC</th>
                  <th scope="col">Submitted</th>
                  <th scope="col" className="text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((offer) => (
                  <tr key={offer.id}>
                    <td>
                      <Link href={`/offers/${offer.id}`} className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--color-ink)]">
                          {offer.candidate_name}
                        </span>
                        <span className="mono text-[10px] text-[var(--color-cool-deep)]">
                          {offer.offer_number}
                        </span>
                      </Link>
                    </td>
                    <td className="min-w-[150px]">
                      <span className="block text-sm text-[var(--color-ink-2)]">{offer.job_title}</span>
                      <span className="block text-[11px] text-[var(--color-muted)]">
                        {offer.department ?? "No department"}
                      </span>
                    </td>
                    <td>
                      <span className="mono text-xs text-[var(--color-ink-2)]">
                        rev {offer.revision_number}
                      </span>
                      <div className="mt-1">
                        <StatusBadge status={offer.status} />
                      </div>
                    </td>
                    <td className="mono whitespace-nowrap text-right text-xs text-[var(--color-ink-2)]">
                      {formatINR(offer.annual_ctc)}
                    </td>
                    <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                      {relativeTime(offer.created_at)}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/offers/${offer.id}`}>
                            Review
                            <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
                          </Link>
                        </Button>
                        {canApprove ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openDecision(offer, "return")}
                            >
                              <Undo2 size={12} strokeWidth={2} aria-hidden="true" />
                              Return
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openDecision(offer, "approve")}
                            >
                              <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                              Approve
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
            onPageChange={changePage}
          />
        </div>
      ) : null}

      <ActionDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setError(null);
          }
        }}
        title={
          decision === "approve"
            ? `Approve ${selected?.candidate_name ?? "this offer"}?`
            : `Return ${selected?.candidate_name ?? "this offer"} to HR?`
        }
        description={
          decision === "approve"
            ? `Approval records your name against revision ${selected?.revision_number ?? ""}. HR can then issue the offer.`
            : `The draft goes back to HR for changes. The candidate never sees this revision.`
        }
        confirmLabel={decision === "approve" ? "Approve offer" : "Return to HR"}
        loading={mutation.isPending}
        confirmDisabled={mutation.isPending || (decision === "return" && !comments.trim())}
        onConfirm={() => mutation.mutate()}
      >
        <Field
          label={decision === "approve" ? "Comment (optional)" : "Reason for returning"}
          htmlFor="decision-comment"
          required={decision === "return"}
          hint={
            decision === "approve"
              ? "Stored on the approval record and visible in the offer's activity."
              : "Required. HR sees this before editing the draft."
          }
        >
          <Textarea
            id="decision-comment"
            rows={3}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            placeholder={
              decision === "approve"
                ? "Any condition or note for the HR desk."
                : "What needs to change before this can be approved?"
            }
            aria-invalid={decision === "return" && !comments.trim()}
          />
        </Field>
        {error ? (
          <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
            {error}
          </p>
        ) : null}
      </ActionDialog>
    </div>
  );
}

function ApprovalsFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="skeleton h-20 w-full" />
      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}
