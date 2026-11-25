import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "tap-target inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] border text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,opacity] duration-[var(--dur-micro)] ease-[var(--ease-out)] active:translate-y-[0.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:border-[var(--color-accent-hover)] hover:bg-[var(--color-accent-hover)]",
        secondary:
          "border-[var(--color-rule-2)] bg-[var(--color-sheet)] text-[var(--color-ink)] hover:border-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]",
        ghost:
          "border-transparent bg-transparent text-[var(--color-ink-2)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]",
        quiet:
          "border-transparent bg-transparent text-[var(--color-cool-deep)] hover:bg-[var(--color-cool-soft)]",
        danger:
          "border-[var(--color-bad)] bg-[var(--color-bad)] text-white hover:border-[var(--color-bad-hover)] hover:bg-[var(--color-bad-hover)]",
        "danger-outline":
          "border-[var(--color-rule-2)] bg-[var(--color-sheet)] text-[var(--color-bad)] hover:border-[var(--color-bad)] hover:bg-[var(--color-bad-soft)]",
      },
      size: {
        sm: "h-8 min-h-8 px-2.5 text-xs",
        md: "h-9 px-3.5",
        lg: "h-10 px-4",
        icon: "h-9 w-9 px-0",
        "icon-sm": "h-8 w-8 px-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size }), className)}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
