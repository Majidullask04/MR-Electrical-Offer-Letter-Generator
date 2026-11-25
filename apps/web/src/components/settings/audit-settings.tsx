"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import * as React from "react";

import { SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/format";

const ENTITY_OPTIONS = [
  { value: "", label: "All entities" },
  { value: "offer", label: "Offer" },
  { value: "candidate", label: "Candidate" },
  { value: "user", label: "Staff user" },
  { value: "company_profile", label: "Company profile" },
  { value: "offer_template", label: "Letter template" },
  { value: "template_block", label: "Clause block" },
];

export function AuditSettings() {
  const [actionInput, setActionInput] = React.useState("");
  const [action, setAction] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const [page, setPage] = React.useState(1);

  const query = useQuery({
    queryKey: ["audit", { action, entity, page }],
    queryFn: () =>
      api.audit.list({
        action: action || undefined,
        entity_type: entity || undefined,
        page,
        page_size: 30,
      }),
  });

  function apply(event: React.FormEvent) {
    event.preventDefault();
    setAction(actionInput.trim());
    setPage(1);
  }

  function clear() {
    setActionInput("");
    setAction("");
    setEntity("");
    setPage(1);
  }

  const hasFilters = Boolean(action || entity);
  const data = query.data;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Audit log"
        description="Every state change that matters: offers, candidates, templates, company settings and staff accounts."
      />

      <form onSubmit={apply} className="flex flex-wrap items-end gap-3" role="search">
        <Field label="Action contains" htmlFor="audit-action" className="w-[220px]">
          <Input
            id="audit-action"
            value={actionInput}
            onChange={(event) => setActionInput(event.target.value)}
            placeholder="offer.approved"
            className="font-mono text-xs"
          />
        </Field>
        <Field label="Entity" htmlFor="audit-entity" className="w-[190px]">
          <Select
            id="audit-entity"
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value);
              setPage(1);
            }}
          >
            {ENTITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          <Search size={13} strokeWidth={2} aria-hidden="true" />
          Apply
        </Button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X size={13} strokeWidth={2} aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        {data ? (
          <p className="ml-auto text-xs text-[var(--color-muted)]">
            <span className="mono text-[var(--color-ink-2)]">{formatNumber(data.total)}</span>{" "}
            {data.total === 1 ? "record" : "records"}
          </p>
        ) : null}
      </form>

      {query.isPending ? (
        <TableSkeleton rows={10} columns={5} />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "The audit log could not load."}
          onRetry={() => query.refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="No audit records match"
          description="Try a shorter action fragment or a different entity. Records appear as staff make changes."
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : data ? (
        <div className="flex flex-col">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                  <th scope="col">Context</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">
                      <span className="block text-xs text-[var(--color-ink-2)]">
                        {relativeTime(entry.created_at)}
                      </span>
                      <span className="mono block text-[9px] text-[var(--color-muted)]">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-[var(--color-ink-2)]">
                      {entry.actor_email ?? "System"}
                      {entry.ip_address ? (
                        <span className="mono mt-0.5 block text-[9px] text-[var(--color-muted)]">
                          {entry.ip_address}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <code className="mono text-[11px] text-[var(--color-ink)]">{entry.action}</code>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="text-xs text-[var(--color-ink-2)]">{entry.entity_type}</span>
                      {entry.entity_id ? (
                        <span className="mono mt-0.5 block max-w-[150px] truncate text-[9px] text-[var(--color-muted)]">
                          {entry.entity_id}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <details className="max-w-[360px]">
                          <summary className="cursor-pointer text-[10px] font-semibold text-[var(--color-cool-deep)]">
                            View metadata
                          </summary>
                          <pre className="mono mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-[4px] bg-[var(--color-paper-2)] p-2 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-[10px] text-[var(--color-muted)]">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            pageSize={data.page_size}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </div>
  );
}
