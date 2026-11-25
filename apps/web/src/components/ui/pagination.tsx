"use client";

import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] px-1 py-3",
        className,
      )}
    >
      <p className="text-xs text-[var(--color-muted)]">
        <span className="mono text-[var(--color-ink-2)]">
          {formatNumber(from)} to {formatNumber(to)}
        </span>{" "}
        of <span className="mono text-[var(--color-ink-2)]">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
          Previous
        </Button>
        <span className="mono px-1 text-xs text-[var(--color-muted)]">
          {page} / {Math.max(pages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy link",
  className,
  variant = "secondary",
  size = "sm",
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: "secondary" | "ghost" | "primary";
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to the clipboard.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Your browser blocked the clipboard. Select the link and copy it manually.");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      className={className}
      aria-live="polite"
    >
      {copied ? (
        <Check size={14} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Copy size={14} strokeWidth={2} aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
