"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import {
  PdfIntegrityChecker,
  VerificationVerdictCard,
  VerifyChrome,
} from "@/components/verify-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import type { VerifyResult } from "@/lib/types";

export default function VerifyTokenPage() {
  return (
    <React.Suspense
      fallback={
        <VerifyChrome>
          <Skeleton className="h-56 w-full rounded-[10px]" />
        </VerifyChrome>
      }
    >
      <VerifyTokenContent />
    </React.Suspense>
  );
}

function VerifyTokenContent() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : (params.token?.[0] ?? "");

  const query = useQuery({
    queryKey: ["verify-token", token],
    queryFn: () => api.verify.byToken(token),
    enabled: Boolean(token),
    retry: false,
  });

  const [pdfResult, setPdfResult] = React.useState<VerifyResult | null>(null);
  const displayedResult = pdfResult ?? query.data ?? null;

  return (
    <VerifyChrome>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-rule)] pb-5">
          <div>
            <p className="mono text-xs text-[var(--color-accent-deep)]">
              QR Authenticity Verification
            </p>
            <h1 className="mt-1 font-display text-3xl text-[var(--color-ink)]">
              Offer Letter Verification Record
            </h1>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/verify">Manual lookup</Link>
          </Button>
        </div>

        {query.isPending ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-44 w-full rounded-[10px]" />
            <Skeleton className="h-32 w-full rounded-[10px]" />
          </div>
        ) : query.isError ? (
          <ErrorState
            title="Verification check failed"
            message={errorMessage(query.error)}
            onRetry={() => query.refetch()}
          />
        ) : displayedResult ? (
          <>
            <VerificationVerdictCard result={displayedResult} />
            <PdfIntegrityChecker
              token={token}
              defaultOfferId={displayedResult.record?.offer_id}
              onResult={setPdfResult}
            />
          </>
        ) : null}
      </div>
    </VerifyChrome>
  );
}
