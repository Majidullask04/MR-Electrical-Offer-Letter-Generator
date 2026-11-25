import { z } from "zod";

import type { Company, OfferData, OfferDetail, TermsDetails } from "@/lib/types";

const termField = z.string().max(5000, "Keep each clause under 5,000 characters.");

export const offerFormSchema = z.object({
  candidate_id: z.string().min(1, "Select a candidate."),
  template_id: z.string().optional(),
  validity_days: z.coerce
    .number({ error: "Enter a validity period." })
    .int("Use a whole number of days.")
    .min(1, "Use at least one day.")
    .max(90, "Use no more than 90 days."),
  employment: z.object({
    job_title: z.string().trim().min(2, "Enter the job title.").max(160),
    department: z.string().trim().min(1, "Enter the department.").max(120),
    employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP"]),
    joining_date: z.string().min(1, "Choose a joining date."),
    work_location: z.string().trim().min(2, "Enter the work location.").max(200),
    reporting_manager: z.string().trim().min(2, "Enter the reporting manager.").max(160),
    probation_months: z.coerce
      .number({ error: "Enter the probation period." })
      .int("Use whole months.")
      .min(0, "Cannot be negative.")
      .max(12, "Use 12 months or fewer."),
    working_days: z.string().trim().min(2, "Enter the working days.").max(120),
    working_hours: z.string().trim().min(2, "Enter the working hours.").max(120),
  }),
  compensation: z.object({
    annual_ctc: z.coerce
      .number({ error: "Enter the annual CTC." })
      .positive("Enter a positive annual CTC.")
      .max(1_000_000_000, "That amount is too large."),
    monthly_gross: z.coerce
      .number({ error: "Enter the monthly gross." })
      .positive("Enter a positive monthly gross.")
      .max(100_000_000, "That amount is too large."),
    payment_frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
    notes: z.string().max(2000).optional(),
    earnings: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Name the component.").max(120),
          amount: z.coerce
            .number({ error: "Enter an amount." })
            .min(0, "Cannot be negative.")
            .max(1_000_000_000),
          period: z.enum(["MONTHLY", "ANNUAL"]),
        }),
      )
      .max(20),
    deductions: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Name the deduction.").max(120),
          amount: z.coerce
            .number({ error: "Enter an amount." })
            .min(0, "Cannot be negative.")
            .max(1_000_000_000),
          period: z.enum(["MONTHLY", "ANNUAL"]),
        }),
      )
      .max(20),
  }),
  terms: z.object({
    probation: termField,
    leave_policy: termField,
    working_hours: termField,
    confidentiality: termField,
    notice_period: termField,
    termination: termField,
    company_policies: termField,
    joining_requirements: termField,
    additional_clauses: termField,
  }),
  internal_notes: z.string().max(4000, "Keep internal notes under 4,000 characters.").optional(),
});

export type OfferFormValues = z.infer<typeof offerFormSchema>;

export const emptyTerms: TermsDetails = {
  probation: "",
  leave_policy: "",
  working_hours: "",
  confidentiality: "",
  notice_period: "",
  termination: "",
  company_policies: "",
  joining_requirements: "",
  additional_clauses: "",
};

export function emptyOfferForm(company?: Company | null): OfferFormValues {
  const terms: TermsDetails = company?.default_terms
    ? { ...emptyTerms, ...company.default_terms }
    : emptyTerms;
  return {
    candidate_id: "",
    template_id: undefined,
    validity_days: company?.default_validity_days ?? 14,
    employment: {
      job_title: "",
      department: "",
      employment_type: "FULL_TIME",
      joining_date: "",
      work_location: company?.default_work_location ?? "",
      reporting_manager: "",
      probation_months: company?.default_probation_months ?? 3,
      working_days: company?.default_working_days ?? "",
      working_hours: company?.default_working_hours ?? "",
    },
    compensation: {
      annual_ctc: 0,
      monthly_gross: 0,
      payment_frequency: "MONTHLY",
      notes: "",
      earnings: [],
      deductions: [],
    },
    terms,
    internal_notes: "",
  };
}

export function offerFormFromDetail(offer: OfferDetail): OfferFormValues {
  return {
    candidate_id: offer.candidate_id,
    template_id: offer.template_id ?? undefined,
    validity_days: offer.validity_days,
    employment: {
      ...offer.data.employment,
      employment_type: offer.data.employment.employment_type,
    },
    compensation: {
      ...offer.data.compensation,
      notes: offer.data.compensation.notes ?? "",
      earnings: offer.data.compensation.earnings.map((item) => ({
        name: item.name,
        amount: item.amount,
        period: item.period,
      })),
      deductions: offer.data.compensation.deductions.map((item) => ({
        name: item.name,
        amount: item.amount,
        period: item.period,
      })),
    },
    terms: { ...emptyTerms, ...offer.data.terms },
    internal_notes: offer.internal_notes ?? "",
  };
}

export function toOfferData(values: OfferFormValues): OfferData {
  return {
    employment: {
      job_title: values.employment.job_title.trim(),
      department: values.employment.department.trim(),
      employment_type: values.employment.employment_type,
      joining_date: values.employment.joining_date,
      work_location: values.employment.work_location.trim(),
      reporting_manager: values.employment.reporting_manager.trim(),
      probation_months: values.employment.probation_months,
      working_days: values.employment.working_days.trim(),
      working_hours: values.employment.working_hours.trim(),
    },
    compensation: {
      currency: "INR",
      annual_ctc: values.compensation.annual_ctc,
      monthly_gross: values.compensation.monthly_gross,
      earnings: values.compensation.earnings.map((item) => ({
        name: item.name.trim(),
        amount: item.amount,
        period: item.period,
      })),
      deductions: values.compensation.deductions.map((item) => ({
        name: item.name.trim(),
        amount: item.amount,
        period: item.period,
      })),
      payment_frequency: values.compensation.payment_frequency,
      notes: values.compensation.notes?.trim() || null,
    },
    terms: {
      probation: values.terms.probation.trim(),
      leave_policy: values.terms.leave_policy.trim(),
      working_hours: values.terms.working_hours.trim(),
      confidentiality: values.terms.confidentiality.trim(),
      notice_period: values.terms.notice_period.trim(),
      termination: values.terms.termination.trim(),
      company_policies: values.terms.company_policies.trim(),
      joining_requirements: values.terms.joining_requirements.trim(),
      additional_clauses: values.terms.additional_clauses.trim(),
    },
  };
}

export const STEP_FIELDS = [
  ["candidate_id"],
  ["employment"],
  ["compensation"],
  ["terms"],
  ["validity_days", "internal_notes", "template_id"],
] as const;

export const STEP_LABELS = [
  { title: "Candidate", note: "Who the offer is for" },
  { title: "Role", note: "Position and joining" },
  { title: "Compensation", note: "Salary and components" },
  { title: "Terms", note: "Clauses and policies" },
  { title: "Review", note: "Preview and issue settings" },
];
