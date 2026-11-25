"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DefinitionList, SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Company } from "@/lib/types";

const optionalText = (max: number, message = "That value is too long.") =>
  z.string().max(max, message).optional();

const schema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(160),
  legal_name: optionalText(200),
  tagline: optionalText(255),
  website: z
    .string()
    .max(255)
    .optional()
    .refine((value) => !value || /^https?:\/\/\S+$/i.test(value), "Use a full http(s) address."),
  email: z
    .string()
    .max(255)
    .optional()
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  phone: optionalText(50),
  address_line1: optionalText(255),
  address_line2: optionalText(255),
  city: optionalText(100),
  state: optionalText(100),
  postal_code: optionalText(20),
  country: optionalText(80),
  udyam_number: optionalText(60),
  gst_number: optionalText(30),
  cin_number: optionalText(40),
  logo_url: optionalText(500),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a six-digit hex colour, e.g. #b35010."),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a six-digit hex colour, e.g. #0e639c."),
  signatory_name: optionalText(160),
  signatory_title: optionalText(160),
  signatory_email: z
    .string()
    .max(255)
    .optional()
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  footer_note: optionalText(2000),
  offer_prefix: z.string().trim().min(1, "Enter a prefix.").max(20),
  official_offer_prefix: z.string().trim().min(2, "Enter an official prefix.").max(20),
  offer_number_format: z.string().trim().min(5, "Enter a number format.").max(80),
  company_intro: optionalText(4000),
  default_responsibilities: optionalText(4000),
  candidate_declaration: optionalText(2000),
  require_email: z.boolean().default(false),
  require_phone: z.boolean().default(false),
  require_department: z.boolean().default(false),
  show_candidate_signature_block: z.boolean().default(true),
  default_validity_days: z.coerce
    .number({ error: "Enter a validity period." })
    .int("Use whole days.")
    .min(1, "Use at least one day.")
    .max(90, "Use no more than 90 days."),
  default_probation_months: z.coerce
    .number({ error: "Enter a probation period." })
    .int("Use whole months.")
    .min(0, "Cannot be negative.")
    .max(12, "Use 12 months or fewer."),
  default_work_location: optionalText(200),
  default_working_days: optionalText(120),
  default_working_hours: optionalText(120),
});

type Values = z.infer<typeof schema>;

function valuesFromCompany(company: Company): Values {
  const gen = (company.generator_config ?? {}) as Record<string, unknown>;
  return {
    name: company.name,
    legal_name: company.legal_name ?? "",
    tagline: company.tagline ?? "",
    website: company.website ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    address_line1: company.address_line1 ?? "",
    address_line2: company.address_line2 ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    postal_code: company.postal_code ?? "",
    country: company.country ?? "",
    udyam_number: company.udyam_number ?? "",
    gst_number: company.gst_number ?? "",
    cin_number: company.cin_number ?? "",
    logo_url: company.logo_url ?? "",
    primary_color: company.primary_color,
    accent_color: company.accent_color,
    signatory_name: company.signatory_name ?? "",
    signatory_title: company.signatory_title ?? "",
    signatory_email: company.signatory_email ?? "",
    footer_note: company.footer_note ?? "",
    offer_prefix: company.offer_prefix,
    official_offer_prefix: company.official_offer_prefix ?? "MREW/OL",
    offer_number_format: company.offer_number_format ?? "{prefix}/{year}/{seq:06d}",
    company_intro: company.company_intro ?? "",
    default_responsibilities:
      typeof gen.default_responsibilities === "string" ? gen.default_responsibilities : "",
    candidate_declaration:
      typeof gen.candidate_declaration === "string" ? gen.candidate_declaration : "",
    require_email: Boolean(gen.require_email),
    require_phone: Boolean(gen.require_phone),
    require_department: Boolean(gen.require_department),
    show_candidate_signature_block: gen.show_candidate_signature_block !== false,
    default_validity_days: company.default_validity_days,
    default_probation_months: company.default_probation_months,
    default_work_location: company.default_work_location ?? "",
    default_working_days: company.default_working_days ?? "",
    default_working_hours: company.default_working_hours ?? "",
  };
}

