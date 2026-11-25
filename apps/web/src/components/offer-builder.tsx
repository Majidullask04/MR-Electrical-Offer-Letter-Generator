"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { type FieldPath, type Resolver, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { CandidateFormDialog } from "@/components/candidate-form-dialog";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api";
import {
  STEP_FIELDS,
  STEP_LABELS,
  emptyOfferForm,
  emptyTerms,
  offerFormFromDetail,
  offerFormSchema,
  toOfferData,
  type OfferFormValues,
} from "@/lib/offer-form";
import { formatINR } from "@/lib/format";
import type { Candidate, OfferDetail } from "@/lib/types";
import { cn } from "@/lib/cn";

export function OfferBuilder({ offer }: { offer?: OfferDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const rawStep = Number(searchParams.get("step") ?? "1");
  const step = Math.min(5, Math.max(1, Number.isFinite(rawStep) ? Math.trunc(rawStep) : 1));
  const isEdit = Boolean(offer);
  const [pickerOpen, setPickerOpen] = React.useState(!offer);
  const [candidateDialogOpen, setCandidateDialogOpen] = React.useState(false);
  const [defaultsDialogOpen, setDefaultsDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState<"draft" | "submit" | null>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const prefillRef = React.useRef(false);
  const companyInitialized = React.useRef(false);

  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema) as unknown as Resolver<OfferFormValues>,
    defaultValues: offer ? offerFormFromDetail(offer) : emptyOfferForm(),
    mode: "onBlur",
  });

  const earningsArray = useFieldArray({ control: form.control, name: "compensation.earnings" });
  const deductionsArray = useFieldArray({ control: form.control, name: "compensation.deductions" });

  const company = useQuery({
    queryKey: ["company"],
    queryFn: api.company.get,
    staleTime: 120_000,
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.list,
    staleTime: 120_000,
  });
  const candidates = useQuery({
    queryKey: ["candidates-picker", debouncedSearch],
    queryFn: () =>
      api.candidates.list({ q: debouncedSearch || undefined, page_size: 8, page: 1 }),
    staleTime: 20_000,
  });

  const candidateId = useWatch({ control: form.control, name: "candidate_id" });
  const selectedCandidate = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => api.candidates.get(candidateId),
    enabled: Boolean(candidateId),
    retry: false,
  });

  const prefillId = searchParams.get("candidate_id") ?? "";
  const prefillCandidate = useQuery({
    queryKey: ["candidate", prefillId],
    queryFn: () => api.candidates.get(prefillId),
    enabled: Boolean(prefillId) && !isEdit,
    retry: false,
  });

  const compensation = useWatch({ control: form.control, name: "compensation" });
  const employment = useWatch({ control: form.control, name: "employment" });

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    if (isEdit) return;
    if (company.data && !companyInitialized.current) {
      companyInitialized.current = true;
      if (!form.formState.isDirty) {
        form.reset({ ...emptyOfferForm(company.data), candidate_id: form.getValues("candidate_id") });
      }
    }
  }, [company.data, form, isEdit]);

  React.useEffect(() => {
    if (isEdit) return;
    if (templates.data && !form.getValues("template_id")) {
      const preferred = templates.data.find((template) => template.is_default && template.is_active)
        ?? templates.data.find((template) => template.is_active);
      if (preferred) form.setValue("template_id", preferred.id, { shouldDirty: false });
    }
  }, [templates.data, form, isEdit]);

  const applyCandidate = React.useCallback(
    (candidate: Candidate) => {
      form.setValue("candidate_id", candidate.id, { shouldDirty: true, shouldValidate: true });
      const current = form.getValues("employment");
      form.setValue(
        "employment",
        {
          ...current,
          job_title: candidate.applied_position || current.job_title,
          department: candidate.department ?? current.department,
          employment_type: candidate.employment_type,
          joining_date: candidate.proposed_joining_date ?? current.joining_date,
          work_location: candidate.work_location ?? current.work_location,
          reporting_manager: candidate.reporting_manager ?? current.reporting_manager,
        },
        { shouldDirty: true, shouldValidate: true },
      );
      setPickerOpen(false);
    },
    [form],
  );

  React.useEffect(() => {
    if (isEdit || prefillRef.current) return;
    if (prefillCandidate.data) {
      prefillRef.current = true;
      applyCandidate(prefillCandidate.data);
    }
  }, [applyCandidate, isEdit, prefillCandidate.data]);

  function setStep(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("step");
    else params.set("step", String(next));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function validateStep(index: number) {
    const fields = [...STEP_FIELDS[index]] as FieldPath<OfferFormValues>[];
    return form.trigger(fields, { shouldFocus: true });
  }

  async function handleNext() {
    const ok = await validateStep(step - 1);
    if (!ok) return;
    setStep(step + 1);
  }

  async function goToFirstError() {
    for (let index = 0; index < STEP_FIELDS.length; index += 1) {
      const ok = await validateStep(index);
      if (!ok) {
        setStep(index + 1);
        return;
      }
    }
  }

  async function handleStepClick(target: number) {
    if (target === step) return;
    if (target < step) {
      setStep(target);
      return;
    }
    for (let index = 0; index < target - 1; index += 1) {
      const ok = await validateStep(index);
      if (!ok) {
        setStep(index + 1);
        return;
      }
    }
    setStep(target);
  }

  function applyServerErrors(error: ApiError) {
    let mapped = false;
    for (const item of error.fields) {
      const path = item.field.replace(/^data\./, "").replace(/^body\./, "");
      if (!path || path === "request") continue;
      try {
        form.setError(path as FieldPath<OfferFormValues>, { message: item.message });
        mapped = true;
      } catch {
        // Ignore fields that do not map onto the builder form.
      }
    }
    if (!mapped) {
      form.setError("root", { message: error.message });
    }
  }

  function payload() {
    const values = form.getValues();
    return {
      candidate_id: values.candidate_id,
      template_id: values.template_id || null,
      validity_days: values.validity_days,
      data: toOfferData(values),
      internal_notes: values.internal_notes?.trim() || null,
    };
  }

  async function save(intent: "draft" | "submit") {
    if (saving) return;
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) {
      await goToFirstError();
      toast.error("Complete the required fields before saving.");
      return;
    }
    setSaving(intent);
    try {
      const body = payload();
      let savedId: string;
      if (offer) {
        const updated = await api.offers.update(offer.id, {
          candidate_id: body.candidate_id,
          template_id: body.template_id,
          validity_days: body.validity_days,
          data: body.data,
          internal_notes: body.internal_notes,
        });
        savedId = updated.id;
      } else {
        const created = await api.offers.create(body);
        savedId = created.id;
      }

      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      if (intent === "submit") {
        try {
          await api.offers.submit(savedId);
          queryClient.invalidateQueries({ queryKey: ["offer", savedId] });
          toast.success("Offer submitted for approval.");
          router.push(`/offers/${savedId}`);
          return;
        } catch (error) {
          toast.error(
            `Draft saved, but submission failed: ${error instanceof Error ? error.message : "try again from the offer page."
            }`,
          );
          router.push(`/offers/${savedId}`);
          return;
        }
      }

      toast.success(offer ? "Draft updated." : "Draft saved.");
      router.push(`/offers/${savedId}`);
    } catch (error) {
      if (error instanceof ApiError) applyServerErrors(error);
      toast.error(error instanceof Error ? error.message : "The offer could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  function distributeMonthlyGross() {
    const monthly = Number(form.getValues("compensation.monthly_gross")) || 0;
    if (monthly <= 0) {
      toast.error("Enter the monthly gross first.");
      return;
    }
    const basic = Math.round(monthly * 0.4);
    const hra = Math.round(monthly * 0.2);
    const conveyance = Math.min(2000, Math.max(0, monthly - basic - hra));
    const special = Math.max(0, monthly - basic - hra - conveyance);
    earningsArray.replace([
      { name: "Basic salary", amount: basic, period: "MONTHLY" },
      { name: "House rent allowance", amount: hra, period: "MONTHLY" },
      { name: "Conveyance allowance", amount: conveyance, period: "MONTHLY" },
      { name: "Special allowance", amount: special, period: "MONTHLY" },
    ]);
    toast.success("Salary components distributed from the monthly gross.");
  }

  const earnings = compensation?.earnings ?? [];
  const deductions = compensation?.deductions ?? [];
  const monthlyValue = (item: { amount: number | string; period: string }) => {
    const amount = Number(item.amount) || 0;
    return item.period === "ANNUAL" ? amount / 12 : amount;
  };
  const earningsTotal = earnings.reduce((sum, item) => sum + monthlyValue(item), 0);
  const deductionsTotal = deductions.reduce((sum, item) => sum + monthlyValue(item), 0);
  const statedMonthly = Number(compensation?.monthly_gross) || 0;
  const difference = statedMonthly - (earningsTotal - deductionsTotal);

  const preview = useMutation({
    mutationFn: () => api.offers.preview(payload()),
    onError: (error) => {
      if (error instanceof ApiError) applyServerErrors(error);
    },
  });

  React.useEffect(() => {
    if (step !== 5 || !candidateId) return;
    let cancelled = false;
    (async () => {
      const valid = await form.trigger(undefined);
      if (!valid || cancelled) return;
      preview.mutate();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, candidateId]);

  const selected = selectedCandidate.data;
  const terms = form.watch("terms");
  const activeTemplates = templates.data?.filter((template) => template.is_active) ?? [];
  const companyDefaults = company.data?.default_terms;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isEdit ? "Edit offer" : "New offer"}
        description={
          isEdit
            ? "Adjust the draft, then resubmit it for approval. Issued revisions are never edited in place."
            : "Build the letter in five measured steps. Nothing reaches the candidate until HR issues it."
        }
        backHref={offer ? `/offers/${offer.id}` : "/offers"}
        backLabel={offer ? "Back to offer" : "Back to offers"}
        meta={
          offer ? (
            <>
              <span className="mono text-xs text-[var(--color-ink-2)]">{offer.offer_number}</span>
              <StatusBadge status={offer.status} />
              <span className="text-xs text-[var(--color-muted)]">Revision {offer.revision_number}</span>
            </>
          ) : null
        }
      />

      {offer && offer.status !== "DRAFT" ? (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-warn)] bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
          Saving changes returns this {offer.status === "PENDING_APPROVAL" ? "pending" : "approved"} offer
          to draft and requires a fresh approval decision.
        </div>
      ) : null}

      <Stepper step={step} onStepClick={handleStepClick} />

      <form
        onSubmit={(event) => event.preventDefault()}
        noValidate
        className="flex flex-col gap-6"
        aria-label="Offer builder"
      >
        {step === 1 ? (
          <section className="flex flex-col gap-4" aria-labelledby="candidate-step">
            <SectionHeading
              id="candidate-step"
              title="Who is this offer for?"
              description="Pick an active candidate. Their record supplies the starting role and joining details."
              actions={
                <Button variant="secondary" size="sm" onClick={() => setCandidateDialogOpen(true)}>
                  <UserPlus size={14} strokeWidth={2} aria-hidden="true" />
                  Add candidate
                </Button>
              }
            />

            {selected && !pickerOpen ? (
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-display text-lg text-[var(--color-ink)]">{selected.full_name}</p>
                    <p className="text-sm text-[var(--color-muted)]">{selected.email}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {selected.applied_position}
                      {selected.department ? ` · ${selected.department}` : ""}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                    Change candidate
                  </Button>
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-[var(--color-rule)] pt-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-[10px] text-[var(--color-muted)]">Phone</dt>
                    <dd className="mono text-xs text-[var(--color-ink-2)]">{selected.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--color-muted)]">Proposed joining</dt>
                    <dd className="text-xs text-[var(--color-ink-2)]">
                      {selected.proposed_joining_date ?? "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--color-muted)]">Work location</dt>
                    <dd className="text-xs text-[var(--color-ink-2)]">
                      {selected.work_location ?? "Not set"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative max-w-[440px]">
                  <Search
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find a candidate by name, email or role"
                    aria-label="Find a candidate"
                    className="pl-8"
                    autoFocus
                  />
                </div>
                {candidates.isPending ? (
                  <div className="flex flex-col gap-2" aria-busy="true">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : candidates.isError ? (
                  <ErrorState
                    title="Candidates could not load"
                    message={
                      candidates.error instanceof Error
                        ? candidates.error.message
                        : "Try again to load the candidate list."
                    }
                    onRetry={() => candidates.refetch()}
                  />
                ) : candidates.data.items.length === 0 ? (
                  <EmptyState
                    title={search ? "No candidate matches that search" : "No active candidates yet"}
                    description={
                      search
                        ? "Try a shorter search, or add the candidate as a new record."
                        : "Add the first candidate to start an offer. Candidate records are managed by HR."
                    }
                    action={
                      <Button variant="secondary" size="sm" onClick={() => setCandidateDialogOpen(true)}>
                        Add candidate
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
                    {candidates.data.items.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => applyCandidate(candidate)}
                          className={cn(
                            "flex w-full flex-wrap items-center justify-between gap-3 px-1 py-3 text-left transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]",
                            candidate.id === candidateId && "bg-[var(--color-accent-soft)]",
                          )}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-semibold text-[var(--color-ink)]">
                              {candidate.full_name}
                            </span>
                            <span className="truncate text-xs text-[var(--color-muted)]">
                              {candidate.email} · {candidate.applied_position}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            {candidate.id === candidateId ? (
                              <span className="text-[10px] font-semibold text-[var(--color-accent-deep)]">
                                Selected
                              </span>
                            ) : null}
                            <span className="mono text-[10px] text-[var(--color-muted)]">
                              {candidate.employment_type.replaceAll("_", " ").toLowerCase()}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selected ? (
                  <Button variant="ghost" size="sm" className="w-fit" onClick={() => setPickerOpen(false)}>
                    Keep {selected.full_name}
                  </Button>
                ) : null}
              </div>
            )}
            {form.formState.errors.candidate_id?.message ? (
              <p className="text-sm text-[var(--color-bad)]" role="alert">
                {form.formState.errors.candidate_id.message}
              </p>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-col gap-5" aria-labelledby="role-step">
            <SectionHeading
              id="role-step"
              title="Role and joining"
              description="These details print on the letter. Edit anything the candidate record did not capture."
            />
            <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Job title" htmlFor="job-title" error={form.formState.errors.employment?.job_title?.message} required>
                <Input id="job-title" {...form.register("employment.job_title")} />
              </Field>
              <Field label="Department" htmlFor="department" error={form.formState.errors.employment?.department?.message} required>
                <Input id="department" {...form.register("employment.department")} />
              </Field>
              <Field label="Employment type" htmlFor="employment-type" error={form.formState.errors.employment?.employment_type?.message} required>
                <Select id="employment-type" {...form.register("employment.employment_type")}>
                  <option value="FULL_TIME">Full time</option>
                  <option value="PART_TIME">Part time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="TEMPORARY">Temporary</option>
                  <option value="INTERNSHIP">Internship</option>
                </Select>
              </Field>
              <Field label="Joining date" htmlFor="joining-date" error={form.formState.errors.employment?.joining_date?.message} required>
                <Input id="joining-date" type="date" {...form.register("employment.joining_date")} />
              </Field>
              <Field label="Work location" htmlFor="work-location" error={form.formState.errors.employment?.work_location?.message} required>
                <Input id="work-location" {...form.register("employment.work_location")} />
              </Field>
              <Field label="Reporting manager" htmlFor="reporting-manager" error={form.formState.errors.employment?.reporting_manager?.message} required>
                <Input id="reporting-manager" {...form.register("employment.reporting_manager")} />
              </Field>
              <Field label="Probation (months)" htmlFor="probation-months" error={form.formState.errors.employment?.probation_months?.message} required>
                <Input id="probation-months" type="number" min={0} max={12} step={1} inputMode="numeric" {...form.register("employment.probation_months")} />
              </Field>
              <Field label="Working days" htmlFor="working-days" error={form.formState.errors.employment?.working_days?.message} required>
                <Input id="working-days" {...form.register("employment.working_days")} />
              </Field>
              <Field label="Working hours" htmlFor="working-hours" error={form.formState.errors.employment?.working_hours?.message} required>
                <Input id="working-hours" {...form.register("employment.working_hours")} />
              </Field>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              The joining date and working pattern print on the letter; they do not create a calendar event.
            </p>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-col gap-6" aria-labelledby="compensation-step">
            <SectionHeading
              id="compensation-step"
              title="Compensation"
              description="State the annual CTC and monthly gross, then break the monthly gross into named components."
            />
            <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Annual CTC (INR)" htmlFor="annual-ctc" error={form.formState.errors.compensation?.annual_ctc?.message} required>
                <Input id="annual-ctc" type="number" min={1} step={1000} inputMode="decimal" {...form.register("compensation.annual_ctc")} />
              </Field>
              <Field label="Monthly gross (INR)" htmlFor="monthly-gross" error={form.formState.errors.compensation?.monthly_gross?.message} required>
                <Input id="monthly-gross" type="number" min={1} step={100} inputMode="decimal" {...form.register("compensation.monthly_gross")} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-ink-2)]">Monthly check</span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    form.setValue(
                      "compensation.monthly_gross",
                      Math.round((Number(form.getValues("compensation.annual_ctc")) || 0) / 12),
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                  className="w-fit"
                >
                  Set to annual ÷ 12
                </Button>
                <p className="text-xs text-[var(--color-muted)]">
                  Annual CTC ÷ 12 = {formatINR(Math.round((Number(compensation?.annual_ctc) || 0) / 12))}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-display text-md text-[var(--color-ink)]">Earnings</h3>
                  <p className="text-xs text-[var(--color-muted)]">
                    Monthly components should reconcile with the monthly gross.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => earningsArray.append({ name: "", amount: 0, period: "MONTHLY" })}>
                    <Plus size={13} strokeWidth={2} aria-hidden="true" />
                    Add earning
                  </Button>
                  <Button variant="quiet" size="sm" onClick={distributeMonthlyGross}>
                    Distribute monthly gross
                  </Button>
                </div>
              </div>
              {earningsArray.fields.length === 0 ? (
                <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-rule-2)] px-4 py-4 text-xs leading-relaxed text-[var(--color-muted)]">
                  No components yet. Add each earning line, or distribute the monthly gross into a standard split you can edit.
                </p>
              ) : (
                <div className="scroll-x">
                  <table className="data-table min-w-[560px]">
                    <thead>
                      <tr>
                        <th scope="col">Component</th>
                        <th scope="col" className="w-[150px]">Amount (INR)</th>
                        <th scope="col" className="w-[130px]">Period</th>
                        <th scope="col" className="w-[48px]"><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {earningsArray.fields.map((field, index) => (
                        <tr key={field.id}>
                          <td>
                            <Input
                              aria-label={`Earning ${index + 1} name`}
                              placeholder="Basic salary"
                              {...form.register(`compensation.earnings.${index}.name`)}
                            />
                            {form.formState.errors.compensation?.earnings?.[index]?.name?.message ? (
                              <p className="mt-1 text-xs text-[var(--color-bad)]">
                                {form.formState.errors.compensation.earnings[index]?.name?.message}
                              </p>
                            ) : null}
                          </td>
                          <td>
                            <Input
                              type="number"
                              min={0}
                              step={100}
                              inputMode="decimal"
                              aria-label={`Earning ${index + 1} amount`}
                              {...form.register(`compensation.earnings.${index}.amount`)}
                            />
                          </td>
                          <td>
                            <Select aria-label={`Earning ${index + 1} period`} {...form.register(`compensation.earnings.${index}.period`)}>
                              <option value="MONTHLY">Monthly</option>
                              <option value="ANNUAL">Annual</option>
                            </Select>
                          </td>
                          <td>
                            <Button variant="ghost" size="icon-sm" aria-label={`Remove earning ${index + 1}`} onClick={() => earningsArray.remove(index)}>
                              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-display text-md text-[var(--color-ink)]">Deductions</h3>
                  <p className="text-xs text-[var(--color-muted)]">Optional. Add only deductions the company withholds.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => deductionsArray.append({ name: "", amount: 0, period: "MONTHLY" })}>
                  <Plus size={13} strokeWidth={2} aria-hidden="true" />
                  Add deduction
                </Button>
              </div>
              {deductionsArray.fields.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">No deductions listed.</p>
              ) : (
                <div className="scroll-x">
                  <table className="data-table min-w-[560px]">
                    <thead>
                      <tr>
                        <th scope="col">Deduction</th>
                        <th scope="col" className="w-[150px]">Amount (INR)</th>
                        <th scope="col" className="w-[130px]">Period</th>
                        <th scope="col" className="w-[48px]"><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductionsArray.fields.map((field, index) => (
                        <tr key={field.id}>
                          <td>
                            <Input aria-label={`Deduction ${index + 1} name`} placeholder="Provident fund" {...form.register(`compensation.deductions.${index}.name`)} />
                          </td>
                          <td>
                            <Input type="number" min={0} step={100} inputMode="decimal" aria-label={`Deduction ${index + 1} amount`} {...form.register(`compensation.deductions.${index}.amount`)} />
                          </td>
                          <td>
                            <Select aria-label={`Deduction ${index + 1} period`} {...form.register(`compensation.deductions.${index}.period`)}>
                              <option value="MONTHLY">Monthly</option>
                              <option value="ANNUAL">Annual</option>
                            </Select>
                          </td>
                          <td>
                            <Button variant="ghost" size="icon-sm" aria-label={`Remove deduction ${index + 1}`} onClick={() => deductionsArray.remove(index)}>
                              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
              <div className="grid gap-x-5 sm:grid-cols-2">
                <Field label="Payment frequency" htmlFor="payment-frequency" error={form.formState.errors.compensation?.payment_frequency?.message}>
                  <Select id="payment-frequency" {...form.register("compensation.payment_frequency")}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUALLY">Annually</option>
                  </Select>
                </Field>
                <div />
                <Field label="Compensation notes" htmlFor="compensation-notes" error={form.formState.errors.compensation?.notes?.message} hint="Printed with the salary table if provided." className="sm:col-span-2">
                  <Textarea id="compensation-notes" rows={2} {...form.register("compensation.notes")} />
                </Field>
              </div>
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4">
                <h3 className="font-display text-sm text-[var(--color-ink)]">Monthly reconciliation</h3>
                <dl className="mt-3 flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-[var(--color-muted)]">Earnings</dt>
                    <dd className="mono text-xs text-[var(--color-ink)]">{formatINR(Math.round(earningsTotal))}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-[var(--color-muted)]">Deductions</dt>
                    <dd className="mono text-xs text-[var(--color-ink)]">{formatINR(Math.round(deductionsTotal))}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-rule)] pt-2">
                    <dt className="text-xs font-semibold text-[var(--color-ink-2)]">Net from components</dt>
                    <dd className="mono text-sm text-[var(--color-ink)]">{formatINR(Math.round(earningsTotal - deductionsTotal))}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-[var(--color-muted)]">Stated monthly gross</dt>
                    <dd className="mono text-xs text-[var(--color-ink)]">{formatINR(statedMonthly)}</dd>
                  </div>
                </dl>
                <p
                  className={cn(
                    "mt-3 border-t border-[var(--color-rule)] pt-2 text-[11px] leading-relaxed",
                    Math.abs(difference) < 1 ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]",
                  )}
                >
                  {Math.abs(difference) < 1
                    ? "The components reconcile with the stated monthly gross."
                    : `Difference of ${formatINR(Math.round(difference))}. The letter prints both figures; reconcile before issuing.`}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-display text-md text-[var(--color-ink)]">Training &amp; increment policy</h3>
                  <p className="text-xs text-[var(--color-muted)]">
                    MR. ELECTRICAL WORKS site/training progression: ₹14k training, ₹18k–₹25k post-training, up to 30% first increment.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--color-ink-2)]">
                  <input
                    type="checkbox"
                    checked={form.watch("training_policy.enabled")}
                    onChange={(event) => form.setValue("training_policy.enabled", event.target.checked, { shouldDirty: true, shouldValidate: true })}
                    className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                  />
                  Apply standard site/training policy
                </label>
              </div>

              {form.watch("training_policy.enabled") ? (
                <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Training period (months)" error={form.formState.errors.training_policy?.training_period_months?.message}>
                    <Input type="number" min={1} max={24} step={1} inputMode="numeric" {...form.register("training_policy.training_period_months")} />
                  </Field>
                  <Field label="Training monthly salary (INR)" error={form.formState.errors.training_policy?.training_monthly_salary_inr?.message}>
                    <Input type="number" min={0} step={100} inputMode="decimal" {...form.register("training_policy.training_monthly_salary_inr")} />
                  </Field>
                  <Field label="Post-training salary min (INR)" error={form.formState.errors.training_policy?.post_training_salary_min_inr?.message}>
                    <Input type="number" min={0} step={100} inputMode="decimal" {...form.register("training_policy.post_training_salary_min_inr")} />
                  </Field>
                  <Field label="Post-training salary max (INR)" error={form.formState.errors.training_policy?.post_training_salary_max_inr?.message}>
                    <Input type="number" min={0} step={100} inputMode="decimal" {...form.register("training_policy.post_training_salary_max_inr")} />
                  </Field>
                  <Field label="Post-training duration (months)" error={form.formState.errors.training_policy?.post_training_duration_months?.message}>
                    <Input type="number" min={1} max={60} step={1} inputMode="numeric" {...form.register("training_policy.post_training_duration_months")} />
                  </Field>
                  <Field label="First increment after (months)" error={form.formState.errors.training_policy?.first_increment_after_months?.message}>
                    <Input type="number" min={1} max={60} step={1} inputMode="numeric" {...form.register("training_policy.first_increment_after_months")} />
                  </Field>
                  <Field label="First increment max (%)" error={form.formState.errors.training_policy?.first_increment_max_percent?.message}>
                    <Input type="number" min={0} max={100} step={1} inputMode="numeric" {...form.register("training_policy.first_increment_max_percent")} />
                  </Field>
                  <Field label="Increment criteria" error={form.formState.errors.training_policy?.increment_criteria?.message}>
                    <Input {...form.register("training_policy.increment_criteria")} />
                  </Field>
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-2)] sm:col-span-2">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("training_policy.site_accommodation_free")} />
                    Free site accommodation provided
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("training_policy.food_provided")} />
                    Food provided
                  </label>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="flex flex-col gap-5" aria-labelledby="terms-step">
            <SectionHeading
              id="terms-step"
              title="Terms and clauses"
              description="The letter's employment terms. Starter copy is neutral and must be reviewed before issue."
              actions={
                companyDefaults ? (
                  <Button variant="secondary" size="sm" onClick={() => setDefaultsDialogOpen(true)}>
                    Load company defaults
                  </Button>
                ) : undefined
              }
            />
            <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-warn)] bg-[var(--color-warn-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
              <strong className="font-semibold">Neutral starter copy, not legal advice.</strong>{" "}
              Review every clause with a qualified adviser and adapt it to the appointment, state and
              applicable law before issuing a real offer.
            </div>
            <div className="grid gap-x-5 lg:grid-cols-2">
              <Field label="Probation" htmlFor="term-probation" error={form.formState.errors.terms?.probation?.message}>
                <Textarea id="term-probation" rows={3} {...form.register("terms.probation")} />
              </Field>
              <Field label="Working hours" htmlFor="term-hours" error={form.formState.errors.terms?.working_hours?.message}>
                <Textarea id="term-hours" rows={3} {...form.register("terms.working_hours")} />
              </Field>
              <Field label="Leave policy" htmlFor="term-leave" error={form.formState.errors.terms?.leave_policy?.message}>
                <Textarea id="term-leave" rows={3} {...form.register("terms.leave_policy")} />
              </Field>
              <Field label="Confidentiality" htmlFor="term-confidentiality" error={form.formState.errors.terms?.confidentiality?.message}>
                <Textarea id="term-confidentiality" rows={3} {...form.register("terms.confidentiality")} />
              </Field>
              <Field label="Notice period" htmlFor="term-notice" error={form.formState.errors.terms?.notice_period?.message}>
                <Textarea id="term-notice" rows={3} {...form.register("terms.notice_period")} />
              </Field>
              <Field label="Termination" htmlFor="term-termination" error={form.formState.errors.terms?.termination?.message}>
                <Textarea id="term-termination" rows={3} {...form.register("terms.termination")} />
              </Field>
              <Field label="Company policies" htmlFor="term-policies" error={form.formState.errors.terms?.company_policies?.message}>
                <Textarea id="term-policies" rows={3} {...form.register("terms.company_policies")} />
              </Field>
              <Field label="Joining requirements" htmlFor="term-joining" error={form.formState.errors.terms?.joining_requirements?.message}>
                <Textarea id="term-joining" rows={3} {...form.register("terms.joining_requirements")} />
              </Field>
              <Field label="Additional clauses" htmlFor="term-additional" error={form.formState.errors.terms?.additional_clauses?.message} className="lg:col-span-2">
                <Textarea id="term-additional" rows={3} {...form.register("terms.additional_clauses")} />
              </Field>
            </div>
            <ActionDialog
              open={defaultsDialogOpen}
              onOpenChange={setDefaultsDialogOpen}
              title="Load company default clauses?"
              description="This replaces all nine clause fields with the current company defaults. Any edits on this step will be lost."
              confirmLabel="Load defaults"
              onConfirm={() => {
                if (companyDefaults) {
                  form.setValue("terms", { ...emptyTerms, ...companyDefaults }, { shouldDirty: true, shouldValidate: true });
                  toast.success("Company default clauses loaded.");
                }
                setDefaultsDialogOpen(false);
              }}
            />
          </section>
        ) : null}

        {step === 5 ? (
          <section className="flex flex-col gap-6" aria-labelledby="review-step">
            <SectionHeading
              id="review-step"
              title="Review and issue settings"
              description="Check the letter preview, set how long the offer stays open, and decide who sees internal notes."
            />

            <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
              <div className="flex flex-col gap-5">
                <div className="rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <h3 className="font-display text-md text-[var(--color-ink)]">Offer summary</h3>
                      <p className="text-xs text-[var(--color-muted)]">A read-back before the draft is saved.</p>
                    </div>
                    {offer ? <StatusBadge status={offer.status} /> : null}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
                    <div className="col-span-2 border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Candidate</dt>
                      <dd className="text-sm font-semibold text-[var(--color-ink)]">
                        {selected?.full_name ?? offer?.candidate_name ?? "No candidate selected"}
                      </dd>
                      <dd className="text-xs text-[var(--color-muted)]">{selected?.email ?? offer?.candidate_email ?? ""}</dd>
                    </div>
                    <div className="border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Role</dt>
                      <dd className="text-sm text-[var(--color-ink-2)]">{employment?.job_title || "—"}</dd>
                    </div>
                    <div className="border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Department</dt>
                      <dd className="text-sm text-[var(--color-ink-2)]">{employment?.department || "—"}</dd>
                    </div>
                    <div className="border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Joining</dt>
                      <dd className="text-sm text-[var(--color-ink-2)]">{employment?.joining_date || "—"}</dd>
                    </div>
                    <div className="border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Location</dt>
                      <dd className="text-sm text-[var(--color-ink-2)]">{employment?.work_location || "—"}</dd>
                    </div>
                    <div className="border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Annual CTC</dt>
                      <dd className="mono text-sm text-[var(--color-ink)]">{formatINR(Number(compensation?.annual_ctc) || 0)}</dd>
                    </div>
                    <div className="border-t border-[var(--color-rule)] pt-3">
                      <dt className="text-[10px] text-[var(--color-muted)]">Monthly gross</dt>
                      <dd className="mono text-sm text-[var(--color-ink)]">{formatINR(Number(compensation?.monthly_gross) || 0)}</dd>
                    </div>
                  </dl>
                  <details className="mt-4 border-t border-[var(--color-rule)] pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--color-cool-deep)]">
                      Read the {Object.values(terms).filter((value) => value.trim()).length} filled clauses
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      {Object.entries(terms).map(([key, value]) =>
                        value.trim() ? (
                          <div key={key} className="flex flex-col gap-0.5">
                            <p className="text-[10px] font-semibold text-[var(--color-ink-2)]">
                              {key.replaceAll("_", " ")}
                            </p>
                            <p className="text-xs leading-relaxed text-[var(--color-muted)]">{value}</p>
                          </div>
                        ) : null,
                      )}
                    </div>
                  </details>
                </div>

                <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-4 sm:p-5">
                  <h3 className="font-display text-md text-[var(--color-ink)]">Issue settings</h3>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <Field label="Validity (days)" htmlFor="validity-days" error={form.formState.errors.validity_days?.message} hint="1–90 days from issue." required>
                      <Input id="validity-days" type="number" min={1} max={90} step={1} inputMode="numeric" {...form.register("validity_days")} />
                    </Field>
                    <Field label="Letter template" htmlFor="template-id" error={form.formState.errors.template_id?.message} hint="Only active templates can issue.">
                      <Select id="template-id" {...form.register("template_id")}>
                        <option value="">Use the default template</option>
                        {activeTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}{template.is_default ? " (default)" : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Internal notes" htmlFor="internal-notes" error={form.formState.errors.internal_notes?.message} hint="Staff-only. Never shown to the candidate.">
                    <Textarea id="internal-notes" rows={3} {...form.register("internal_notes")} />
                  </Field>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-md text-[var(--color-ink)]">Letter preview</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => preview.mutate()}
                    loading={preview.isPending}
                    disabled={!candidateId}
                  >
                    <FileText size={13} strokeWidth={2} aria-hidden="true" />
                    Refresh preview
                  </Button>
                </div>
                <div className="min-h-[540px] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-rule-2)] bg-white">
                  {preview.isPending ? (
                    <div className="flex flex-col gap-3 p-6" aria-busy="true">
                      <Skeleton className="h-8 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-40 w-full" />
                    </div>
                  ) : preview.isError ? (
                    <div className="p-5">
                      <ErrorState
                        title="The preview could not render"
                        message={
                          preview.error instanceof Error
                            ? preview.error.message
                            : "Complete the required fields and try again."
                        }
                        onRetry={() => preview.mutate()}
                      />
                    </div>
                  ) : preview.data ? (
                    <iframe
                      title="Offer letter preview"
                      srcDoc={preview.data.html}
                      sandbox=""
                      className="h-[640px] w-full bg-white"
                    />
                  ) : (
                    <div className="flex h-[540px] flex-col items-center justify-center gap-2 p-6 text-center">
                      <p className="text-sm font-semibold text-[var(--color-ink-2)]">No preview yet</p>
                      <p className="max-w-[36ch] text-xs leading-relaxed text-[var(--color-muted)]">
                        The preview appears once the required details are complete. It uses the same letterhead as the issued PDF.
                      </p>
                      <Button variant="secondary" size="sm" onClick={() => preview.mutate()} disabled={!candidateId}>
                        Render preview
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
                  Preview is rendered in a sandboxed frame. The issued PDF is stored privately and never served from a public path.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {form.formState.errors.root?.message ? (
          <div
            role="alert"
            className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-bad)] bg-[var(--color-bad-soft)] px-4 py-3 text-sm text-[var(--color-bad)]"
          >
            {form.formState.errors.root.message}
          </div>
        ) : null}

        <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep(Math.max(1, step - 1))}
                disabled={step === 1 || saving !== null}
              >
                <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
                Back
              </Button>
              <p className="hidden text-[10px] text-[var(--color-muted)] sm:block">
                Step {step} of 5 · {STEP_LABELS[step - 1].title}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => save("draft")}
                loading={saving === "draft"}
                disabled={saving !== null}
              >
                Save draft
              </Button>
              {step < 5 ? (
                <Button variant="primary" onClick={handleNext} disabled={saving !== null}>
                  Continue
                  <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => save("submit")}
                  loading={saving === "submit"}
                  disabled={saving !== null}
                >
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                  Submit for approval
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      <CandidateFormDialog
        open={candidateDialogOpen}
        onOpenChange={setCandidateDialogOpen}
        onSaved={(candidate) => {
          applyCandidate(candidate);
          queryClient.invalidateQueries({ queryKey: ["candidates-picker"] });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function Stepper({ step, onStepClick }: { step: number; onStepClick: (step: number) => void }) {
  return (
    <nav aria-label="Offer builder steps" className="scroll-x">
      <ol className="flex min-w-[640px] border-y border-[var(--color-rule)]">
        {STEP_LABELS.map((label, index) => {
          const number = index + 1;
          const active = number === step;
          const complete = number < step;
          return (
            <li key={label.title} className="flex-1">
              <button
                type="button"
                onClick={() => onStepClick(number)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex h-[62px] w-full items-center gap-2.5 px-3 text-left transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]",
                  active && "bg-[var(--color-paper-2)]",
                )}
              >
                <span
                  className={cn(
                    "mono inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                      : complete
                        ? "border-[var(--color-ink-2)] bg-[var(--color-ink-2)] text-[var(--color-paper)]"
                        : "border-[var(--color-rule-2)] bg-[var(--color-sheet)] text-[var(--color-muted)]",
                  )}
                >
                  {complete ? <Check size={11} strokeWidth={2.5} aria-hidden="true" /> : String(number).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("truncate text-xs font-semibold", active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-2)]")}>
                    {label.title}
                  </span>
                  <span className="truncate text-[10px] text-[var(--color-muted)]">{label.note}</span>
                </span>
                {active ? (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[var(--color-accent)]" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
