"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  size = "md",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--color-scrim)]" />
      <DialogPrimitive.Content
        className={cn(
          "animate-rise fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--color-rule-2)] bg-[var(--color-sheet)] p-6 shadow-[var(--shadow-overlay)] focus:outline-none",
          {
            sm: "max-w-[420px]",
            md: "max-w-[560px]",
            lg: "max-w-[760px]",
            xl: "max-w-[980px]",
          }[size],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="tap-target absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          aria-label="Close dialog"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-5 flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-xl font-medium text-[var(--color-ink)]", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-relaxed text-[var(--color-muted)]", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-rule)] pt-4",
        className,
      )}
      {...props}
    />
  );
}
