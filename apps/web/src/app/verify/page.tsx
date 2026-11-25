"use client";

import { ShieldCheck } from "lucide-react";
import * as React from "react";

import {
  PdfIntegrityChecker,
  VerificationVerdictCard,
  VerifyChrome,
} from "@/components/verify-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import type { VerifyResult } from "@/lib/types";

export default function PublicVerifyPage() {
  const [offerId, setOfferId] = React.useState("");
  const [mode, setMode] = React.useState<"email" | "name_date">("email");
  const [candidateEmail, setCandidateEmail] = React.useState("");
  const [candidateName, setCandidateName] = React.useState("");
  const [joiningDate, setJoiningDate] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<VerifyResult | null>(null);

  async function submitLookup(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.verify.lookup({
        offer_id: offerId.trim(),
        candidate_email: mode === "email" ? candidateEmail.trim() || undefined : undefined,
        candidate_name: mode === "name_date" ? candidateName.trim() || undefined : undefined,
        joining_date: mode === "name_date" ? joiningDate || undefined : undefined,
      });
      setResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const canLookup =
    offerId.trim().length >= 3 &&
    (mode === "email"
      ? Boolean(candidateEmail.trim())
      : Boolean(candidateName.trim() && joiningDate));

  return (
    <VerifyChrome>
      <div className="flex flex-col gap-6">
        <div className="border-b border-[var(--color-rule)] pb-5">
          <p className="mono text-xs text-[var(--color-accent-deep)]">
            Official Issuance Registry
          </p>
          <h1 className="mt-1 font-display text-3xl text-[var(--color-ink)]">
            Verify an Official Offer Letter
          </h1>
          <p className="prose-copy mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
            Confirm whether an offer letter claiming to be issued by MR. ELECTRICAL WORKS is
            genuine, check its current status, or verify a digital PDF&apos;s SHA-256 integrity.
          </p>
        </div>

        <Tabs defaultValue="lookup">
          <TabsList aria-label="Verification methods">
            <TabsTrigger value="lookup">Verify by Offer ID</TabsTrigger>
            <TabsTrigger value="pdf">Verify digital PDF file</TabsTrigger>
          </TabsList>

          <TabsContent value="lookup">
            <form
              onSubmit={submitLookup}
              className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Enter Offer ID"
                  htmlFor="verify-offer-id"
                  required
                  hint="Printed on the top of the letter (e.g. MREW/OL/2026/000001)"
                >
                  <Input
                    id="verify-offer-id"
                    value={offerId}
                    onChange={(e) => setOfferId(e.target.value)}
                    placeholder="MREW/OL/2026/000001"
                    className="font-mono text-xs"
                  />
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-ink-2)]">
                    Second verification factor
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name="factor"
                        checked={mode === "email"}
                        onChange={() => setMode("email")}
                        className="accent-[var(--color-accent)]"
                      />
                      Candidate email
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name="factor"
                        checked={mode === "name_date"}
                        onChange={() => setMode("name_date")}
                        className="accent-[var(--color-accent)]"
                      />
                      Name &amp; joining date (if no email)
                    </label>
                  </div>
                </div>
              </div>

              {mode === "email" ? (
                <Field
                  label="Candidate registered email"
                  htmlFor="verify-email"
                  required
                  hint="Required to prevent unauthorized lookup of personal records."
                >
                  <Input
                    id="verify-email"
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="candidate@example.com"
                  />
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Candidate full name" htmlFor="verify-name" required>
                    <Input
                      id="verify-name"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="Exact name on the letter"
                    />
                  </Field>
                  <Field label="Joining date" htmlFor="verify-join" required>
                    <Input
                      id="verify-join"
                      type="date"
                      value={joiningDate}
                      onChange={(e) => setJoiningDate(e.target.value)}
                    />
                  </Field>
                </div>
              )}

              {error ? (
                <p className="text-sm text-[var(--color-bad)]" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-rule)] pt-4">
                <p className="text-xs text-[var(--color-muted)]">
                  Or scan the QR code printed on the offer letter directly.
                </p>
                <Button type="submit" variant="primary" disabled={!canLookup} loading={loading}>
                  <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
                  VERIFY OFFER LETTER
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="pdf">
            <PdfIntegrityChecker onResult={setResult} />
          </TabsContent>
        </Tabs>

        {result ? <VerificationVerdictCard result={result} /> : null}
      </div>
    </VerifyChrome>
  );
}
