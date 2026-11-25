"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FilePlus2,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader, SectionHeading } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/pagination";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type {
  EmploymentType,
  GeneratorOfferPayload,
  OfferIssueResult,
} from "@/lib/types";

export default function OfferGeneratorPage() {
  const { canApprove, canManageOffers } = useSession();
  const queryClient = useQueryClient();

  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: api.company.get,
  });
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.list,
  });

  if (companyQuery.isPending || templatesQuery.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="skeleton h-20 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <PanelSkeleton lines={10} />
          <PanelSkeleton lines={10} />
        </div>
      </div>
    );
  }

  if (companyQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(companyQuery.error)}
        onRetry={() => companyQuery.refetch()}
      />
    );
  }

  const company = companyQuery.data;
  const templates = templatesQuery.data?.filter((t) => t.is_active) ?? [];
  const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0];
  const genConfig = (company.generator_config ?? {}) as Record<string, unknown>;

  return (
    <GeneratorWorkspace
      companyName={company.name}
      defaultWorkLocation={company.default_work_location ?? "Patancheru, Hyderabad"}
      defaultManager={company.signatory_name ?? ""}
      defaultProbation={company.default_probation_months}
      defaultValidity={company.default_validity_days}
      defaultResponsibilities={
        typeof genConfig.default_responsibilities === "string"
          ? genConfig.default_responsibilities
          : ""
      }
      requireEmail={Boolean(genConfig.require_email)}
      requirePhone={Boolean(genConfig.require_phone)}
      requireDepartment={Boolean(genConfig.require_department)}
      templates={templates}
      defaultTemplateId={defaultTemplate?.id ?? ""}
      canApprove={canApprove}
      canManageOffers={canManageOffers}
      onCreated={() => {
        queryClient.invalidateQueries({ queryKey: ["offers"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["candidates"] });
      }}
    />
  );
}

