"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Link2,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { OfferEventTrail, OfferProgress } from "@/components/lifecycle";
import { DefinitionList, PageHeader, SectionHeading } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api, downloadUrl, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  daysUntil,
  employmentLabel,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatINR,
  pluralize,
  relativeTime,
} from "@/lib/format";
import type { OfferDetail, OfferIssueResult, TermsDetails } from "@/lib/types";

type FlowAction = "submit" | "approve" | "return" | "issue" | "withdraw" | "revise" | "link";
type ActionResult = { offer: OfferDetail; secureLink?: string | null; emailStatus?: string; message?: string };

type ActionPayload =
  | { kind: "submit" }
  | { kind: "approve"; comments?: string }
  | { kind: "return"; comments: string }
  | { kind: "issue" }
  | { kind: "withdraw"; reason: string }
  | { kind: "revise"; reason?: string }
  | { kind: "link" };

const ACTION_META: Record<
  FlowAction,
  { title: string; description: string; confirm: string; tone: "primary" | "danger" }
> = {
  submit: {
    title: "Submit this offer for approval?",
    description:
      "An approver will review this revision. The candidate still cannot see it until HR issues it.",
    confirm: "Submit for approval",
    tone: "primary",
  },
  approve: {
    title: "Approve this revision?",
    description:
      "Approval records your name against this exact revision. HR can then issue it to the candidate.",
    confirm: "Approve offer",
    tone: "primary",
  },
  return: {
    title: "Return this offer to HR?",
    description:
      "The offer goes back to draft so HR can change it. The reason is kept in the approval record.",
    confirm: "Return to HR",
    tone: "primary",
  },
  issue: {
    title: "Issue this offer?",
    description:
      "This freezes an immutable snapshot, renders the PDF and creates a private candidate link. The previous link, if any, stops working.",
    confirm: "Issue offer",
    tone: "primary",
  },
  withdraw: {
    title: "Withdraw this offer?",
    description:
      "The candidate link is revoked immediately. The offer stays in the register with the reason you give.",
    confirm: "Withdraw offer",
    tone: "danger",
  },
  revise: {
    title: "Start a new revision?",
    description:
      "A fresh draft opens against the same reference. Earlier revisions stay intact and the candidate link stays revoked.",
    confirm: "Start revision",
    tone: "primary",
  },
  link: {
    title: "Generate a new secure link?",
    description:
      "The current link stops working at once. The new link is shown once here and emailed to the candidate.",
    confirm: "Generate new link",
    tone: "primary",
  },
};

const TERM_LABELS: Array<[keyof TermsDetails, string]> = [
  ["probation", "Probation"],
  ["working_hours", "Working hours"],
  ["leave_policy", "Leave policy"],
  ["confidentiality", "Confidentiality"],
  ["notice_period", "Notice period"],
  ["termination", "Termination"],
  ["company_policies", "Company policies"],
  ["joining_requirements", "Joining requirements"],
  ["additional_clauses", "Additional clauses"],
];

