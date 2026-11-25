"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { TrainingIncrementPolicy } from "@/lib/types";

const schema = z
  .object({
    enabled: z.boolean(),
    training_period_months: z.coerce
      .number({ error: "Enter a training period." })
      .int("Use whole months.")
      .min(1, "At least one month.")
      .max(24, "No more than 24 months."),
    training_monthly_salary_inr: z.coerce
      .number({ error: "Enter a training salary." })
      .min(0, "Cannot be negative.")
      .max(100_000_000),
    food_provided: z.boolean(),
    site_accommodation_free: z.boolean(),
    post_training_salary_min_inr: z.coerce
      .number({ error: "Enter a minimum salary." })
      .min(0, "Cannot be negative.")
      .max(100_000_000),
    post_training_salary_max_inr: z.coerce
      .number({ error: "Enter a maximum salary." })
      .min(0, "Cannot be negative.")
      .max(100_000_000),
    post_training_duration_months: z.coerce
      .number({ error: "Enter a duration." })
      .int("Use whole months.")
      .min(1, "At least one month.")
      .max(60, "No more than 60 months."),
    first_increment_after_months: z.coerce
      .number({ error: "Enter a window." })
      .int("Use whole months.")
      .min(1, "At least one month.")
      .max(60, "No more than 60 months."),
    first_increment_max_percent: z.coerce
      .number({ error: "Enter an increment." })
      .min(0, "Cannot be negative.")
      .max(100, "No more than 100%."),
    increment_criteria: z.string().trim().min(2, "Describe the criteria.").max(200),
  })
  .refine((policy) => policy.post_training_salary_min_inr <= policy.post_training_salary_max_inr, {
    message: "Minimum post-training salary cannot exceed the maximum.",
    path: ["post_training_salary_max_inr"],
  });

type Values = z.infer<typeof schema>;

const DEFAULTS: Values = {
  enabled: true,
  training_period_months: 1,
  training_monthly_salary_inr: 14000,
  food_provided: false,
  site_accommodation_free: true,
  post_training_salary_min_inr: 18000,
  post_training_salary_max_inr: 25000,
  post_training_duration_months: 6,
  first_increment_after_months: 6,
  first_increment_max_percent: 30,
  increment_criteria: "Behaviour and performance",
};

function policyToValues(policy: TrainingIncrementPolicy | null | undefined): Values {
  if (!policy) return { ...DEFAULTS };
  return {
    enabled: policy.enabled,
    training_period_months: policy.training_period_months,
    training_monthly_salary_inr: policy.training_monthly_salary_inr,
    food_provided: policy.food_provided,
    site_accommodation_free: policy.site_accommodation_free,
    post_training_salary_min_inr: policy.post_training_salary_min_inr,
    post_training_salary_max_inr: policy.post_training_salary_max_inr,
    post_training_duration_months: policy.post_training_duration_months,
    first_increment_after_months: policy.first_increment_after_months,
    first_increment_max_percent: policy.first_increment_max_percent,
    increment_criteria: policy.increment_criteria,
  };
}