function nullable(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function CompanySettings({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["company"], queryFn: api.company.get });
  const [signatureOverride, setSignatureOverride] = React.useState<string | null | undefined>(undefined);
  const [sealOverride, setSealOverride] = React.useState<string | null | undefined>(undefined);
  const signatureData =
    signatureOverride !== undefined ? signatureOverride : (query.data?.signature_image_data ?? null);
  const sealData =
    sealOverride !== undefined ? sealOverride : (query.data?.seal_image_data ?? null);

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: {
      name: "",
      primary_color: "#b35010",
      accent_color: "#0e639c",
      offer_prefix: "MEW-OL",
      official_offer_prefix: "MREW/OL",
      offer_number_format: "{prefix}/{year}/{seq:06d}",
      require_email: false,
      require_phone: false,
      require_department: false,
      show_candidate_signature_block: true,
      default_validity_days: 14,
      default_probation_months: 3,
    },
  });

  React.useEffect(() => {
    if (query.data) {
      form.reset(valuesFromCompany(query.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 400_000) {
      toast.error("Choose an image smaller than 400 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setter(reader.result);
    };
    reader.readAsDataURL(file);
  }

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api.company.update({
        name: values.name.trim(),
        legal_name: nullable(values.legal_name),
        tagline: nullable(values.tagline),
        website: nullable(values.website),
        email: nullable(values.email),
        phone: nullable(values.phone),
        address_line1: nullable(values.address_line1),
        address_line2: nullable(values.address_line2),
        city: nullable(values.city),
        state: nullable(values.state),
        postal_code: nullable(values.postal_code),
        country: nullable(values.country),
        udyam_number: nullable(values.udyam_number),
        gst_number: nullable(values.gst_number),
        cin_number: nullable(values.cin_number),
        logo_url: nullable(values.logo_url),
        primary_color: values.primary_color,
        accent_color: values.accent_color,
        signatory_name: nullable(values.signatory_name),
        signatory_title: nullable(values.signatory_title),
        signatory_email: nullable(values.signatory_email),
        signature_image_data: signatureData,
        seal_image_data: sealData,
        footer_note: nullable(values.footer_note),
        offer_prefix: values.offer_prefix.trim().toUpperCase(),
        official_offer_prefix: values.official_offer_prefix.trim().toUpperCase(),
        offer_number_format: values.offer_number_format.trim(),
        company_intro: nullable(values.company_intro),
        generator_config: {
          require_email: values.require_email,
          require_phone: values.require_phone,
          require_department: values.require_department,
          show_candidate_signature_block: values.show_candidate_signature_block,
          default_responsibilities: nullable(values.default_responsibilities),
          candidate_declaration: nullable(values.candidate_declaration),
        },
        default_validity_days: values.default_validity_days,
        default_probation_months: values.default_probation_months,
        default_work_location: nullable(values.default_work_location),
        default_working_days: nullable(values.default_working_days),
        default_working_hours: nullable(values.default_working_hours),
      }),
    onSuccess: (company) => {
      queryClient.setQueryData(["company"], company);
      form.reset(valuesFromCompany(company));
      setSignatureOverride(undefined);
      setSealOverride(undefined);
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Company profile saved. New drafts use these defaults.");
    },
    onError: (error) => form.setError("root", { message: errorMessage(error) }),
  });

  if (query.isPending) return <PanelSkeleton lines={8} />;

  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : "The company profile could not load."}
        onRetry={() => query.refetch()}
      />
    );
  }

  const company = query.data;

  if (!canEdit) {
    return <CompanyReadOnly company={company} />;
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      noValidate
    >
      <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-cool)] bg-[var(--color-cool-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
        <strong className="font-semibold">Company facts come from the public site.</strong> GST, CIN
        and legal policy text are deliberately blank until the company supplies them. Never fill
        them with invented values; every field here is editable.
      </div>

      <section aria-labelledby="identity-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="identity-heading"
          title="Identity"
          description="The trading name prints in the letterhead. The legal name and tagline are optional."
        />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company name" htmlFor="company-name" error={form.formState.errors.name?.message} required>
            <Input id="company-name" {...form.register("name")} />
          </Field>
          <Field label="Legal name" htmlFor="company-legal" error={form.formState.errors.legal_name?.message} hint="Leave blank if not published.">
            <Input id="company-legal" {...form.register("legal_name")} />
          </Field>
          <Field label="Tagline" htmlFor="company-tagline" error={form.formState.errors.tagline?.message}>
            <Input id="company-tagline" {...form.register("tagline")} />
          </Field>
          <Field label="Website" htmlFor="company-website" error={form.formState.errors.website?.message}>
            <Input id="company-website" type="url" inputMode="url" placeholder="https://" {...form.register("website")} />
          </Field>
          <Field label="Logo path or URL" htmlFor="company-logo" error={form.formState.errors.logo_url?.message} hint="Defaults to the bundled brand mark.">
            <Input id="company-logo" {...form.register("logo_url")} />
          </Field>
          <Field label="Draft prefix" htmlFor="company-prefix" error={form.formState.errors.offer_prefix?.message} hint="Internal draft reference prefix, e.g. MEW-OL." required>
            <Input id="company-prefix" {...form.register("offer_prefix")} />
          </Field>
          <Field label="Official Offer ID prefix" htmlFor="company-official-prefix" error={form.formState.errors.official_offer_prefix?.message} hint="Used when issuing, e.g. MREW/OL." required>
            <Input id="company-official-prefix" className="font-mono text-xs" {...form.register("official_offer_prefix")} />
          </Field>
          <Field label="Official Offer ID format" htmlFor="company-official-format" error={form.formState.errors.offer_number_format?.message} hint="Tokens: {prefix}, {year}, {seq:06d}." required>
            <Input id="company-official-format" className="font-mono text-xs" {...form.register("offer_number_format")} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="contact-heading" className="flex flex-col gap-4">
        <SectionHeading id="contact-heading" title="Contact and address" description="Printed in the letterhead and the candidate portal." />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email" htmlFor="company-email" error={form.formState.errors.email?.message}>
            <Input id="company-email" type="email" inputMode="email" {...form.register("email")} />
          </Field>
          <Field label="Phone" htmlFor="company-phone" error={form.formState.errors.phone?.message}>
            <Input id="company-phone" type="tel" inputMode="tel" {...form.register("phone")} />
          </Field>
          <Field label="Country" htmlFor="company-country" error={form.formState.errors.country?.message}>
            <Input id="company-country" {...form.register("country")} />
          </Field>
          <Field label="Address line 1" htmlFor="company-address1" error={form.formState.errors.address_line1?.message} className="sm:col-span-2">
            <Input id="company-address1" autoComplete="address-line1" {...form.register("address_line1")} />
          </Field>
          <Field label="Address line 2" htmlFor="company-address2" error={form.formState.errors.address_line2?.message}>
            <Input id="company-address2" autoComplete="address-line2" {...form.register("address_line2")} />
          </Field>
          <Field label="City" htmlFor="company-city" error={form.formState.errors.city?.message}>
            <Input id="company-city" autoComplete="address-level2" {...form.register("city")} />
          </Field>
          <Field label="State" htmlFor="company-state" error={form.formState.errors.state?.message}>
            <Input id="company-state" autoComplete="address-level1" {...form.register("state")} />
          </Field>
          <Field label="Postal code" htmlFor="company-postal" error={form.formState.errors.postal_code?.message}>
            <Input id="company-postal" autoComplete="postal-code" {...form.register("postal_code")} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="registrations-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="registrations-heading"
          title="Registrations"
          description="Only the Udyam number is published. GST and CIN stay blank until the company provides them."
        />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Udyam number" htmlFor="company-udyam" error={form.formState.errors.udyam_number?.message}>
            <Input id="company-udyam" className="font-mono text-xs" {...form.register("udyam_number")} />
          </Field>
          <Field label="GSTIN" htmlFor="company-gst" error={form.formState.errors.gst_number?.message} hint="Leave blank if not supplied.">
            <Input id="company-gst" className="font-mono text-xs" {...form.register("gst_number")} />
          </Field>
          <Field label="CIN" htmlFor="company-cin" error={form.formState.errors.cin_number?.message} hint="Leave blank if not supplied.">
            <Input id="company-cin" className="font-mono text-xs" {...form.register("cin_number")} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="defaults-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="defaults-heading"
          title="Letter defaults"
          description="Prefilled into new drafts. Every offer can override these values."
        />
        <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Validity (days)" htmlFor="company-validity" error={form.formState.errors.default_validity_days?.message} required>
            <Input id="company-validity" type="number" min={1} max={90} step={1} inputMode="numeric" {...form.register("default_validity_days")} />
          </Field>
          <Field label="Probation (months)" htmlFor="company-probation" error={form.formState.errors.default_probation_months?.message} required>
            <Input id="company-probation" type="number" min={0} max={12} step={1} inputMode="numeric" {...form.register("default_probation_months")} />
          </Field>
          <Field label="Primary colour" htmlFor="company-primary" error={form.formState.errors.primary_color?.message} required>
            <div className="flex items-center gap-2">
              <Input id="company-primary" className="font-mono text-xs" {...form.register("primary_color")} />
              <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-[6px] border border-[var(--color-rule-2)]" style={{ background: company.primary_color }} />
            </div>
          </Field>
          <Field label="Accent colour" htmlFor="company-accent" error={form.formState.errors.accent_color?.message} required>
            <div className="flex items-center gap-2">
              <Input id="company-accent" className="font-mono text-xs" {...form.register("accent_color")} />
              <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-[6px] border border-[var(--color-rule-2)]" style={{ background: company.accent_color }} />
            </div>
          </Field>
          <Field label="Work location" htmlFor="company-location" error={form.formState.errors.default_work_location?.message} className="sm:col-span-2">
            <Input id="company-location" {...form.register("default_work_location")} />
          </Field>
          <Field label="Working days" htmlFor="company-days" error={form.formState.errors.default_working_days?.message}>
            <Input id="company-days" {...form.register("default_working_days")} />
          </Field>
          <Field label="Working hours" htmlFor="company-hours" error={form.formState.errors.default_working_hours?.message}>
            <Input id="company-hours" {...form.register("default_working_hours")} />
          </Field>
          <Field label="Footer note" htmlFor="company-footer" error={form.formState.errors.footer_note?.message} className="sm:col-span-2 lg:col-span-4">
            <Textarea id="company-footer" rows={2} {...form.register("footer_note")} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="signatory-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="signatory-heading"
          title="Signatory"
          description="The person who signs the letter. Templates may override these fields."
        />
        <div className="grid gap-x-5 sm:grid-cols-3">
          <Field label="Name" htmlFor="company-signatory" error={form.formState.errors.signatory_name?.message}>
            <Input id="company-signatory" autoComplete="name" {...form.register("signatory_name")} />
          </Field>
          <Field label="Title" htmlFor="company-signatory-title" error={form.formState.errors.signatory_title?.message}>
            <Input id="company-signatory-title" {...form.register("signatory_title")} />
          </Field>
          <Field label="Email" htmlFor="company-signatory-email" error={form.formState.errors.signatory_email?.message}>
            <Input id="company-signatory-email" type="email" inputMode="email" {...form.register("signatory_email")} />
          </Field>
        </div>

        <div className="grid gap-5 border-t border-[var(--color-rule)] pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[var(--color-ink-2)]">
              Company-approved signature image (optional)
            </span>
            {signatureData ? (
              <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-white p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureData} alt="Signature preview" className="h-12 max-w-[180px] object-contain" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setSignatureOverride(null)}>
                  Remove
                </Button>
              </div>
            ) : null}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleImageUpload(e, setSignatureOverride)}
              className="text-xs text-[var(--color-muted)]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[var(--color-ink-2)]">
              Company seal image (optional)
            </span>
            {sealData ? (
              <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-rule)] bg-white p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sealData} alt="Company seal preview" className="h-12 w-12 object-contain" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setSealOverride(null)}>
                  Remove
                </Button>
              </div>
            ) : null}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleImageUpload(e, setSealOverride)}
              className="text-xs text-[var(--color-muted)]"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="generator-cfg-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="generator-cfg-heading"
          title="Offer generator defaults & required fields"
          description="Configure company introduction text, candidate declaration, and which fields are required in the Offer Letter Generator."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company introduction (optional)" htmlFor="company-intro" className="sm:col-span-2">
            <Textarea id="company-intro" rows={2} placeholder="Printed at the start of generated offer letters if supplied." {...form.register("company_intro")} />
          </Field>
          <Field label="Default responsibilities (optional)" htmlFor="company-resp" className="sm:col-span-2">
            <Textarea id="company-resp" rows={2} {...form.register("default_responsibilities")} />
          </Field>
          <Field label="Candidate declaration text (optional)" htmlFor="company-decl" className="sm:col-span-2">
            <Textarea id="company-decl" rows={2} placeholder="e.g. I accept the terms of this offer and confirm my joining date." {...form.register("candidate_declaration")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("require_email")} />
            Require candidate email
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("require_phone")} />
            Require mobile number
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("require_department")} />
            Require department
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-accent)]" {...form.register("show_candidate_signature_block")} />
            Include candidate signature section
          </label>
        </div>
      </section>

      {form.formState.errors.root?.message ? (
        <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-1 py-3">
        <p className="text-xs text-[var(--color-muted)]">
          Last saved {formatDateTime(company.updated_at)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => form.reset(valuesFromCompany(company))}
            disabled={!form.formState.isDirty || mutation.isPending}
          >
            Discard changes
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Save company profile
          </Button>
        </div>
      </div>
    </form>
  );
}

