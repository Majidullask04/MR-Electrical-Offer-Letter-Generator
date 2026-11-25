"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCw, Send } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { SectionHeading } from "@/components/page-header";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PanelSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber, relativeTime, titleCase } from "@/lib/format";

export function OutboxSettings() {
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["settings-summary"], queryFn: api.settings.summary });
  const outbox = useQuery({ queryKey: ["outbox"], queryFn: () => api.settings.outbox(50) });

  const [confirmExpire, setConfirmExpire] = React.useState(false);
  const [emailView, setEmailView] = React.useState<{ subject: string; html: string } | null>(null);

  const jobMutation = useMutation({
    mutationFn: (job: "expire" | "remind") => api.settings.runJob(job),
    onSuccess: (result, job) => {
      toast.success(result.message || (job === "expire" ? "Expiry job finished." : "Reminders queued."));
      queryClient.invalidateQueries({ queryKey: ["outbox"] });
      queryClient.invalidateQueries({ queryKey: ["settings-summary"] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setConfirmExpire(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const htmlMutation = useMutation({
    mutationFn: (row: { id: string; subject: string }) => api.settings.outboxHtml(row.id),
    onSuccess: (html, row) => setEmailView({ subject: row.subject, html }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (summary.isPending) return <PanelSkeleton lines={6} />;

  if (summary.isError) {
    return (
      <ErrorState
        message={summary.error instanceof Error ? summary.error.message : "Settings could not load."}
        onRetry={() => summary.refetch()}
      />
    );
  }

  const counts = summary.data;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Email outbox and maintenance"
        description="Every notification is stored before delivery. In development the console provider records the message here instead of sending it."
        actions={
          <Button variant="secondary" size="sm" onClick={() => outbox.refetch()} loading={outbox.isFetching}>
            <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <dl className="grid gap-x-6 gap-y-4 border-y border-[var(--color-rule)] py-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-[var(--color-muted)]">Offers</dt>
          <dd className="figure text-2xl text-[var(--color-ink)]">{formatNumber(counts.offers)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-[var(--color-muted)]">Email records</dt>
          <dd className="figure text-2xl text-[var(--color-ink)]">{formatNumber(counts.email_records)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-[var(--color-muted)]">Audit records</dt>
          <dd className="figure text-2xl text-[var(--color-ink)]">{formatNumber(counts.audit_records)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-[var(--color-muted)]">Environment</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--color-ink)]">{titleCase(counts.environment)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirmExpire(true)}
          loading={jobMutation.isPending && jobMutation.variables === "expire"}
        >
          Expire stale offers
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => jobMutation.mutate("remind")}
          loading={jobMutation.isPending && jobMutation.variables === "remind"}
        >
          <Send size={13} strokeWidth={2} aria-hidden="true" />
          Queue expiry reminders
        </Button>
        <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
          In production, schedule these jobs with a cron worker. Running them here is safe and
          idempotent.
        </p>
      </div>

      {outbox.isPending ? (
        <TableSkeleton rows={6} columns={5} />
      ) : outbox.isError ? (
        <ErrorState
          message={outbox.error instanceof Error ? outbox.error.message : "The outbox could not load."}
          onRetry={() => outbox.refetch()}
        />
      ) : outbox.data.length === 0 ? (
        <EmptyState
          title="No email records yet"
          description="Issuing, viewing or responding to an offer creates a notification record. The console provider stores the rendered email without sending it."
        />
      ) : (
        <div className="scroll-x">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Created</th>
                <th scope="col">Recipient</th>
                <th scope="col">Subject</th>
                <th scope="col">Status</th>
                <th scope="col">Provider</th>
                <th scope="col" className="text-right">Message</th>
              </tr>
            </thead>
            <tbody>
              {outbox.data.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    <span className="block text-xs text-[var(--color-ink-2)]">{relativeTime(row.created_at)}</span>
                    <span className="mono block text-[9px] text-[var(--color-muted)]">
                      {formatDateTime(row.created_at)}
                    </span>
                  </td>
                  <td className="max-w-[190px] truncate text-xs text-[var(--color-ink-2)]">{row.recipient}</td>
                  <td className="max-w-[280px]">
                    <span className="block truncate text-xs text-[var(--color-ink-2)]">{row.subject}</span>
                    <span className="mono block text-[9px] text-[var(--color-muted)]">{row.template_key}</span>
                  </td>
                  <td>
                    <span
                      className={
                        row.status.toLowerCase() === "failed"
                          ? "inline-flex rounded-[var(--radius-tag)] bg-[var(--color-bad-soft)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-bad)]"
                          : row.status.toLowerCase() === "sent"
                            ? "inline-flex rounded-[var(--radius-tag)] bg-[var(--color-ok-soft)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-ok)]"
                            : "inline-flex rounded-[var(--radius-tag)] bg-[var(--color-paper-3)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-ink-2)]"
                      }
                    >
                      {titleCase(row.status)}
                    </span>
                    {row.error ? (
                      <span className="mt-1 block max-w-[180px] truncate text-[9px] text-[var(--color-bad)]" title={row.error}>
                        {row.error}
                      </span>
                    ) : null}
                  </td>
                  <td className="mono whitespace-nowrap text-[10px] text-[var(--color-muted)]">{row.provider}</td>
                  <td>
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => htmlMutation.mutate({ id: row.id, subject: row.subject })}
                        loading={htmlMutation.isPending && htmlMutation.variables?.id === row.id}
                      >
                        <Eye size={12} strokeWidth={2} aria-hidden="true" />
                        View
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ActionDialog
        open={confirmExpire}
        onOpenChange={setConfirmExpire}
        title="Expire stale offers?"
        description="Offers past their response window move to EXPIRED and their candidate links are revoked. This cannot be undone; start a revision if a candidate still needs the offer."
        confirmLabel="Run expiry job"
        loading={jobMutation.isPending}
        onConfirm={() => jobMutation.mutate("expire")}
      />

      <Dialog open={emailView !== null} onOpenChange={(open) => !open && setEmailView(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{emailView?.subject ?? "Email record"}</DialogTitle>
            <DialogDescription>
              Stored at send time. Links in the message may have been revoked since.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-rule-2)] bg-white">
            {emailView ? (
              <iframe
                title="Stored email"
                srcDoc={emailView.html}
                sandbox=""
                className="h-[520px] w-full bg-white"
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEmailView(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
