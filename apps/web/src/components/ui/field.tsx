import * as React from "react";

import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-[var(--radius-control)] border border-[var(--color-rule-2)] bg-[var(--color-sheet)] px-3 text-[16px] text-[var(--color-ink)] placeholder:text-[var(--color-faint)] transition-[border-color,background-color] duration-[var(--dur-micro)] ease-[var(--ease-out)] hover:border-[var(--color-ink-2)] focus-visible:border-[var(--color-focus)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-55 sm:text-sm";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(fieldBase, "h-9", className)}
      aria-invalid={props["aria-invalid"]}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(fieldBase, "min-h-24 py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      "h-9 cursor-pointer appearance-none bg-[length:14px_14px] bg-[right_10px_center] bg-no-repeat pr-9",
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235c6470' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      ...props.style,
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  children,
  htmlFor,
  required,
}: {
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-xs font-semibold text-[var(--color-ink-2)]", className)}
    >
      {children}
      {required ? <span className="ml-0.5 text-[var(--color-accent)]">*</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  return (
    <p className="min-h-[1lh] text-xs leading-[1.4] text-[var(--color-bad)]" role="alert">
      {children ?? "\u00a0"}
    </p>
  );
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  return (
    <p className="min-h-[1lh] text-xs leading-[1.4] text-[var(--color-muted)]">
      {children ?? "\u00a0"}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      <div className="min-h-[1lh] text-xs leading-[1.4]">
        {error ? (
          <p className="text-[var(--color-bad)]" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p className="text-[var(--color-muted)]">{hint}</p>
        ) : (
          <p aria-hidden="true">&nbsp;</p>
        )}
      </div>
    </div>
  );
}
