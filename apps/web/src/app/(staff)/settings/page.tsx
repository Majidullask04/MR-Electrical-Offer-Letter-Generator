"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/page-header";
import { AuditSettings } from "@/components/settings/audit-settings";
import { ClauseSettings } from "@/components/settings/clause-settings";
import { CompanySettings } from "@/components/settings/company-settings";
import { OutboxSettings } from "@/components/settings/outbox-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { TemplateSettings } from "@/components/settings/template-settings";
import { TrainingPolicySettings } from "@/components/settings/training-policy-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth";

type TabKey = "company" | "templates" | "clauses" | "training-policy" | "team" | "audit" | "outbox";

export default function SettingsPage() {
  return (
    <React.Suspense fallback={<SettingsFallback />}>
      <SettingsContent />
    </React.Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useSession();

  const requested = searchParams.get("tab") ?? "company";
  const allowed: TabKey[] = isAdmin
    ? ["company", "templates", "clauses", "training-policy", "team", "audit", "outbox"]
    : ["company", "templates", "clauses"];
  const active: TabKey = allowed.includes(requested as TabKey) ? (requested as TabKey) : "company";

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "company") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `/settings?${query}` : "/settings");
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        description="Company truth, letter templates, clause copy and staff access. Issued offers keep their own frozen snapshot, so later changes never rewrite history."
        meta={
          <span className="text-xs text-[var(--color-muted)]">
            {isAdmin
              ? "Super admin controls are available on this account."
              : "Some administration tabs are hidden for your role."}
          </span>
        }
      />

      <Tabs value={active} onValueChange={setTab}>
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="clauses">Clauses</TabsTrigger>
          {isAdmin ? <TabsTrigger value="training-policy">Training &amp; increment</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="team">Team</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="audit">Audit log</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="outbox">Outbox</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="company">
          <CompanySettings canEdit={isAdmin} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplateSettings canEdit={isAdmin} />
        </TabsContent>
        <TabsContent value="clauses">
          <ClauseSettings canEdit={isAdmin} />
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="training-policy">
            <TrainingPolicySettings canEdit={isAdmin} />
          </TabsContent>
        ) : null}
        {isAdmin ? (
          <TabsContent value="team">
            <TeamSettings />
          </TabsContent>
        ) : null}
        {isAdmin ? (
          <TabsContent value="audit">
            <AuditSettings />
          </TabsContent>
        ) : null}
        {isAdmin ? (
          <TabsContent value="outbox">
            <OutboxSettings />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function SettingsFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-10 w-full max-w-[720px]" />
      <div className="flex flex-col gap-3">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}