function GeneratorWorkspace({
  companyName,
  defaultWorkLocation,
  defaultManager,
  defaultProbation,
  defaultValidity,
  defaultResponsibilities,
  requireEmail,
  requirePhone,
  requireDepartment,
  templates,
  defaultTemplateId,
  canApprove,
  canManageOffers,
  onCreated,
}: {
  companyName: string;
  defaultWorkLocation: string;
  defaultManager: string;
  defaultProbation: number;
  defaultValidity: number;
  defaultResponsibilities: string;
  requireEmail: boolean;
  requirePhone: boolean;
  requireDepartment: boolean;
  templates: Array<{ id: string; name: string; is_default: boolean }>;
  defaultTemplateId: string;
  canApprove: boolean;
  canManageOffers: boolean;
  onCreated: () => void;
}) {
  const defaultJoining = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [candidateCode, setCandidateCode] = React.useState("");

  const [jobTitle, setJobTitle] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [employmentType, setEmploymentType] = React.useState<EmploymentType>("FULL_TIME");
  const [joiningDate, setJoiningDate] = React.useState(defaultJoining);
  const [workLocation, setWorkLocation] = React.useState(defaultWorkLocation);
  const [reportingManager, setReportingManager] = React.useState(defaultManager);
  const [employmentDuration, setEmploymentDuration] = React.useState("");
  const [probationMonths, setProbationMonths] = React.useState(String(defaultProbation));

  const [annualCtc, setAnnualCtc] = React.useState("");
  const [monthlySalary, setMonthlySalary] = React.useState("");
  const [stipend, setStipend] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");

  const [validityDays, setValidityDays] = React.useState(String(defaultValidity));
  const [responsibilities, setResponsibilities] = React.useState(defaultResponsibilities);
  const [employmentTerms, setEmploymentTerms] = React.useState("");
  const [additionalInstructions, setAdditionalInstructions] = React.useState("");
  const [templateId, setTemplateId] = React.useState(defaultTemplateId);

  const [mobileView, setMobileView] = React.useState<"form" | "preview">("form");
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [issuedResult, setIssuedResult] = React.useState<OfferIssueResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  function buildPayload(issueImmediately: boolean): GeneratorOfferPayload {
    return {
      candidate_code: candidateCode.trim() || null,
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      job_title: jobTitle.trim(),
      department: department.trim() || null,
      employment_type: employmentType,
      joining_date: joiningDate,
      work_location: workLocation.trim() || null,
      reporting_manager: reportingManager.trim() || null,
      employment_duration: employmentDuration.trim() || null,
      probation_months: probationMonths === "" ? null : Number(probationMonths),
      annual_ctc: annualCtc ? Number(annualCtc) : null,
      monthly_salary: monthlySalary ? Number(monthlySalary) : null,
      stipend: stipend ? Number(stipend) : null,
      allowances: [],
      payment_terms: paymentTerms.trim() || null,
      validity_days: validityDays ? Number(validityDays) : defaultValidity,
      responsibilities: responsibilities.trim() || null,
      employment_terms: employmentTerms.trim() || null,
      additional_instructions: additionalInstructions.trim() || null,
      template_id: templateId || null,
      issue_immediately: issueImmediately,
    };
  }

  const previewMutation = useMutation({
    mutationFn: () => api.generator.preview(buildPayload(false)),
    onSuccess: (res) => {
      setPreviewHtml(res.html);
      setError(null);
      setMobileView("preview");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const generateMutation = useMutation({
    mutationFn: (issueImmediately: boolean) =>
      api.generator.create(buildPayload(issueImmediately)),
    onSuccess: (res, issueImmediately) => {
      setIssuedResult(res);
      setError(null);
      onCreated();
      if (issueImmediately) {
        toast.success(
          `Issued ${res.official_offer_number ?? res.offer.offer_number} with QR code and SHA-256 hash.`,
        );
      } else {
        toast.success(`Draft ${res.offer.offer_number} saved.`);
      }
      setMobileView("preview");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const canSubmitForm =
    fullName.trim().length >= 2 &&
    jobTitle.trim().length >= 2 &&
    Boolean(joiningDate) &&
    (!requireEmail || Boolean(email.trim())) &&
    (!requirePhone || Boolean(phone.trim())) &&
    (!requireDepartment || Boolean(department.trim()));

  function handlePrint() {
    if (issuedResult) {
      const pdfWin = window.open(`${api.offers.pdf(issuedResult.offer.id)}`, "_blank", "noopener");
      if (pdfWin) {
        pdfWin.addEventListener("load", () => {
          try {
            pdfWin.print();
          } catch {
            // Browser PDF viewer handles print shortcut
          }
        });
      }
      return;
    }
    iframeRef.current?.contentWindow?.print();
  }

  function resetForNext() {
    setFullName("");
    setEmail("");
    setPhone("");
    setCandidateCode("");
    setJobTitle("");
    setDepartment("");
    setAnnualCtc("");
    setMonthlySalary("");
    setStipend("");
    setAdditionalInstructions("");
    setEmploymentTerms("");
    setIssuedResult(null);
    setPreviewHtml(null);
    setError(null);
    setMobileView("form");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offer letter generator"
        description={`Company details, approved clauses, and authorised signatory for ${companyName} are applied automatically. Enter only candidate-specific details below.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobileView(mobileView === "form" ? "preview" : "form")}
            >
              <Eye size={14} strokeWidth={2} aria-hidden="true" />
              {mobileView === "form" ? "Show preview" : "Back to form"}
            </Button>
            {issuedResult ? (
              <Button variant="secondary" onClick={resetForNext}>
                <FilePlus2 size={14} strokeWidth={2} aria-hidden="true" />
                Generate another
              </Button>
            ) : null}
          </div>
        }
      />

      {issuedResult ? (
        <section
          role="status"
          className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-ok)] bg-[var(--color-sheet)] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2
                  size={17}
                  strokeWidth={2}
                  className="text-[var(--color-ok)]"
                  aria-hidden="true"
                />
                <span className="font-display text-lg text-[var(--color-ink)]">
                  {issuedResult.official_offer_number
                    ? `Official Offer Issued: ${issuedResult.official_offer_number}`
                    : `Draft Saved: ${issuedResult.offer.offer_number}`}
                </span>
                <StatusBadge status={issuedResult.offer.status} />
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                {issuedResult.message}
              </p>
              {issuedResult.pdf_sha256 ? (
                <p className="mono text-[11px] text-[var(--color-ink-2)]">
                  SHA-256: {issuedResult.pdf_sha256}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" asChild>
                <a
                  href={`${api.offers.pdf(issuedResult.offer.id)}?download=true`}
                  download
                >
                  <Download size={14} strokeWidth={2} aria-hidden="true" />
                  Download PDF
                </a>
              </Button>
              <Button variant="secondary" size="sm" onClick={handlePrint}>
                <Printer size={14} strokeWidth={2} aria-hidden="true" />
                Print letter
              </Button>
              {issuedResult.verification_url ? (
                <>
                  <CopyButton
                    value={issuedResult.verification_url}
                    label="Copy verify link"
                  />
                  <Button variant="primary" size="sm" asChild>
                    <a href={issuedResult.verification_url} target="_blank" rel="noreferrer">
                      <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
                      Verify page
                      <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" asChild>
                  <Link href={`/offers/${issuedResult.offer.id}`}>Open offer record</Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <form
          onSubmit={(e) => e.preventDefault()}
          className={
            mobileView === "preview"
              ? "hidden flex-col gap-5 lg:flex"
              : "flex flex-col gap-5"
          }
          noValidate
        >
          <section className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5">
            <SectionHeading title="1. Candidate details" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="gen-name" required>
                <Input
                  id="gen-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </Field>
              <Field
                label="Candidate ID"
                htmlFor="gen-code"
                hint="Auto-generated if left blank"
              >
                <Input
                  id="gen-code"
                  value={candidateCode}
                  onChange={(e) => setCandidateCode(e.target.value)}
                  placeholder="Optional"
                  className="font-mono text-xs"
                />
              </Field>
              <Field
                label="Email address"
                htmlFor="gen-email"
                required={requireEmail}
                hint="Used as second factor for manual verification"
              >
                <Input
                  id="gen-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Mobile number" htmlFor="gen-phone" required={requirePhone}>
                <Input
                  id="gen-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5">
            <SectionHeading title="2. Employment details" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Designation / Job role" htmlFor="gen-role" required>
                <Input
                  id="gen-role"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Electrical Technician"
                />
              </Field>
              <Field label="Department" htmlFor="gen-dept" required={requireDepartment}>
                <Input
                  id="gen-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Projects (optional)"
                />
              </Field>
              <Field label="Employment type" htmlFor="gen-type" required>
                <Select
                  id="gen-type"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                >
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="TEMPORARY">Temporary</option>
                  <option value="INTERNSHIP">Internship</option>
                </Select>
              </Field>
              <Field label="Joining date" htmlFor="gen-join" required>
                <Input
                  id="gen-join"
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                />
              </Field>
              <Field label="Work location" htmlFor="gen-loc">
                <Input
                  id="gen-loc"
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value)}
                />
              </Field>
              <Field label="Reporting manager" htmlFor="gen-mgr">
                <Input
                  id="gen-mgr"
                  value={reportingManager}
                  onChange={(e) => setReportingManager(e.target.value)}
                />
              </Field>
              <Field label="Employment duration" htmlFor="gen-dur" hint="Optional (e.g. 6 months)">
                <Input
                  id="gen-dur"
                  value={employmentDuration}
                  onChange={(e) => setEmploymentDuration(e.target.value)}
                  placeholder="Leave blank if permanent"
                />
              </Field>
              <Field label="Probation period (months)" htmlFor="gen-prob">
                <Input
                  id="gen-prob"
                  type="number"
                  min={0}
                  max={12}
                  value={probationMonths}
                  onChange={(e) => setProbationMonths(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5">
            <SectionHeading
              title="3. Compensation"
              description="Leave optional fields blank if not applicable; the generator never invents salary figures."
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Annual CTC (INR)" htmlFor="gen-ctc">
                <Input
                  id="gen-ctc"
                  type="number"
                  min={0}
                  value={annualCtc}
                  onChange={(e) => setAnnualCtc(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Monthly salary (INR)" htmlFor="gen-monthly">
                <Input
                  id="gen-monthly"
                  type="number"
                  min={0}
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Monthly stipend (INR)" htmlFor="gen-stipend">
                <Input
                  id="gen-stipend"
                  type="number"
                  min={0}
                  value={stipend}
                  onChange={(e) => setStipend(e.target.value)}
                  placeholder="If internship / trainee"
                />
              </Field>
              <Field label="Salary payment terms" htmlFor="gen-pay-terms">
                <Input
                  id="gen-pay-terms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="e.g. Paid on 5th of each month"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5">
            <SectionHeading title="4. Offer validity & clauses" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Offer template" htmlFor="gen-tpl">
                <Select
                  id="gen-tpl"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      {tpl.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Offer validity (days)" htmlFor="gen-valid">
                <Input
                  id="gen-valid"
                  type="number"
                  min={1}
                  max={90}
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                />
              </Field>
              <Field
                label="Role responsibilities (optional)"
                htmlFor="gen-resp"
                className="sm:col-span-2"
              >
                <Textarea
                  id="gen-resp"
                  rows={2}
                  value={responsibilities}
                  onChange={(e) => setResponsibilities(e.target.value)}
                  placeholder="Optional responsibilities summary"
                />
              </Field>
              <Field
                label="Custom employment terms / note (optional)"
                htmlFor="gen-terms"
                className="sm:col-span-2"
              >
                <Textarea
                  id="gen-terms"
                  rows={2}
                  value={employmentTerms}
                  onChange={(e) => setEmploymentTerms(e.target.value)}
                  placeholder="Company-approved standard clauses are already included automatically"
                />
              </Field>
              <Field
                label="Additional joining instructions (optional)"
                htmlFor="gen-inst"
                className="sm:col-span-2"
              >
                <Textarea
                  id="gen-inst"
                  rows={2}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Optional site reporting or document notes"
                />
              </Field>
            </div>
          </section>

          {error ? (
            <p className="text-sm text-[var(--color-bad)]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-rule)] pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={!canSubmitForm}
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              <Eye size={14} strokeWidth={2} aria-hidden="true" />
              Preview letter
            </Button>
            {canManageOffers ? (
              <Button
                type="button"
                variant="secondary"
                disabled={!canSubmitForm}
                loading={
                  generateMutation.isPending && generateMutation.variables === false
                }
                onClick={() => generateMutation.mutate(false)}
              >
                Save as draft
              </Button>
            ) : null}
            {canApprove ? (
              <Button
                type="button"
                variant="primary"
                disabled={!canSubmitForm}
                loading={
                  generateMutation.isPending && generateMutation.variables === true
                }
                onClick={() => generateMutation.mutate(true)}
              >
                <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
                Approve &amp; issue offer
              </Button>
            ) : null}
          </div>
        </form>

        <section
          aria-labelledby="gen-preview-heading"
          className={
            mobileView === "form"
              ? "hidden flex-col gap-3 lg:sticky lg:top-[84px] lg:flex lg:self-start"
              : "flex flex-col gap-3"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="gen-preview-heading"
                className="font-display text-lg text-[var(--color-ink)]"
              >
                {issuedResult ? "Official issued document" : "Live offer preview"}
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                {issuedResult?.official_offer_number
                  ? `${issuedResult.official_offer_number} · embedded QR & SHA-256 hash stored`
                  : "Click Preview letter to render with company letterhead and clauses."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!issuedResult ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canSubmitForm}
                  loading={previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
                  Refresh
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="sm" asChild>
                    <a
                      href={`${api.offers.pdf(issuedResult.offer.id)}?download=true`}
                      download
                    >
                      <Download size={13} strokeWidth={2} aria-hidden="true" />
                      Download PDF
                    </a>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handlePrint}>
                    <Printer size={13} strokeWidth={2} aria-hidden="true" />
                    Print
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-rule-2)] bg-white shadow-[var(--shadow-panel)]">
            {issuedResult ? (
              <iframe
                ref={iframeRef}
                title="Issued offer letter preview"
                src={api.offers.pdf(issuedResult.offer.id)}
                className="h-[780px] w-full bg-white"
              />
            ) : previewHtml ? (
              <iframe
                ref={iframeRef}
                title="Draft offer letter preview"
                srcDoc={previewHtml}
                sandbox=""
                className="h-[780px] w-full bg-white"
              />
            ) : (
              <div className="flex h-[520px] flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="font-display text-lg text-[var(--color-ink)]">
                  Enter candidate details to preview
                </p>
                <p className="max-w-[38ch] text-xs leading-relaxed text-[var(--color-muted)]">
                  Fill in the candidate&apos;s name, designation, and joining date, then click
                  Preview letter or Approve &amp; issue offer.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