export default function OfferDetailPage() {
  const params = useParams();
  const offerId = typeof params.id === "string" ? params.id : (params.id?.[0] ?? "");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canManageOffers, canApprove } = useSession();

  const query = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => api.offers.get(offerId),
    enabled: Boolean(offerId),
    retry: false,
  });
  const offer = query.data;
  const candidateId = offer?.candidate_id;
  const candidate = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => api.candidates.get(candidateId as string),
    enabled: Boolean(candidateId),
    retry: false,
  });

  const [action, setAction] = React.useState<FlowAction | null>(null);
  const [comments, setComments] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [linkResult, setLinkResult] = React.useState<{
    url: string;
    message: string;
    emailStatus: string;
  } | null>(null);
  const [previewKey, setPreviewKey] = React.useState(0);

  const mutation = useMutation<ActionResult, unknown, ActionPayload>({
    mutationFn: async (payload) => {
      switch (payload.kind) {
        case "submit":
          return { offer: await api.offers.submit(offerId) };
        case "approve":
          return { offer: await api.offers.approve(offerId, payload.comments) };
        case "return":
          return { offer: await api.offers.returnToHr(offerId, payload.comments) };
        case "issue": {
          const result: OfferIssueResult = await api.offers.issue(offerId);
          return {
            offer: result.offer,
            secureLink: result.secure_link,
            emailStatus: result.email_status,
            message: result.message,
          };
        }
        case "withdraw":
          return { offer: await api.offers.withdraw(offerId, payload.reason) };
        case "revise":
          return { offer: await api.offers.revise(offerId, payload.reason) };
        case "link": {
          const result: OfferIssueResult = await api.offers.regenerateLink(offerId);
          return {
            offer: result.offer,
            secureLink: result.secure_link,
            emailStatus: result.email_status,
            message: result.message,
          };
        }
      }
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(["offer", offerId], result.offer);
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });

      setAction(null);
      setComments("");
      setReason("");
      setActionError(null);

      if (result.secureLink) {
        setLinkResult({
          url: result.secureLink,
          message: result.message ?? "A new secure link is ready.",
          emailStatus: result.emailStatus ?? "queued",
        });
      }

      if (variables.kind === "revise") {
        toast.success("Revision draft opened. Update the offer, then resubmit it.");
        router.push(`/offers/${offerId}/edit`);
        return;
      }

      const messages: Record<FlowAction, string> = {
        submit: "Offer submitted for approval.",
        approve: "Offer approved. It can be issued when ready.",
        return: "Offer returned to HR as a draft.",
        issue: "Offer issued. Share the secure link if the email does not arrive.",
        withdraw: "Offer withdrawn and the candidate link revoked.",
        revise: "Revision started.",
        link: "A new secure link was generated. The old one no longer works.",
      };
      toast.success(messages[variables.kind]);
    },
    onError: (error) => {
      setActionError(errorMessage(error));
      if (error instanceof ApiError && error.status === 409) {
        query.refetch();
      }
    },
  });

  if (query.isPending) return <DossierSkeleton />;

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Offer record"
          description="This offer could not be loaded."
          backHref="/offers"
          backLabel="Back to offers"
        />
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "The offer could not load."}
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const data = query.data;
  const status = data.status;
  const isClosed = status === "ACCEPTED" || status === "REJECTED";
  const isIssued = status === "ISSUED" || status === "VIEWED" || status === "REISSUED";
  const canEdit = canManageOffers && ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(status);

  const flowActions: Array<{ key: FlowAction; label: string; primary: boolean; icon: React.ReactNode }> = [];
  if (canManageOffers && status === "DRAFT") {
    flowActions.push({ key: "submit", label: "Submit for approval", primary: true, icon: <Send size={14} strokeWidth={2} aria-hidden="true" /> });
  }
  if (canApprove && status === "PENDING_APPROVAL") {
    flowActions.push({ key: "approve", label: "Approve offer", primary: true, icon: <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" /> });
    flowActions.push({ key: "return", label: "Return to HR", primary: false, icon: <Undo2 size={14} strokeWidth={2} aria-hidden="true" /> });
  }
  if (canManageOffers && status === "APPROVED") {
    flowActions.push({ key: "issue", label: "Issue offer", primary: true, icon: <Send size={14} strokeWidth={2} aria-hidden="true" /> });
    flowActions.push({ key: "withdraw", label: "Withdraw offer", primary: false, icon: <XCircle size={14} strokeWidth={2} aria-hidden="true" /> });
  }
  if (canManageOffers && isIssued) {
    flowActions.push({ key: "link", label: "Regenerate link", primary: false, icon: <Link2 size={14} strokeWidth={2} aria-hidden="true" /> });
    flowActions.push({ key: "withdraw", label: "Withdraw offer", primary: false, icon: <XCircle size={14} strokeWidth={2} aria-hidden="true" /> });
  }
  if (canManageOffers && ["WITHDRAWN", "EXPIRED", "REJECTED"].includes(status)) {
    flowActions.push({ key: "revise", label: "Start revision", primary: true, icon: <RotateCcw size={14} strokeWidth={2} aria-hidden="true" /> });
  }

  const primaryFlow = flowActions.find((item) => item.primary);
  const secondaryFlow = flowActions.filter((item) => !item.primary);
  const pdfHref = `${api.offers.pdf(data.id)}?download=true`;
  const previewHref = downloadUrl(`/offers/${data.id}/preview`);

  function confirmAction() {
    if (!action) return;
    if (action === "return" && !comments.trim()) return;
    if (action === "withdraw" && !reason.trim()) return;

    let payload: ActionPayload;
    switch (action) {
      case "submit":
        payload = { kind: "submit" };
        break;
      case "approve":
        payload = { kind: "approve", comments: comments.trim() || undefined };
        break;
      case "return":
        payload = { kind: "return", comments: comments.trim() };
        break;
      case "issue":
        payload = { kind: "issue" };
        break;
      case "withdraw":
        payload = { kind: "withdraw", reason: reason.trim() };
        break;
      case "revise":
        payload = { kind: "revise", reason: reason.trim() || undefined };
        break;
      case "link":
        payload = { kind: "link" };
        break;
    }
    setActionError(null);
    mutation.mutate(payload);
  }

  const meta = ACTION_META[action ?? "submit"];
  const confirmDisabled =
    mutation.isPending ||
    (action === "return" && !comments.trim()) ||
    (action === "withdraw" && !reason.trim());

  const compensation = data.data.compensation;
  const employment = data.data.employment;
  const monthlyEarnings = compensation.earnings.reduce(
    (sum, item) => sum + (item.period === "ANNUAL" ? item.amount / 12 : item.amount),
    0,
  );
  const monthlyDeductions = compensation.deductions.reduce(
    (sum, item) => sum + (item.period === "ANNUAL" ? item.amount / 12 : item.amount),
    0,
  );
  const expiryDays = daysUntil(data.expires_at);
  const currentRevision = data.revisions.find((revision) => revision.is_current) ?? data.revisions.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.candidate_name}
        description={`${employment.job_title} · ${employment.department || "No department"} · ${employmentLabel(employment.employment_type)}`}
        backHref="/offers"
        backLabel="Back to offers"
        meta={
          <>
            <span className="mono text-xs font-semibold text-[var(--color-ink)]">
              {data.official_offer_number ?? data.offer_number}
            </span>
            {data.official_offer_number ? (
              <span className="mono text-[10px] text-[var(--color-muted)]">
                ({data.offer_number})
              </span>
            ) : null}
            <StatusBadge status={status} />
            <span className="text-xs text-[var(--color-muted)]">
              Revision {data.revision_number}
            </span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--color-rule-2)]" />
            <span className="text-xs text-[var(--color-muted)]">
              created {relativeTime(data.created_at)} by {data.created_by_name ?? "staff"}
            </span>
          </>
        }
        actions={
          <>
            {primaryFlow ? (
              <Button variant="primary" onClick={() => setAction(primaryFlow.key)}>
                {primaryFlow.icon}
                {primaryFlow.label}
              </Button>
            ) : (
              <Button variant="primary" asChild>
                <a href={pdfHref}>
                  <Download size={14} strokeWidth={2} aria-hidden="true" />
                  Download PDF
                </a>
              </Button>
            )}
            {canEdit ? (
              <Button variant="secondary" asChild>
                <Link href={`/offers/${data.id}/edit`}>
                  <Pencil size={13} strokeWidth={2} aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {primaryFlow ? (
              <Button variant="secondary" asChild>
                <a href={pdfHref}>
                  <Download size={13} strokeWidth={2} aria-hidden="true" />
                  PDF
                </a>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                const w = window.open(api.offers.pdf(data.id), "_blank", "noopener");
                w?.addEventListener("load", () => {
                  try { w.print(); } catch { /* viewer print */ }
                });
              }}
            >
              <Printer size={13} strokeWidth={2} aria-hidden="true" />
              Print
            </Button>
            {data.official_offer_number ? (
              <Button variant="secondary" asChild>
                <Link href="/verify">
                  <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
                  Verify
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {isClosed ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-panel)] border px-4 py-3",
            status === "ACCEPTED"
              ? "border-[var(--color-ok)] bg-[var(--color-ok-soft)]"
              : "border-[var(--color-bad)] bg-[var(--color-bad-soft)]",
          )}
          role="status"
        >
          <span
            className={cn(
              "text-sm font-semibold",
              status === "ACCEPTED" ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]",
            )}
          >
            {status === "ACCEPTED" ? "Candidate accepted this offer" : "Candidate declined this offer"}
          </span>
          <span className="text-xs text-[var(--color-ink-2)]">
            {formatDateTime(data.responded_at)} · revision {data.revision_number}
          </span>
          {data.rejection_reason ? (
            <span className="text-xs text-[var(--color-ink-2)]">Reason: {data.rejection_reason}</span>
          ) : null}
        </div>
      ) : null}

      {status === "WITHDRAWN" && data.withdrawal_reason ? (
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-muted)] bg-[var(--color-paper-2)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
          <strong className="font-semibold">Withdrawn:</strong> {data.withdrawal_reason}
          <span className="ml-2 text-xs text-[var(--color-muted)]">
            {formatDateTime(data.withdrawn_at)}
          </span>
        </div>
      ) : null}

      <OfferProgress status={status} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="letter-heading" className="flex flex-col gap-3">
            <SectionHeading
              id="letter-heading"
              title="Offer letter"
              description={
                isIssued || isClosed
                  ? "The immutable document the candidate received. Revisions are preserved below."
                  : "A live render of the current draft. Nothing is frozen until the offer is issued."
              }
              actions={
                <Button variant="secondary" size="sm" onClick={() => setPreviewKey((value) => value + 1)}>
                  <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
                  Reload
                </Button>
              }
            />
            <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-rule-2)] bg-white">
              <iframe
                key={previewKey}
                title={`Offer letter preview for ${data.offer_number}`}
                src={previewHref}
                sandbox=""
                className="h-[720px] w-full bg-white"
              />
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
              Preview is rendered from stored data. The issued PDF is written to private storage and
              served only through an authenticated route or the candidate&apos;s secure link.
            </p>
          </section>

          <Tabs defaultValue="compensation" className="min-w-0">
            <TabsList aria-label="Offer record sections">
              <TabsTrigger value="compensation">Compensation</TabsTrigger>
              <TabsTrigger value="terms">Terms</TabsTrigger>
              <TabsTrigger value="approvals">
                Approvals
                {data.approvals.length > 0 ? (
                  <span className="mono text-[10px] text-[var(--color-muted)]">{data.approvals.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="revisions">
                Revisions
                {data.revisions.length > 0 ? (
                  <span className="mono text-[10px] text-[var(--color-muted)]">{data.revisions.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="compensation">
              <div className="flex flex-col gap-5">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                  <div className="border-t border-[var(--color-rule)] pt-3">
                    <dt className="text-xs text-[var(--color-muted)]">Annual CTC</dt>
                    <dd className="figure mt-1 text-2xl text-[var(--color-ink)]">
                      {formatINR(compensation.annual_ctc)}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--color-rule)] pt-3">
                    <dt className="text-xs text-[var(--color-muted)]">Monthly gross</dt>
                    <dd className="figure mt-1 text-2xl text-[var(--color-ink)]">
                      {formatINR(compensation.monthly_gross)}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--color-rule)] pt-3">
                    <dt className="text-xs text-[var(--color-muted)]">Payment</dt>
                    <dd className="mt-1 text-sm text-[var(--color-ink-2)]">
                      {compensation.payment_frequency.toLowerCase()} · {compensation.currency}
                    </dd>
                  </div>
                </dl>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <h3 className="font-display text-md text-[var(--color-ink)]">Earnings</h3>
                    {compensation.earnings.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted)]">No components listed.</p>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Component</th>
                            <th scope="col">Period</th>
                            <th scope="col" className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compensation.earnings.map((item, index) => (
                            <tr key={`${item.name}-${index}`}>
                              <td className="text-sm text-[var(--color-ink-2)]">{item.name}</td>
                              <td className="text-xs text-[var(--color-muted)]">
                                {item.period === "ANNUAL" ? "Annual" : "Monthly"}
                              </td>
                              <td className="mono text-right text-xs text-[var(--color-ink-2)]">
                                {formatINR(item.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <th scope="row" className="text-xs font-semibold text-[var(--color-ink-2)]">
                              Monthly equivalent
                            </th>
                            <td />
                            <td className="mono text-right text-xs font-semibold text-[var(--color-ink)]">
                              {formatINR(Math.round(monthlyEarnings))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h3 className="font-display text-md text-[var(--color-ink)]">Deductions</h3>
                    {compensation.deductions.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted)]">No deductions listed.</p>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Component</th>
                            <th scope="col">Period</th>
                            <th scope="col" className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compensation.deductions.map((item, index) => (
                            <tr key={`${item.name}-${index}`}>
                              <td className="text-sm text-[var(--color-ink-2)]">{item.name}</td>
                              <td className="text-xs text-[var(--color-muted)]">
                                {item.period === "ANNUAL" ? "Annual" : "Monthly"}
                              </td>
                              <td className="mono text-right text-xs text-[var(--color-ink-2)]">
                                {formatINR(item.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <th scope="row" className="text-xs font-semibold text-[var(--color-ink-2)]">
                              Monthly equivalent
                            </th>
                            <td />
                            <td className="mono text-right text-xs font-semibold text-[var(--color-ink)]">
                              {formatINR(Math.round(monthlyDeductions))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {compensation.notes ? (
                  <div className="border-t border-[var(--color-rule)] pt-3">
                    <p className="text-xs font-semibold text-[var(--color-ink-2)]">Compensation notes</p>
                    <p className="prose-copy mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
                      {compensation.notes}
                    </p>
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="terms">
              <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-warn)] bg-[var(--color-warn-soft)] px-4 py-3 text-xs leading-relaxed text-[var(--color-ink-2)]">
                  <strong className="font-semibold">Neutral starter copy, not legal advice.</strong>{" "}
                  Clauses are editable per offer and must be reviewed by a qualified adviser before
                  they are relied on.
                </div>
                <DefinitionList
                  columns={2}
                  items={TERM_LABELS.map(([key, label]) => ({
                    term: label,
                    detail: data.data.terms[key] ? (
                      <span className="whitespace-pre-line">{data.data.terms[key]}</span>
                    ) : (
                      <span className="text-[var(--color-muted)]">Not provided</span>
                    ),
                  }))}
                />
              </div>
            </TabsContent>

            <TabsContent value="approvals">
              {data.approvals.length === 0 ? (
                <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-rule-2)] px-4 py-5 text-sm text-[var(--color-muted)]">
                  No approval has been requested yet. Submitting the draft creates the first request.
                </p>
              ) : (
                <ol className="flex flex-col divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
                  {data.approvals.map((approval) => (
                    <li key={approval.id} className="flex flex-col gap-2 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mono text-xs text-[var(--color-ink-2)]">
                            Revision {approval.revision_number}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-[var(--radius-tag)] px-2 py-1 text-[10px] font-semibold leading-none",
                              approval.status === "APPROVED"
                                ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                                : approval.status === "RETURNED"
                                  ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                                  : "bg-[var(--color-paper-3)] text-[var(--color-ink-2)]",
                            )}
                          >
                            {approval.status === "PENDING"
                              ? "Pending decision"
                              : approval.status === "APPROVED"
                                ? "Approved"
                                : "Returned"}
                          </span>
                        </div>
                        <span className="mono text-[10px] text-[var(--color-muted)]">
                          {relativeTime(approval.requested_at)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">
                        Requested by {approval.requested_by_name ?? "staff"} on{" "}
                        {formatDateTime(approval.requested_at)}
                        {approval.approved_by_name
                          ? ` · decided by ${approval.approved_by_name} on ${formatDateTime(approval.decided_at)}`
                          : ""}
                      </p>
                      {approval.comments ? (
                        <p className="max-w-[70ch] rounded-[var(--radius-control)] bg-[var(--color-paper-2)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink-2)]">
                          {approval.comments}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="revisions">
              {data.revisions.length === 0 ? (
                <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-rule-2)] px-4 py-5 text-sm text-[var(--color-muted)]">
                  No issued revision yet. The first snapshot is created when the approved offer is
                  issued.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
                  {data.revisions.map((revision) => (
                    <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                          Revision {revision.revision_number}
                          {revision.is_current ? (
                            <span className="rounded-[var(--radius-tag)] bg-[var(--color-cool-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-cool-deep)]">
                              Current
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-[var(--color-muted)]">
                          issued {formatDateTime(revision.issued_at)} · {revision.created_by_name ?? "staff"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" asChild>
                          <a href={api.offers.revisionPdf(data.id, revision.id)}>
                            <Download size={13} strokeWidth={2} aria-hidden="true" />
                            PDF
                          </a>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="activity">
              <OfferEventTrail events={data.events} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {secondaryFlow.length > 0 ? (
            <section
              aria-labelledby="next-actions-heading"
              className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-4 sm:p-5"
            >
              <SectionHeading id="next-actions-heading" title="Next actions" />
              <div className="mt-3 flex flex-col gap-2">
                {secondaryFlow.map((item) => (
                  <Button
                    key={item.key}
                    variant={item.key === "withdraw" ? "danger-outline" : "secondary"}
                    className="justify-start"
                    onClick={() => setAction(item.key)}
                  >
                    {item.icon}
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="mt-3 border-t border-[var(--color-rule)] pt-3 text-[11px] leading-relaxed text-[var(--color-muted)]">
                {status === "PENDING_APPROVAL"
                  ? "A returned offer becomes a draft again; the candidate never sees the pending version."
                  : isIssued
                    ? "The candidate keeps the current link until you regenerate it. A new link revokes the old one immediately."
                    : "Actions are recorded against your staff account in the audit log."}
              </p>
            </section>
          ) : null}

          <section
            aria-labelledby="record-heading"
            className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 sm:p-5"
          >
            <SectionHeading id="record-heading" title="Record" />
            <DefinitionList
              className="mt-4"
              columns={1}
              items={[
                { term: "Reference", detail: <span className="mono text-xs">{data.offer_number}</span> },
                { term: "Template", detail: data.template_name ?? "Default letterhead" },
                { term: "Created", detail: `${formatDateTime(data.created_at)} · ${data.created_by_name ?? "staff"}` },
                {
                  term: "Approved",
                  detail: data.approved_by_name
                    ? `${data.approved_by_name} · ${formatDateTime(data.events.find((event) => event.event_type === "APPROVED")?.created_at)}`
                    : "Not yet approved",
                },
                {
                  term: "Issued",
                  detail: data.issued_at ? formatDateTime(data.issued_at) : "Not issued",
                },
                {
                  term: "Expires",
                  detail: data.expires_at ? (
                    <span>
                      {formatDate(data.expires_at)}
                      {expiryDays !== null && !isClosed ? (
                        <span className={cn("ml-2 text-xs", expiryDays <= 2 ? "text-[var(--color-warn)]" : "text-[var(--color-muted)]")}>
                          {expiryDays < 0
                            ? "past the window"
                            : expiryDays === 0
                              ? "closes today"
                              : `${pluralize(expiryDays, "day")} left`}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    "Not issued"
                  ),
                },
                {
                  term: "Candidate response",
                  detail: data.response
                    ? `${data.response === "ACCEPTED" ? "Accepted" : "Declined"} · ${formatDateTime(data.responded_at)}`
                    : "No response yet",
                },
              ]}
            />
          </section>

          <section
            aria-labelledby="candidate-heading"
            className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-4 sm:p-5"
          >
            <SectionHeading
              id="candidate-heading"
              title="Candidate"
              actions={
                <Button variant="quiet" size="sm" asChild>
                  <Link href={`/offers?candidate_id=${data.candidate_id}`}>
                    Offers
                    <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
            <div className="mt-4 flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{data.candidate_name}</p>
              <p className="text-xs text-[var(--color-muted)]">{data.candidate_email}</p>
              {candidate.data ? (
                <>
                  <p className="mono mt-1 text-xs text-[var(--color-ink-2)]">{candidate.data.phone}</p>
                  {candidate.data.current_address ? (
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[var(--color-muted)]">
                      {candidate.data.current_address}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            <DefinitionList
              className="mt-4"
              columns={1}
              items={[
                { term: "Joining date", detail: formatDateLong(employment.joining_date) },
                { term: "Work location", detail: employment.work_location },
                { term: "Reporting manager", detail: employment.reporting_manager },
                { term: "Probation", detail: `${employment.probation_months} month${employment.probation_months === 1 ? "" : "s"}` },
                { term: "Working days", detail: employment.working_days },
                { term: "Working hours", detail: employment.working_hours },
              ]}
            />
          </section>

          <section
            aria-labelledby="delivery-heading"
            className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 sm:p-5"
          >
            <SectionHeading id="delivery-heading" title="Secure delivery" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] px-2 py-1 text-[10px] font-semibold leading-none",
                  data.has_active_link
                    ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                    : "bg-[var(--color-paper-3)] text-[var(--color-muted)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    data.has_active_link ? "bg-[var(--color-ok)]" : "bg-[var(--color-faint)]",
                  )}
                />
                {data.has_active_link ? "Active candidate link" : "No active link"}
              </span>
              {data.token_revoked_at ? (
                <span className="text-[10px] text-[var(--color-muted)]">
                  revoked {formatDateTime(data.token_revoked_at)}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-muted)]">
              {data.has_active_link
                ? "The raw link is not stored and cannot be shown again. Regenerate it from Next actions if the candidate loses it."
                : isIssued
                  ? "The candidate has no working link. Regenerate one from Next actions."
                  : "A secure link is created only when the offer is issued."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-rule)] pt-3">
              <Button variant="secondary" size="sm" asChild>
                <a href={pdfHref}>
                  <Download size={13} strokeWidth={2} aria-hidden="true" />
                  Current PDF
                </a>
              </Button>
              {currentRevision ? (
                <Button variant="secondary" size="sm" asChild>
                  <a href={api.offers.revisionPdf(data.id, currentRevision.id)}>
                    <FileText size={13} strokeWidth={2} aria-hidden="true" />
                    Revision {currentRevision.revision_number}
                  </a>
                </Button>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="notes-heading"
            className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-4 sm:p-5"
          >
            <SectionHeading id="notes-heading" title="Internal notes" />
            <p className="prose-copy mt-3 whitespace-pre-line text-xs leading-relaxed text-[var(--color-muted)]">
              {data.internal_notes || "No internal notes recorded. These notes are never shown to the candidate."}
            </p>
            {data.rejection_reason ? (
              <div className="mt-3 border-t border-[var(--color-rule)] pt-3">
                <p className="text-[10px] font-semibold text-[var(--color-ink-2)]">Candidate&apos;s reason for declining</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{data.rejection_reason}</p>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <ActionDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
            setActionError(null);
            setComments("");
            setReason("");
          }
        }}
        title={meta.title}
        description={meta.description}
        confirmLabel={meta.confirm}
        tone={meta.tone}
        loading={mutation.isPending}
        confirmDisabled={confirmDisabled}
        onConfirm={confirmAction}
      >
        {action === "approve" ? (
          <Field label="Comment (optional)" htmlFor="approval-comment" hint="Stored on the approval record.">
            <Textarea
              id="approval-comment"
              rows={3}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Any condition or note for the HR desk."
            />
          </Field>
        ) : null}
        {action === "return" ? (
          <Field label="Reason for returning" htmlFor="return-comment" required hint="HR sees this before editing the draft.">
            <Textarea
              id="return-comment"
              rows={3}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="What needs to change before this can be approved?"
              aria-invalid={!comments.trim()}
            />
          </Field>
        ) : null}
        {action === "withdraw" ? (
          <Field label="Reason for withdrawal" htmlFor="withdraw-reason" required hint="Kept in the offer record and audit log.">
            <Textarea
              id="withdraw-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why the offer is being withdrawn."
              aria-invalid={!reason.trim()}
            />
          </Field>
        ) : null}
        {action === "revise" ? (
          <Field label="Reason for the revision (optional)" htmlFor="revise-reason" hint="The new draft starts from the previous terms.">
            <Textarea
              id="revise-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: revised salary approved by management."
            />
          </Field>
        ) : null}
        {actionError ? (
          <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
            {actionError}
          </p>
        ) : null}
      </ActionDialog>

      <Dialog open={Boolean(linkResult)} onOpenChange={(open) => !open && setLinkResult(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Secure candidate link</DialogTitle>
            <DialogDescription>
              {linkResult?.message} The raw link is shown once; only a hash is stored.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={linkResult?.url ?? ""}
                aria-label="Secure candidate link"
                className="min-w-[200px] flex-1 font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <CopyButton value={linkResult?.url ?? ""} label="Copy link" />
            </div>
            <p className="rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink-2)]">
              Email delivery: <span className="mono">{linkResult?.emailStatus}</span>. In development
              the console provider records the email in Settings → Outbox instead of sending it.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" asChild>
                <a href={linkResult?.url ?? "#"} target="_blank" rel="noreferrer">
                  Open candidate portal
                  <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLinkResult(null)}>
                <Check size={13} strokeWidth={2} aria-hidden="true" />
                Done
              </Button>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
              Opening the portal yourself records a candidate view and can change the offer status.
              Use a private window only if you need to check what the candidate sees.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DossierSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 border-b border-[var(--color-rule)] pb-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-[560px]" />
      </div>
      <Skeleton className="h-[116px] w-full rounded-[10px]" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-[720px] w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
