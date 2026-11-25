"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your work email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginShell />}>
      <LoginContent />
    </React.Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const nextParam = searchParams.get("next") ?? "";
  const nextPath = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.auth.me,
    retry: false,
    staleTime: 0,
  });

  React.useEffect(() => {
    if (session.data) router.replace(nextPath);
  }, [nextPath, router, session.data]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: Values) => api.auth.login(values.email, values.password),
    onSuccess: (user) => {
      queryClient.setQueryData(["session"], user);
      router.replace(nextPath);
      router.refresh();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Sign-in failed. Check your connection and try again.";
      form.setError("root", { message });
    },
  });

  return (
    <LoginShell>
      {session.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-10 w-32" />
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-2xl text-[var(--color-ink)]">Staff sign in</h2>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">
              Use the account your administrator created for the offer desk.
            </p>
          </div>

          <Field
            label="Work email"
            htmlFor="email"
            error={form.formState.errors.email?.message}
            required
          >
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="name@mrelectricalworks.in"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            error={form.formState.errors.password?.message}
            required
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register("password")}
            />
          </Field>

          {form.formState.errors.root?.message ? (
            <div
              role="alert"
              className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-bad)] bg-[var(--color-bad-soft)] px-3 py-2.5 text-sm text-[var(--color-bad)]"
            >
              {form.formState.errors.root.message}
            </div>
          ) : null}

          <Button type="submit" variant="primary" size="lg" loading={mutation.isPending} className="mt-1 w-full">
            Sign in
            <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          </Button>

          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            Candidates do not sign in here. They open the secure link in their offer email.
          </p>
        </form>
      )}
    </LoginShell>
  );
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)]">
      <header className="border-b border-[var(--color-rule)]">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            href="/login"
            className="flex items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-focus)]"
            aria-label="OfferLater sign in"
          >
            <Image src="/brand/logo.png" alt="" width={32} height={32} className="h-8 w-8" priority />
            <span className="flex flex-col leading-none">
              <span className="font-display text-[13px] font-semibold tracking-[-0.01em]">
                MR. ELECTRICAL WORKS
              </span>
              <span className="mono mt-1 text-[10px] text-[var(--color-muted)]">OfferLater</span>
            </span>
          </Link>
          <span className="mono hidden text-[10px] text-[var(--color-muted)] sm:block">
            Offer desk · Patancheru
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] flex-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-16">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="mono text-xs text-[var(--color-accent-deep)]">Offer operations</p>
            <h1 className="max-w-[18ch] font-display text-3xl leading-[1.08] text-[var(--color-ink)] sm:text-[2.35rem]">
              Every offer, measured from draft to answer.
            </h1>
            <p className="prose-copy text-base leading-relaxed text-[var(--color-muted)]">
              Draft on the company letterhead, route for approval, issue through a private link,
              and keep an immutable record of what the candidate saw and when they responded.
            </p>
          </div>

          <LifecyclePreview />

          <dl className="grid max-w-[560px] grid-cols-2 gap-x-8 gap-y-4 border-t border-[var(--color-rule)] pt-5 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Offer desk</dt>
              <dd className="text-sm font-semibold text-[var(--color-ink)]">MR. ELECTRICAL WORKS</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Registered location</dt>
              <dd className="text-sm text-[var(--color-ink-2)]">Patancheru, Telangana</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-[var(--color-muted)]">Udyam</dt>
              <dd className="mono text-xs text-[var(--color-ink-2)]">UDYAM-TS-25-0046549</dd>
            </div>
          </dl>
        </section>

        <section className="w-full justify-self-end">
          <div className="surface-sheet w-full max-w-[430px] p-6 shadow-[var(--shadow-panel)] sm:p-8">
            {children}
          </div>
          <p className="mt-4 max-w-[430px] text-xs leading-relaxed text-[var(--color-muted)]">
            Authorised staff only. Sessions are held in an HttpOnly cookie and expire automatically.
          </p>
        </section>
      </main>

      <footer className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-[var(--color-muted)] sm:px-8">
          <p>No. 83, Gokul Nagar, Patancheru, Hyderabad, Telangana 502319</p>
          <p className="mono text-[10px]">+91 85199 49762</p>
        </div>
      </footer>
    </div>
  );
}

function LifecyclePreview() {
  const stages = [
    { label: "Draft", note: "Letterhead" },
    { label: "Approval", note: "Two roles" },
    { label: "Issue", note: "Private link" },
    { label: "Response", note: "Recorded" },
  ];
  return (
    <div className="max-w-[560px] rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--color-ink-2)]">Offer lifecycle</p>
        <p className="mono text-[10px] text-[var(--color-muted)]">4 checkpoints</p>
      </div>
      <ol className="grid grid-cols-4 gap-0">
        {stages.map((stage, index) => (
          <li key={stage.label} className="relative flex flex-col gap-2 pr-3">
            <span
              aria-hidden="true"
              className="absolute left-0 right-0 top-[5px] h-px bg-[var(--color-rule-2)]"
            />
            <span
              aria-hidden="true"
              className="relative h-[11px] w-[11px] rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-paper-2)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-[var(--color-ink)]">{stage.label}</span>
              <span className="mono text-[9px] text-[var(--color-muted)]">{stage.note}</span>
            </span>
            <span className="mono text-[9px] text-[var(--color-faint)]">
              {String(index + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