export function TrainingPolicySettings({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["company"], queryFn: api.company.get });

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  React.useEffect(() => {
    if (query.data) {
      form.reset(policyToValues(query.data.default_training_policy));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (values: Values) => api.company.updateTrainingPolicy(values),
    onSuccess: (company) => {
      queryClient.setQueryData(["company"], company);
      form.reset(policyToValues(company.default_training_policy));
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Training & increment policy saved. New drafts use these defaults.");
    },
    onError: (error) => form.setError("root", { message: errorMessage(error) }),
  });

  if (query.isPending) return <PanelSkeleton lines={6} />;

  if (query.isError) {
    return (
      <ErrorState
        message={
          query.error instanceof Error ? query.error.message : "The policy could not be loaded."
        }
        onRetry={() => query.refetch()}
      />
    );
  }

  const policy = query.data.default_training_policy;

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeading
          title="Training & increment policy"
          description="Read-only view of the default site/training progression for new offers."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Training period" value={`${policy?.training_period_months ?? 1} month(s)`} />
          <SummaryCard label="Training monthly salary" value={formatINR(policy?.training_monthly_salary_inr ?? 14000)} />
          <SummaryCard label="Post-training band" value={`${formatINR(policy?.post_training_salary_min_inr ?? 18000)} – ${formatINR(policy?.post_training_salary_max_inr ?? 25000)}`} />
          <SummaryCard label="Post-training duration" value={`${policy?.post_training_duration_months ?? 6} month(s)`} />
          <SummaryCard label="First increment after" value={`${policy?.first_increment_after_months ?? 6} month(s)`} />
          <SummaryCard label="First increment max" value={`${policy?.first_increment_max_percent ?? 30}%`} />
          <SummaryCard label="Increment criteria" value={policy?.increment_criteria ?? "Behaviour and performance"} span />
          <SummaryCard label="Site facilities" value={`${policy?.site_accommodation_free ? "Free site accommodation" : "No free accommodation"} · ${policy?.food_provided ? "Food provided" : "No food provided"}`} span />
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      noValidate
    >
      <SectionHeading
        title="Training & increment policy"
        description="Default site/training progression applied to new drafts. Issued offers freeze their own snapshot, so changes never rewrite issued letters."
      />

      <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4">
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-accent)]"
            {...form.register("enabled")}
          />
          Enable Training &amp; Increment Policy on new offer drafts by default
        </label>
        <p className="text-xs text-[var(--color-muted)]">
          When unchecked, new offers start in standard fixed salary mode and recruiters can opt in per offer. Configure below the default policy values applied whenever activated.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeading
          title="Stage 1 — training period"
          description="The first month(s) before the post-training revision applies."
        />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Training period (months)"
            error={form.formState.errors.training_period_months?.message}
            required
          >
            <Input type="number" min={1} max={24} step={1} inputMode="numeric" {...form.register("training_period_months")} />
          </Field>
          <Field
            label="Training monthly salary (INR)"
            error={form.formState.errors.training_monthly_salary_inr?.message}
            required
          >
            <Input type="number" min={0} step={100} inputMode="decimal" {...form.register("training_monthly_salary_inr")} />
          </Field>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("site_accommodation_free")} />
            Free site accommodation
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("food_provided")} />
            Food provided
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-[var(--color-rule)] pt-5">
        <SectionHeading
          title="Stage 2 — post-training salary"
          description="The performance-based revision band and how long it runs."
        />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Minimum (INR)"
            error={form.formState.errors.post_training_salary_min_inr?.message}
            required
          >
            <Input type="number" min={0} step={100} inputMode="decimal" {...form.register("post_training_salary_min_inr")} />
          </Field>
          <Field
            label="Maximum (INR)"
            error={form.formState.errors.post_training_salary_max_inr?.message}
            required
          >
            <Input type="number" min={0} step={100} inputMode="decimal" {...form.register("post_training_salary_max_inr")} />
          </Field>
          <Field
            label="Duration (months)"
            error={form.formState.errors.post_training_duration_months?.message}
            required
          >
            <Input type="number" min={1} max={60} step={1} inputMode="numeric" {...form.register("post_training_duration_months")} />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-[var(--color-rule)] pt-5">
        <SectionHeading
          title="Stage 3 — first increment"
          description="The review window, maximum increment, and criteria."
        />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="After (months)"
            error={form.formState.errors.first_increment_after_months?.message}
            required
          >
            <Input type="number" min={1} max={60} step={1} inputMode="numeric" {...form.register("first_increment_after_months")} />
          </Field>
          <Field
            label="Max increment (%)"
            error={form.formState.errors.first_increment_max_percent?.message}
            required
          >
            <Input type="number" min={0} max={100} step={1} inputMode="numeric" {...form.register("first_increment_max_percent")} />
          </Field>
          <Field
            label="Criteria"
            error={form.formState.errors.increment_criteria?.message}
            required
            className="lg:col-span-2"
          >
            <Input {...form.register("increment_criteria")} />
          </Field>
        </div>
      </div>

      {form.formState.errors.root?.message ? (
        <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-1 py-3">
        <p className="text-xs text-[var(--color-muted)]">
          New drafts default to these values. Issued offers keep their frozen snapshot.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => form.reset(policyToValues(policy))} disabled={!form.formState.isDirty || mutation.isPending}>
            Discard changes
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Save training policy
          </Button>
        </div>
      </div>
    </form>
  );
}

function SummaryCard({
  label,
  value,
  span,
}: {
  label: string;
  value: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2.5 ${span ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-medium text-[var(--color-muted)]">{label}</span>
      <span className="text-sm text-[var(--color-ink-2)]">{value}</span>
    </div>
  );
}
