import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  meta,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-[var(--color-rule)] pb-5", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] text-xs font-semibold text-[var(--color-muted)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-focus)]"
        >
          <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
          {backLabel ?? "Back"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-3xl text-[var(--color-ink)]">{title}</h1>
          {description ? (
            <p className="prose-copy max-w-[70ch] text-sm leading-relaxed text-[var(--color-muted)]">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  actions,
  id,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-display text-lg text-[var(--color-ink)]">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetaItem({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-xs text-[var(--color-muted)]">
      <span>{label}</span>
      <span className={cn("text-[var(--color-ink-2)]", mono && "mono")}>{children}</span>
    </span>
  );
}

export function DefinitionList({
  items,
  columns = 2,
  className,
}: {
  items: Array<{ term: string; detail: React.ReactNode }>;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-8 gap-y-5",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.term} className="flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
          <dt className="text-xs font-semibold text-[var(--color-ink-2)]">{item.term}</dt>
          <dd className="text-sm leading-relaxed text-[var(--color-ink)]">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
