"use client";

import * as React from "react";
import Link from "next/link";

import { OfferBuilder } from "@/components/offer-builder";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RestrictedState } from "@/components/ui/states";
import { useSession } from "@/lib/auth";

export default function NewOfferPage() {
  return (
    <React.Suspense fallback={<BuilderFallback />}>
      <NewOfferContent />
    </React.Suspense>
  );
}

function NewOfferContent() {
  const { canManageOffers } = useSession();

  if (!canManageOffers) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="New offer"
          description="Offer drafts are written by HR managers and super admins."
          backHref="/offers"
          backLabel="Back to offers"
        />
        <RestrictedState
          title="Drafting needs HR access"
          message="Your role can review offers and decisions, but only an HR manager or super admin can create a draft. Ask an administrator if you need this access."
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/offers">Open the offer register</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <OfferBuilder />;
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
