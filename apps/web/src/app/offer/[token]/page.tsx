"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  daysUntil,
  employmentLabel,
  formatDateLong,
  formatDateTime,
  formatINR,
  pluralize,
} from "@/lib/format";

export default function CandidateOfferPage() {
  return (
    <React.Suspense fallback={<PublicSkeleton />}>
      <CandidateOfferContent />
    </React.Suspense>
  );
}

function CandidateOfferContent() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : (params.token?.[0] ?? "");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["public-offer", token],
    queryFn: () => api.public.get(token),
    enabled: Boolean(token),
    retry: false,
    staleTime: 0,
  });

  const [decision, setDecision] = React.useState<"accept" | "reject">("accept");
  const [consent, setConsent] = React.useState(false);
  const [typedName, setTypedName] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [responseError, setResponseError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<{
    status: string;
    message: string;
    responded_at: string;
  } | null>(null);

  const offer = query.data;

  const mutation = useMutation({
    mutationFn: () =>
      decision === "accept"
        ? api.public.accept(token, {
          consent,
          typed_name: (typedName ?? offer?.candidate_name ?? "").trim() || undefined,
        })
        : api.public.reject(token, {
          consent,
          reason: rejectReason.trim() || undefined,
        }),
    onSuccess: (result) => {
      setConfirmation(result);
      setConfirmOpen(false);
      setResponseError(null);
      toast.success(
        decision === "accept" ? "Your acceptance has been recorded." : "Your response has been recorded.",
      );
      queryClient.invalidateQueries({ queryKey: ["public-offer", token] });
    },
    onError: (error) => {
      setResponseError(errorMessage(error));
      setConfirmOpen(false);
      if (error instanceof ApiError && (error.status === 410 || error.status === 409)) {
        query.refetch();
      }
    },
  });

  if (query.isPending) return <PublicSkeleton />;

  if (query.isError) {
    const apiError = query.error instanceof ApiError ? query.error : null;
    const payloadCompany =
      apiError && typeof apiError.payload.company_name === "string"
        ? apiError.payload.company_name
        : null;
    const expired = apiError?.status === 410;
    return (
      <PublicShell companyName={payloadCompany}>
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-5 py-16 sm:px-8">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-paper-3)] text-[var(--color-muted)]">
            {expired ? (
              <Clock3 size={20} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <XCircle size={20} strokeWidth={1.8} aria-hidden="true" />
            )}
          </span>
          <h1 className="font-display text-2xl text-[var(--color-ink)]">
            {expired ? "This offer link is no longer open" : "This offer link is not valid"}
          </h1>
          <p className="prose-copy text-sm leading-relaxed text-[var(--color-muted)]">
            {apiError?.message ??
              "The link may be incomplete, or it may have been replaced by a newer one."}{" "}
            Contact the person who sent you the offer and ask them to issue a fresh link. Never
            forward this page or share it publicly.
          </p>
          {payloadCompany ? (
            <p className="text-xs text-[var(--color-muted)]">
              Offer from <span className="font-semibold text-[var(--color-ink-2)]">{payloadCompany}</span>
            </p>
          ) : null}
        </div>
      </PublicShell>
    );
  }

  if (!offer) return <PublicSkeleton />;

  const data = offer;
  const company = data.company;
  const daysLeft = daysUntil(data.expires_at);
  const closed = data.has_responded || Boolean(confirmation);
  const accepted = confirmation?.status === "ACCEPTED" || data.response === "ACCEPTED";
  const rejected = confirmation?.status === "REJECTED" || data.response === "REJECTED";
  const unavailable = data.is_expired;

  const earnings = data.compensation.earnings;
  const deductions = data.compensation.deductions;

  return (
    <PublicShell companyName={company.name}>
      <header className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={company.logo_url ?? "/brand/logo.png"}
              alt=""
              width={38}
              height={38}
              className="h-[34px] w-[34px] shrink-0"
            />
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-display text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
                {company.name}
              </span>
              <span className="mono mt-1 text-[10px] text-[var(--color-muted)]">
                Candidate offer portal
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono text-[10px] text-[var(--color-muted)]">{data.reference}</span>
            <span className="mono rounded-[3px] border border-[var(--color-rule-2)] bg-[var(--color-sheet)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)]">
              rev {data.revision_number}
            </span>
            {data.pdf_available ? (
              <Button variant="secondary" size="sm" asChild>
                <a href={api.public.pdf(token)} target="_blank" rel="noreferrer">
                  <Download size={12} strokeWidth={2} aria-hidden="true" />
                  PDF
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-3 border-b border-[var(--color-rule)] pb-6">
          <p className="mono text-xs text-[var(--color-accent-deep)]">Offer of appointment</p>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="font-display text-3xl leading-tight text-[var(--color-ink)] sm:text-[2.1rem]">
                {data.candidate_name}
              </h1>
              <p className="text-base text-[var(--color-ink-2)]">
                {data.position}
                {data.department ? ` · ${data.department}` : ""}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {employmentLabel(data.employment_type)}
                {data.work_location ? ` · ${data.work_location}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] px-2.5 py-1.5 text-xs font-semibold leading-none",
                  accepted
                    ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                    : rejected
                      ? "bg-[var(--color-bad-soft)] text-[var(--color-bad)]"
                      : unavailable
                        ? "bg-[var(--color-paper-3)] text-[var(--color-muted)]"
                        : "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    accepted
                      ? "bg-[var(--color-ok)]"
                      : rejected
                        ? "bg-[var(--color-bad)]"
                        : unavailable
                          ? "bg-[var(--color-faint)]"
                          : "bg-[var(--color-warn)]",
                  )}
                />
                {accepted
                  ? "Offer accepted"
                  : rejected
                    ? "Offer declined"
                    : unavailable
                      ? "Response window closed"
                      : "Awaiting your response"}
              </span>
              {data.expires_at && !closed ? (
                <span className="text-xs text-[var(--color-muted)]">
                  Respond by {formatDateLong(data.expires_at)}
                  {daysLeft !== null ? ` · ${daysLeft <= 0 ? "today" : pluralize(daysLeft, "day")} left` : ""}
                </span>
              ) : data.offer_date ? (
                <span className="text-xs text-[var(--color-muted)]">
                  Issued {formatDateLong(data.offer_date)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-labelledby="summary-heading" className="flex flex-col gap-4">
              <h2 id="summary-heading" className="font-display text-lg text-[var(--color-ink)]">
                The appointment
              </h2>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <SummaryItem icon={<FileText size={13} strokeWidth={2} aria-hidden="true" />} label="Reference" value={<span className="mono text-xs">{data.reference}</span>} />
                <SummaryItem icon={<CalendarDays size={13} strokeWidth={2} aria-hidden="true" />} label="Joining date" value={data.joining_date ? formatDateLong(data.joining_date) : "To be confirmed"} />
                <SummaryItem icon={<MapPin size={13} strokeWidth={2} aria-hidden="true" />} label="Work location" value={data.work_location ?? "To be confirmed"} />
                <SummaryItem icon={<ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />} label="Reporting manager" value={data.reporting_manager ?? "To be confirmed"} />
                <SummaryItem icon={<CalendarDays size={13} strokeWidth={2} aria-hidden="true" />} label="Offer date" value={data.offer_date ? formatDateLong(data.offer_date) : "—"} />
                <SummaryItem icon={<Clock3 size={13} strokeWidth={2} aria-hidden="true" />} label="Response deadline" value={data.expires_at ? formatDateLong(data.expires_at) : "—"} />
              </dl>
            </section>

            <section aria-labelledby="compensation-heading" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="compensation-heading" className="font-display text-lg text-[var(--color-ink)]">
                  Compensation
                </h2>
                <span className="mono text-[10px] text-[var(--color-muted)]">
                  {data.compensation.currency} · {data.compensation.payment_frequency.toLowerCase()}
                </span>
              </div>
              <div className="grid gap-x-6 gap-y-4 border-y border-[var(--color-rule)] py-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-muted)]">Annual cost to company</span>
                  <span className="figure text-2xl text-[var(--color-ink)]">
                    {formatINR(data.compensation.annual_ctc)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-muted)]">Monthly gross</span>
                  <span className="figure text-2xl text-[var(--color-ink)]">
                    {formatINR(data.compensation.monthly_gross)}
                  </span>
                </div>
              </div>

              {earnings.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold text-[var(--color-ink-2)]">Earnings</h3>
                  <div className="scroll-x">
                    <table className="data-table min-w-[420px]">
                      <thead>
                        <tr>
                          <th scope="col">Component</th>
                          <th scope="col">Period</th>
                          <th scope="col" className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earnings.map((item, index) => (
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
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {deductions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold text-[var(--color-ink-2)]">Deductions</h3>
                  <div className="scroll-x">
                    <table className="data-table min-w-[420px]">
                      <thead>
                        <tr>
                          <th scope="col">Component</th>
                          <th scope="col">Period</th>
                          <th scope="col" className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deductions.map((item, index) => (
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
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {data.compensation.notes ? (
                <p className="prose-copy border-t border-[var(--color-rule)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
                  {data.compensation.notes}
                </p>
              ) : null}
            </section>

            {data.training_policy?.enabled ? (
              <section aria-labelledby="progression-heading" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 id="progression-heading" className="font-display text-lg text-[var(--color-ink)]">
                    Compensation progression &amp; site facilities
                  </h2>
                </div>
                <div className="grid gap-3 border-y border-[var(--color-rule)] py-4 sm:grid-cols-3">
                  <TimelineStage
                    stage="Month 1"
                    title="Training period"
                    period={`${data.training_policy.training_period_months} month`}
                    amount={formatINR(data.training_policy.training_monthly_salary_inr)}
                    note={
                      data.training_policy.site_accommodation_free
                        ? "Free accommodation if staying at the working site"
                        : "No free site accommodation"
                    }
                    secondary={
                      data.training_policy.food_provided ? "Food provided" : "No food provided"
                    }
                  />
                  <TimelineStage
                    stage="Next 6 months"
                    title="Post-training salary"
                    period={`${data.training_policy.post_training_duration_months} months`}
                    amount={`${formatINR(data.training_policy.post_training_salary_min_inr)} – ${formatINR(data.training_policy.post_training_salary_max_inr)}`}
                    note="Performance-based revision"
                  />
                  <TimelineStage
                    stage="After 6 months"
                    title="First increment"
                    period={`After ${data.training_policy.first_increment_after_months} months`}
                    amount={`Up to ${data.training_policy.first_increment_max_percent}%`}
                    note={`Based on ${data.training_policy.increment_criteria}`}
                  />
                </div>
              </section>
            ) : null}

            <section aria-labelledby="company-heading" className="flex flex-col gap-3 border-t border-[var(--color-rule)] pt-6">
              <h2 id="company-heading" className="font-display text-lg text-[var(--color-ink)]">
                From {company.name}
              </h2>
              <p className="prose-copy text-sm leading-relaxed text-[var(--color-muted)]">
                This offer is extended by {company.legal_name || company.name}. The signed letter is
                the document to keep; the figures above match the issued revision.
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted)]">
                {company.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={12} strokeWidth={2} aria-hidden="true" />
                    <a href={`tel:${company.phone.replace(/\s+/g, "")}`} className="hover:underline">
                      {company.phone}
                    </a>
                  </span>
                ) : null}
                {company.email ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={12} strokeWidth={2} aria-hidden="true" />
                    <a href={`mailto:${company.email}`} className="hover:underline">
                      {company.email}
                    </a>
                  </span>
                ) : null}
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Website
                    <ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                {[company.address_line1, company.address_line2, company.city, company.state, company.postal_code, company.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {company.udyam_number ? (
                <p className="mono text-[10px] text-[var(--color-faint)]">
                  Udyam {company.udyam_number}
                </p>
              ) : null}
              {company.signatory_name ? (
                <p className="mt-2 text-sm text-[var(--color-ink-2)]">
                  {company.signatory_name}
                  {company.signatory_title ? (
                    <span className="block text-xs text-[var(--color-muted)]">{company.signatory_title}</span>
                  ) : null}
                </p>
              ) : null}
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <section
              aria-labelledby="response-heading"
              className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5 lg:sticky lg:top-6"
            >
              <h2 id="response-heading" className="font-display text-lg text-[var(--color-ink)]">
                {closed ? "Your response" : unavailable ? "Response window closed" : "Your decision"}
              </h2>

              {accepted ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-ok)] bg-[var(--color-ok-soft)] px-3 py-3">
                    <CheckCircle2 size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-ok)]" aria-hidden="true" />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-[var(--color-ok)]">Offer accepted</p>
                      <p className="text-xs leading-relaxed text-[var(--color-ink-2)]">
                        {confirmation?.message ??
                          "Your acceptance is recorded. The company has been notified."}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                    Recorded {formatDateTime(confirmation?.responded_at ?? data.responded_at)}. Keep
                    this page and the PDF for your records. The company will contact you about joining.
                  </p>
                  {data.pdf_available ? (
                    <Button variant="secondary" asChild>
                      <a href={api.public.pdf(token)} target="_blank" rel="noreferrer">
                        <Download size={14} strokeWidth={2} aria-hidden="true" />
                        Download the offer letter
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : rejected ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-bad)] bg-[var(--color-bad-soft)] px-3 py-3">
                    <XCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-bad)]" aria-hidden="true" />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-[var(--color-bad)]">Offer declined</p>
                      <p className="text-xs leading-relaxed text-[var(--color-ink-2)]">
                        {confirmation?.message ??
                          "Your response is recorded. The company has been notified."}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                    Recorded {formatDateTime(confirmation?.responded_at ?? data.responded_at)}. If
                    this was a mistake, contact the company directly; the link cannot be used again.
                  </p>
                </div>
              ) : unavailable ? (
                <div className="mt-4 flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                    The response window closed before a decision was recorded. Contact the company if
                    you would still like to discuss the offer.
                  </p>
                  {company.email ? (
                    <Button variant="secondary" asChild>
                      <a href={`mailto:${company.email}`}>
                        <Mail size={14} strokeWidth={2} aria-hidden="true" />
                        Contact {company.name}
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <form
                  className="mt-4 flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!consent) return;
                    setResponseError(null);
                    setConfirmOpen(true);
                  }}
                  noValidate
                >
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-xs font-semibold text-[var(--color-ink-2)]">
                      Choose one
                    </legend>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-3 transition-colors",
                        decision === "accept"
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-rule-2)] bg-[var(--color-sheet)] hover:bg-[var(--color-paper-2)]",
                      )}
                    >
                      <input
                        type="radio"
                        name="decision"
                        value="accept"
                        checked={decision === "accept"}
                        onChange={() => setDecision("accept")}
                        className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--color-ink)]">Accept this offer</span>
                        <span className="text-xs leading-relaxed text-[var(--color-muted)]">
                          Confirm the appointment on the terms shown here.
                        </span>
                      </span>
                    </label>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-3 transition-colors",
                        decision === "reject"
                          ? "border-[var(--color-bad)] bg-[var(--color-bad-soft)]"
                          : "border-[var(--color-rule-2)] bg-[var(--color-sheet)] hover:bg-[var(--color-paper-2)]",
                      )}
                    >
                      <input
                        type="radio"
                        name="decision"
                        value="reject"
                        checked={decision === "reject"}
                        onChange={() => setDecision("reject")}
                        className="mt-0.5 h-4 w-4 accent-[var(--color-bad)]"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--color-ink)]">Decline this offer</span>
                        <span className="text-xs leading-relaxed text-[var(--color-muted)]">
                          Record that you do not wish to proceed.
                        </span>
                      </span>
                    </label>
                  </fieldset>

                  {decision === "accept" ? (
                    <Field label="Your full name" htmlFor="typed-name" hint="Recorded with your acceptance.">
                      <Input
                        id="typed-name"
                        autoComplete="name"
                        value={typedName ?? data.candidate_name}
                        onChange={(event) => setTypedName(event.target.value)}
                      />
                    </Field>
                  ) : (
                    <Field label="Reason (optional)" htmlFor="reject-reason" hint="Shared with the company.">
                      <Textarea
                        id="reject-reason"
                        rows={3}
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="For example: accepted another offer."
                      />
                    </Field>
                  )}

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-ink-2)]">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span>
                      I have read and understood this offer. I understand my response is recorded
                      with a timestamp and is not a digital signature certificate.
                    </span>
                  </label>

                  {responseError ? (
                    <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
                      {responseError}
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    variant={decision === "accept" ? "primary" : "danger"}
                    size="lg"
                    disabled={!consent || mutation.isPending}
                    loading={mutation.isPending}
                  >
                    {decision === "accept" ? "Review acceptance" : "Review decline"}
                  </Button>
                  <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
                    Nothing is recorded until you confirm in the next step. This page is private to
                    the addressed candidate.
                  </p>
                </form>
              )}
            </section>

            <section className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4">
              <h2 className="font-display text-sm text-[var(--color-ink)]">Need help?</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
                Contact the company if a detail looks wrong or the link has expired. Do not forward
                this page; anyone with the link can see the offer.
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {company.email ? (
                  <a href={`mailto:${company.email}`} className="text-xs font-semibold text-[var(--color-cool-deep)] hover:underline">
                    {company.email}
                  </a>
                ) : null}
                {company.phone ? (
                  <a href={`tel:${company.phone.replace(/\s+/g, "")}`} className="mono text-xs text-[var(--color-ink-2)] hover:underline">
                    {company.phone}
                  </a>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </main>

      <footer className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-2 px-5 py-4 text-[10px] text-[var(--color-muted)] sm:px-8">
          <p>{company.name} · Candidate offer portal</p>
          <p className="mono">{data.reference} · private link</p>
        </div>
      </footer>

      <ActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={decision === "accept" ? "Record your acceptance?" : "Decline this offer?"}
        description={
          decision === "accept"
            ? `You are accepting the offer for ${data.position} at ${company.name}. Your response is recorded with a timestamp.`
            : `You are declining the offer for ${data.position}. This closes the offer; contact the company if this was a mistake.`
        }
        confirmLabel={decision === "accept" ? "Accept offer" : "Decline offer"}
        tone={decision === "accept" ? "primary" : "danger"}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      >
        <dl className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-3 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Reference</dt>
            <dd className="mono text-[var(--color-ink-2)]">{data.reference}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Position</dt>
            <dd className="text-[var(--color-ink-2)]">{data.position}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Annual CTC</dt>
            <dd className="mono text-[var(--color-ink-2)]">{formatINR(data.compensation.annual_ctc)}</dd>
          </div>
          {decision === "accept" && (typedName ?? data.candidate_name).trim() ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--color-muted)]">Recorded name</dt>
              <dd className="text-[var(--color-ink-2)]">{(typedName ?? data.candidate_name).trim()}</dd>
            </div>
          ) : null}
        </dl>
      </ActionDialog>
    </PublicShell>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 border-t border-[var(--color-rule)] pt-3">
      <span className="mt-0.5 text-[var(--color-muted)]">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <dt className="text-[10px] font-semibold text-[var(--color-muted)]">{label}</dt>
        <dd className="text-sm text-[var(--color-ink-2)]">{value}</dd>
      </div>
    </div>
  );
}

function TimelineStage({
  stage,
  title,
  period,
  amount,
  note,
  secondary,
}: {
  stage: string;
  title: string;
  period: string;
  amount: React.ReactNode;
  note: string;
  secondary?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3.5 py-3">
      <span className="mono text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent-deep)]">
        {stage}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[var(--color-ink)]">{title}</span>
        <span className="text-[10px] text-[var(--color-muted)]">{period}</span>
        <span className="figure mt-1 text-lg text-[var(--color-ink)]">{amount}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-ink-2)]">{note}</p>
      {secondary ? (
        <p className="text-[11px] font-medium text-[var(--color-muted)]">{secondary}</p>
      ) : null}
    </div>
  );
}

function PublicShell({
  companyName,
  children,
}: {
  companyName?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)]">
      {companyName ? (
        <div className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]">
          <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-2.5 px-5 sm:px-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="" width={30} height={30} className="h-[26px] w-[26px]" />
            <span className="font-display text-xs font-semibold text-[var(--color-ink)]">{companyName}</span>
          </div>
        </div>
      ) : null}
      <div className="flex-1">{children}</div>
    </div>
  );
}

function PublicSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)]" aria-busy="true">
      <div className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]">
        <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-3 px-5 sm:px-8">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-7 w-20" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-3 border-b border-[var(--color-rule)] pb-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </div>
  );
}