function CompanyReadOnly({ company }: { company: Company }) {
  const missing = (value: string | null) =>
    value ? value : <span className="text-[var(--color-muted)]">Not set</span>;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-cool)] bg-[var(--color-cool-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
        You can read the company profile. A super admin controls changes to the letterhead,
        registrations and defaults.
      </div>

      <section aria-labelledby="readonly-identity" className="flex flex-col gap-4">
        <SectionHeading id="readonly-identity" title="Identity and contact" />
        <DefinitionList
          columns={2}
          items={[
            { term: "Company name", detail: company.name },
            { term: "Legal name", detail: missing(company.legal_name) },
            { term: "Tagline", detail: missing(company.tagline) },
            { term: "Website", detail: company.website ? <a className="text-[var(--color-cool-deep)] hover:underline" href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : missing(null) },
            { term: "Email", detail: missing(company.email) },
            { term: "Phone", detail: missing(company.phone) },
            {
              term: "Address",
              detail: [company.address_line1, company.address_line2, company.city, company.state, company.postal_code, company.country]
                .filter(Boolean)
                .join(", ") || missing(null),
            },
            { term: "Udyam", detail: company.udyam_number ? <span className="mono text-xs">{company.udyam_number}</span> : missing(null) },
            { term: "GSTIN", detail: company.gst_number ? <span className="mono text-xs">{company.gst_number}</span> : missing(null) },
            { term: "CIN", detail: company.cin_number ? <span className="mono text-xs">{company.cin_number}</span> : missing(null) },
          ]}
        />
      </section>

      <section aria-labelledby="readonly-defaults" className="flex flex-col gap-4">
        <SectionHeading id="readonly-defaults" title="Letter defaults" />
        <DefinitionList
          columns={3}
          items={[
            { term: "Offer prefix", detail: <span className="mono text-xs">{company.offer_prefix}</span> },
            { term: "Validity", detail: `${company.default_validity_days} days` },
            { term: "Probation", detail: `${company.default_probation_months} months` },
            { term: "Work location", detail: missing(company.default_work_location) },
            { term: "Working days", detail: missing(company.default_working_days) },
            { term: "Working hours", detail: missing(company.default_working_hours) },
          ]}
        />
      </section>

      <section aria-labelledby="readonly-signatory" className="flex flex-col gap-4">
        <SectionHeading id="readonly-signatory" title="Signatory" />
        <DefinitionList
          columns={3}
          items={[
            { term: "Name", detail: missing(company.signatory_name) },
            { term: "Title", detail: missing(company.signatory_title) },
            { term: "Email", detail: missing(company.signatory_email) },
          ]}
        />
      </section>
    </div>
  );
}
