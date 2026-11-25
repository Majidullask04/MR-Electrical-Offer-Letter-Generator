"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "scroll-x flex w-full items-end gap-1 overflow-x-auto border-b border-[var(--color-rule)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "tap-target relative -mb-px inline-flex h-10 shrink-0 items-center gap-2 rounded-t-[var(--radius-control)] border-b-2 border-transparent px-3 text-sm font-medium text-[var(--color-muted)] transition-[color,border-color,background-color] duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)] data-[state=active]:border-[var(--color-accent)] data-[state=active]:text-[var(--color-ink)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("pt-6 focus-visible:outline-2 focus-visible:outline-offset-4", className)}
      {...props}
    />
  );
}
