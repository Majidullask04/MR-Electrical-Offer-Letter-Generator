"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, errorMessage } from "@/lib/api";
import { formatDateLong, formatDateTime } from "@/lib/format";
import type { VerifyResult } from "@/lib/types";

export function VerificationVerdictCard({ result }: { result: VerifyResult }) {
  const tone =
    result.verdict === "VALID"
      ? {
          border: "border-l-[var(--color-ok)]",
          bg: "bg-[var(--color-ok-soft)]",
          icon: <CheckCircle2 size={20} strokeWidth={2} className="text-[var(--color-ok)]" aria-hidden="true" />,
          badge: "VALID",
        }
      : result.verdict === "MODIFIED_DOCUMENT" || result.verdict === "REVOKED" || result.verdict === "INVALID"
        ? {
            border: "border-l-[var(--color-bad)]",
            bg: "bg-[var(--color-bad-soft)]",
            icon:
              result.verdict === "MODIFIED_DOCUMENT" ? (
                <FileWarning size={20} strokeWidth={2} className="text-[var(--color-bad)]" aria-hidden="true" />
              ) : (
                <XCircle size={20} strokeWidth={2} className="text-[var(--color-bad)]" aria-hidden="true" />
              ),
            badge: result.verdict.replaceAll("_", " "),
          }
        : {
            border: "border-l-[var(--color-warn)]",
            bg: "bg-[var(--color-warn-soft)]",
            icon: <AlertTriangle size={20} strokeWidth={2} className="text-[var(--color-warn)]" aria-hidden="true" />,
            badge: result.verdict,
          };

  return (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-rule-2)] bg-[var(--color-sheet)] shadow-[var(--shadow-panel)]"
    >
      <div className={`border-b border-[var(--color-rule)] border-l-[4px] ${tone.border} ${tone.bg} px-5 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">{tone.icon}</span>
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl text-[var(--color-ink)]">{result.headline}</h2>
              <p className="text-xs font-semibold text-[var(--color-ink-2)]">
                Verification verdict: {tone.badge}
              </p>
              <p className="prose-copy text-sm leading-relaxed text-[var(--color-ink-2)]">
                {result.message}
              </p>
            </div>
          </div>
        </div>
      </div>

      {result.record ? (
        <div className="p-5">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <RecordField label="Issuing company" value={result.record.company_name} />
            <RecordField label="Official Offer ID" value={result.record.offer_id} mono />
            <RecordField label="Candidate name" value={result.record.candidate_name} />
            <RecordField
              label="Designation"
              value={
                result.record.department
                  ? `${result.record.designation} · ${result.record.department}`
                  : result.record.designation
              }
            />
            <RecordField
              label="Issue date"
              value={formatDateLong(result.record.issue_date)}
            />
            <RecordField
              label="Joining date"
              value={formatDateLong(result.record.joining_date)}
            />
            <div className="flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
              <dt className="text-xs text-[var(--color-muted)]">Lifecycle status</dt>
              <dd className="mt-0.5">
                <StatusBadge status={result.record.lifecycle_status} />
              </dd>
            </div>
            <RecordField
              label="Verification timestamp"
              value={formatDateTime(result.record.verified_at)}
            />
            <RecordField
              label="Revision"
              value={`Revision ${result.record.revision_number}`}
            />
          </dl>

          {result.record.revoked_reason ? (
            <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2 text-xs text-[var(--color-ink-2)]">
              Revocation reason: {result.record.revoked_reason}
            </p>
          ) : null}
        </div>
      ) : null}

      {result.pdf_integrity !== "NOT_CHECKED" ? (
        <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper-2)] px-5 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {result.pdf_integrity === "MATCHED" ? (
              <FileCheck2 size={14} strokeWidth={2} className="text-[var(--color-ok)]" aria-hidden="true" />
            ) : (
              <ShieldAlert size={14} strokeWidth={2} className="text-[var(--color-bad)]" aria-hidden="true" />
            )}
            <span className="font-semibold text-[var(--color-ink)]">
              PDF Integrity: {result.pdf_integrity}
            </span>
          </div>
          {result.uploaded_sha256 ? (
            <p className="mono mt-1 break-all text-[10px] text-[var(--color-muted)]">
              Uploaded SHA-256: {result.uploaded_sha256}
            </p>
          ) : null}
          {result.official_sha256 ? (
            <p className="mono mt-0.5 break-all text-[10px] text-[var(--color-muted)]">
              Official SHA-256: {result.official_sha256}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RecordField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
      <dt className="text-xs text-[var(--color-muted)]">{label}</dt>
      <dd className={mono ? "mono text-sm font-semibold text-[var(--color-ink)]" : "text-sm font-semibold text-[var(--color-ink)]"}>
        {value}
      </dd>
    </div>
  );
}

export function PdfIntegrityChecker({
  token,
  defaultOfferId,
  onResult,
}: {
  token?: string;
  defaultOfferId?: string;
  onResult: (result: VerifyResult) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [offerId, setOfferId] = React.useState(defaultOfferId ?? "");
  const [candidateEmail, setCandidateEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submitPdf(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (token) fd.append("token", token);
      if (offerId.trim()) fd.append("offer_id", offerId.trim());
      if (candidateEmail.trim()) fd.append("candidate_email", candidateEmail.trim());
      const res = await api.verify.pdf(fd);
      onResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submitPdf}
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={2} className="text-[var(--color-accent-deep)]" aria-hidden="true" />
          <h3 className="font-display text-md text-[var(--color-ink)]">
            Digital PDF SHA-256 integrity check
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-muted)]">
          Upload the original digital PDF downloaded from OfferLater to verify it has not been
          altered byte-for-byte. Printed or rescanned copies do not retain the original file hash
          and should be checked via QR verification.
        </p>
      </div>

      {!token ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Offer ID (optional)" htmlFor="pdf-offer-id" hint="e.g. MREW/OL/2026/000001">
            <Input
              id="pdf-offer-id"
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              placeholder="MREW/OL/2026/000001"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Registered email (optional)" htmlFor="pdf-email">
            <Input
              id="pdf-email"
              type="email"
              value={candidateEmail}
              onChange={(e) => setCandidateEmail(e.target.value)}
              placeholder="Shows official record if modified"
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Upload offer PDF file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-[var(--color-ink-2)] file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-[var(--color-rule-2)] file:bg-[var(--color-paper-2)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-ink)]"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!file} loading={loading}>
          <Upload size={13} strokeWidth={2} aria-hidden="true" />
          Check PDF integrity
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-[var(--color-bad)]" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function VerifyChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)]">
      <header className="border-b border-[var(--color-rule)] bg-[var(--color-sheet)]">
        <div className="mx-auto flex min-h-16 w-full max-w-[1040px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt="MR. ELECTRICAL WORKS logo"
              className="h-9 w-9 shrink-0 object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
                MR. ELECTRICAL WORKS
              </span>
              <span className="text-[11px] text-[var(--color-muted)]">
                OfferLater · Official Document Verification
              </span>
            </div>
          </div>
          <span className="mono text-[10px] text-[var(--color-muted)]">
            knightsky.in · Patancheru
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-[var(--color-rule)] bg-[var(--color-paper)]">
        <div className="mx-auto flex w-full max-w-[1040px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-[var(--color-muted)] sm:px-6">
          <p>MR. ELECTRICAL WORKS · Turnkey Electrical Engineering &amp; Contracting</p>
          <p className="mono text-[10px]">
            Public verification does not expose salary or private contact records.
          </p>
        </div>
      </footer>
    </div>
  );
}
