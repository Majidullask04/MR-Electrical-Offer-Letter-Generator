"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { OfferBuilder } from "@/components/offer-builder";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, RestrictedState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";

const EDITABLE = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED"]);

export default function EditOfferPage() {
  return (
    <React.Suspense fallback={<BuilderFallback />}>
      <EditOfferContent />
    </React.Suspense>
  );
}

function EditOfferContent() {
  const params = useParams();
  const offerId = typeof params.id === "string" ? params.id : (params.id?.[0] ?? "");
  const { canManageOffers } = useSession();

  const query = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => api.offers.get(offerId),
    enabled: Boolean(offerId) && canManageOffers,
    retry: false,
  });

  if (!canManageOffers) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Edit offer"
          description="Offer drafts are edited by HR managers and super admins."
          backHref={`/offers/${offerId}`}
          backLabel="Back to offer"
        />
        <RestrictedState
          title="Editing needs HR access"
          message="Your role can review offers and decisions, but only an HR manager or super admin can change a draft. Ask an administrator if you need this access."
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/offers/${offerId}`}>Open the offer record</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (query.isPending) return <BuilderFallback />;

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Edit offer"
          description="The draft could not be loaded."
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

  const offer = query.data;

  if (!EDITABLE.has(offer.status)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Edit offer"
          description={`${offer.offer_number} is not in an editable state.`}
          backHref={`/offers/${offer.id}`}
          backLabel="Back to offer"
        />
        <RestrictedState
          title="Issued records are immutable"
          message={`This offer is ${offer.status.replaceAll("_", " ").toLowerCase()}. Issued revisions are preserved for the audit trail, so they are never edited in place. Start a revision from the offer record, or create a new offer for a different appointment.`}
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/offers/${offer.id}`}>Open the offer record</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <OfferBuilder offer={offer} />;
}

function BuilderFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 border-b border-[var(--color-rule)] pb-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full max-w-[560px]" />
      </div>
      <Skeleton className="h-[62px] w-full" />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
