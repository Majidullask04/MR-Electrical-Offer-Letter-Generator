"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api";
import type { Candidate, EmploymentType } from "@/lib/types";

const employmentTypes: Array<{ value: EmploymentType; label: string }> = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "TEMPORARY", label: "Temporary" },
  { value: "INTERNSHIP", label: "Internship" },
];

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter the candidate's full name.").max(160),
  email: z.string().trim().email("Enter a valid email address.").or(z.literal("")).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === "" || value.length >= 7, "Enter a phone number.")
    .optional(),
  current_address: z.string().max(1000).optional(),
  applied_position: z.string().trim().min(2, "Enter the position.").max(160),
  department: z.string().max(120).optional(),
  employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP"]),
  proposed_joining_date: z.string().optional(),
  reporting_manager: z.string().max(160).optional(),
  work_location: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
});

type Values = z.infer<typeof schema>;

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate?: Candidate | null;
  onSaved?: (candidate: Candidate) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(candidate);
  const positions = useQuery({
    queryKey: ["positions"],
    queryFn: api.candidates.positions,
    staleTime: 60_000,
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      current_address: "",
      applied_position: "",
      department: "",
      employment_type: "FULL_TIME",
      proposed_joining_date: "",
      reporting_manager: "",
      work_location: "",
      notes: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    if (candidate) {
      form.reset({
        full_name: candidate.full_name,
        email: candidate.email ?? "",
        phone: candidate.phone ?? "",
        current_address: candidate.current_address ?? "",
        applied_position: candidate.applied_position,
        department: candidate.department ?? "",
        employment_type: candidate.employment_type,
        proposed_joining_date: candidate.proposed_joining_date ?? "",
        reporting_manager: candidate.reporting_manager ?? "",
        work_location: candidate.work_location ?? "",
        notes: candidate.notes ?? "",
      });
    } else {
      form.reset({
        full_name: "",
        email: "",
        phone: "",
        current_address: "",
        applied_position: "",
        department: "",
        employment_type: "FULL_TIME",
        proposed_joining_date: "",
        reporting_manager: "",
        work_location: "",
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate]);

  const mutation = useMutation({
    mutationFn: (values: Values) => {
      const payload = {
        ...values,
        email: values.email?.trim() || null,
        phone: values.phone?.trim() || null,
        current_address: values.current_address || null,
        department: values.department || null,
        proposed_joining_date: values.proposed_joining_date || null,
        reporting_manager: values.reporting_manager || null,
        work_location: values.work_location || null,
        notes: values.notes || null,
      };
      if (candidate) return api.candidates.update(candidate.id, payload);
      return api.candidates.create(payload);
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Candidate updated." : "Candidate added.");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "CANDIDATE_EXISTS") {
        form.setError("email", { message: "A candidate with this email already exists." });
        return;
      }
      if (error instanceof ApiError && error.fields.length > 0) {
        for (const field of error.fields) {
          const key = field.field.split(".").pop() as keyof Values | undefined;
          if (key) form.setError(key, { message: field.message });
        }
      }
      form.setError("root", {
        message: error instanceof Error ? error.message : "The candidate could not be saved.",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit candidate" : "Add candidate"}</DialogTitle>
          <DialogDescription>
            These details feed the offer draft. You can still change the employment terms per offer.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-1"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="candidate-name" error={form.formState.errors.full_name?.message} required>
              <Input id="candidate-name" autoComplete="name" {...form.register("full_name")} />
            </Field>
            <Field label="Email" htmlFor="candidate-email" error={form.formState.errors.email?.message}>
              <Input id="candidate-email" type="email" autoComplete="email" {...form.register("email")} />
            </Field>
            <Field label="Phone" htmlFor="candidate-phone" error={form.formState.errors.phone?.message}>
              <Input id="candidate-phone" type="tel" inputMode="tel" autoComplete="tel" {...form.register("phone")} />
            </Field>
            <Field
              label="Applied position"
              htmlFor="candidate-position"
              error={form.formState.errors.applied_position?.message}
              hint="Start typing to reuse a saved position."
              required
            >
              <Input
                id="candidate-position"
                list="position-options"
                autoComplete="off"
                {...form.register("applied_position")}
              />
              <datalist id="position-options">
                {positions.data?.map((position) => (
                  <option key={position.id} value={position.title} />
                ))}
              </datalist>
            </Field>
            <Field label="Department" htmlFor="candidate-department" error={form.formState.errors.department?.message}>
              <Input id="candidate-department" {...form.register("department")} />
            </Field>
            <Field label="Employment type" htmlFor="candidate-type" error={form.formState.errors.employment_type?.message} required>
              <Select id="candidate-type" {...form.register("employment_type")}>
                {employmentTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Proposed joining date" htmlFor="candidate-joining" error={form.formState.errors.proposed_joining_date?.message}>
              <Input id="candidate-joining" type="date" {...form.register("proposed_joining_date")} />
            </Field>
            <Field label="Reporting manager" htmlFor="candidate-manager" error={form.formState.errors.reporting_manager?.message}>
              <Input id="candidate-manager" autoComplete="off" {...form.register("reporting_manager")} />
            </Field>
            <Field label="Work location" htmlFor="candidate-location" error={form.formState.errors.work_location?.message}>
              <Input id="candidate-location" autoComplete="off" {...form.register("work_location")} />
            </Field>
            <Field label="Current address" htmlFor="candidate-address" error={form.formState.errors.current_address?.message} className="sm:col-span-2">
              <Textarea id="candidate-address" rows={2} autoComplete="street-address" {...form.register("current_address")} />
            </Field>
            <Field label="Internal notes" htmlFor="candidate-notes" error={form.formState.errors.notes?.message} className="sm:col-span-2">
              <Textarea id="candidate-notes" rows={2} {...form.register("notes")} />
            </Field>
          </div>
          {form.formState.errors.root?.message ? (
            <p className="mb-2 text-sm text-[var(--color-bad)]" role="alert">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              {isEdit ? "Save candidate" : "Add candidate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
