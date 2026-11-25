"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  Eye,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader, SectionHeading } from "@/components/page-header";
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
import { Field, Input, Textarea } from "@/components/ui/field";
import { PanelSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, RestrictedState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { LetterTemplate, TemplateBlock } from "@/lib/types";

const PLACEHOLDERS = [
  "{{company_name}}",
  "{{company_intro}}",
  "{{candidate_name}}",
  "{{candidate_code}}",
  "{{job_title}}",
  "{{department}}",
  "{{employment_duration}}",
  "{{joining_date}}",
  "{{annual_ctc}}",
  "{{monthly_salary}}",
  "{{official_offer_number}}",
  "{{offer_number}}",
  "{{offer_date}}",
  "{{expiry_date}}",
  "{{work_location}}",
  "{{reporting_manager}}",
  "{{signature_image_data}}",
  "{{seal_image_data}}",
  "{{verification_qr_data_uri}}",
  "{{verification_url}}",
  "{{employment_table|safe}}",
  "{{compensation_table|safe}}",
  "{{terms_html|safe}}",
];

const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Plus Jakarta Sans", sans-serif; color: #121417; padding: 28px; line-height: 1.55; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .meta { font-size: 12px; color: #5c6470; margin-bottom: 18px; }
  </style>
</head>
<body>
  <h1>{{company_name}} — Offer of Employment</h1>
  <p class="meta">Ref: {{offer_number}} | Date: {{offer_date}} | Valid until: {{expiry_date}}</p>
  <p>Dear {{candidate_name}},</p>
  <p>We are pleased to offer you the position of <strong>{{job_title}}</strong> starting on <strong>{{joining_date}}</strong>.</p>
  <h2>Employment Details</h2>
  {{employment_table|safe}}
  <h2>Compensation ({{annual_ctc}} / year)</h2>
  {{compensation_table|safe}}
  <h2>Terms &amp; Conditions</h2>
  {{terms_html|safe}}
  <p style="margin-top: 24px;">Sincerely,<br><strong>{{signatory_name}}</strong><br>{{signatory_title}}</p>
</body>
</html>`;

export default function TemplatesPage() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates.list,
  });

  const blocksQuery = useQuery({
    queryKey: ["template-blocks"],
    queryFn: api.templates.blocks,
  });

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<LetterTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<LetterTemplate | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const [blockDialogOpen, setBlockDialogOpen] = React.useState(false);
  const [editingBlock, setEditingBlock] = React.useState<TemplateBlock | null>(null);
  const [deleteBlockTarget, setDeleteBlockTarget] = React.useState<TemplateBlock | null>(null);

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.templates.duplicate(id),
    onSuccess: (created) => {
      toast.success(`Created "${created.name}".`);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => api.templates.makeDefault(id),
    onSuccess: (updated) => {
      toast.success(`"${updated.name}" is now the default template.`);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (template: LetterTemplate) =>
      api.templates.update(template.id, { is_active: !template.is_active }),
    onSuccess: (updated) => {
      toast.success(updated.is_active ? "Template activated." : "Template deactivated.");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.remove(id),
    onSuccess: () => {
      toast.success("Template deleted.");
      setDeleteTarget(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => setDeleteError(errorMessage(err)),
  });

  const previewMutation = useMutation({
    mutationFn: async (template: LetterTemplate) => {
      const res = await api.templates.preview(template.html_content);
      return { html: res.html, name: template.name };
    },
    onSuccess: ({ html, name }) => {
      setPreviewTitle(name);
      setPreviewHtml(html);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => api.templates.removeBlock(id),
    onSuccess: () => {
      toast.success("Content block deleted.");
      setDeleteBlockTarget(null);
      queryClient.invalidateQueries({ queryKey: ["template-blocks"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function openCreateTemplate() {
    setEditingTemplate(null);
    setEditorOpen(true);
  }

  function openEditTemplate(template: LetterTemplate) {
    setEditingTemplate(template);
    setEditorOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offer templates"
        description="Manage Jinja-sandboxed HTML letterheads, signatory overrides, default templates, and reusable clause blocks."
        actions={
          isAdmin ? (
            <Button variant="primary" onClick={openCreateTemplate}>
              New template
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      {!isAdmin ? (
        <RestrictedState
          title="Read-only template view"
          message="Only Super Admins can create, edit, duplicate, or set default offer templates and content blocks. You can preview any template here."
        />
      ) : null}

      <Tabs defaultValue="templates">
        <TabsList aria-label="Template sections">
          <TabsTrigger value="templates">
            Letter templates
            {templatesQuery.data ? (
              <span className="mono text-[10px] text-[var(--color-muted)]">
                {templatesQuery.data.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="blocks">
            Reusable content blocks
            {blocksQuery.data ? (
              <span className="mono text-[10px] text-[var(--color-muted)]">
                {blocksQuery.data.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          {templatesQuery.isPending ? (
            <PanelSkeleton lines={6} />
          ) : templatesQuery.isError ? (
            <ErrorState
              message={errorMessage(templatesQuery.error)}
              onRetry={() => templatesQuery.refetch()}
            />
          ) : templatesQuery.data.length === 0 ? (
            <EmptyState
              title="No offer templates configured"
              description="Create the first HTML letterhead template so HR can preview and issue PDF offers."
              action={
                isAdmin ? (
                  <Button variant="primary" size="sm" onClick={openCreateTemplate}>
                    Create template
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {templatesQuery.data.map((template) => (
                <article
                  key={template.id}
                  className="flex flex-col justify-between gap-4 rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)] p-5"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg text-[var(--color-ink)]">
                          {template.name}
                        </h2>
                        <span className="mono rounded-[var(--radius-tag)] bg-[var(--color-paper-3)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-2)]">
                          v{template.version}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {template.is_default ? (
                          <span className="inline-flex items-center gap-1 rounded-[var(--radius-tag)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent-deep)]">
                            <Star size={10} strokeWidth={2.2} aria-hidden="true" />
                            Default
                          </span>
                        ) : null}
                        <span
                          className={
                            template.is_active
                              ? "rounded-[var(--radius-tag)] bg-[var(--color-ok-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ok)]"
                              : "rounded-[var(--radius-tag)] bg-[var(--color-paper-3)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted)]"
                          }
                        >
                          {template.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                      {template.description || "HTML offer letter template."}
                    </p>

                    <dl className="mt-1 grid gap-2 border-t border-[var(--color-rule)] pt-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] text-[var(--color-muted)]">Signatory override</dt>
                        <dd className="text-[var(--color-ink-2)]">
                          {template.signatory_name
                            ? `${template.signatory_name}${template.signatory_title ? ` · ${template.signatory_title}` : ""}`
                            : "Uses company default"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[var(--color-muted)]">Last updated</dt>
                        <dd className="mono text-[11px] text-[var(--color-muted)]">
                          {formatDateTime(template.updated_at)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-rule)] pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={
                        previewMutation.isPending && previewMutation.variables?.id === template.id
                      }
                      onClick={() => previewMutation.mutate(template)}
                    >
                      <Eye size={13} strokeWidth={2} aria-hidden="true" />
                      Preview
                    </Button>
                    {isAdmin ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditTemplate(template)}
                        >
                          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={
                            duplicateMutation.isPending &&
                            duplicateMutation.variables === template.id
                          }
                          onClick={() => duplicateMutation.mutate(template.id)}
                        >
                          <Copy size={13} strokeWidth={2} aria-hidden="true" />
                          Duplicate
                        </Button>
                        {!template.is_default && template.is_active ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={
                              defaultMutation.isPending &&
                              defaultMutation.variables === template.id
                            }
                            onClick={() => defaultMutation.mutate(template.id)}
                          >
                            <CheckCircle2 size={13} strokeWidth={2} aria-hidden="true" />
                            Set default
                          </Button>
                        ) : null}
                        {!template.is_default ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate(template)}
                          >
                            {template.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        ) : null}
                        {!template.is_default ? (
                          <Button
                            variant="danger-outline"
                            size="sm"
                            onClick={() => {
                              setDeleteTarget(template);
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                            Delete
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="blocks">
          <div className="flex flex-col gap-4">
            <SectionHeading
              title="Reusable content blocks"
              description="Reference these in HTML templates using {{blocks.block_key}}."
              actions={
                isAdmin ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingBlock(null);
                      setBlockDialogOpen(true);
                    }}
                  >
                    <Plus size={14} strokeWidth={2} aria-hidden="true" />
                    Add block
                  </Button>
                ) : null
              }
            />

            {blocksQuery.isPending ? (
              <TableSkeleton rows={4} columns={4} />
            ) : blocksQuery.isError ? (
              <ErrorState
                message={errorMessage(blocksQuery.error)}
                onRetry={() => blocksQuery.refetch()}
              />
            ) : blocksQuery.data.length === 0 ? (
              <EmptyState
                title="No reusable blocks yet"
                description="Create shared policy snippets or boilerplate paragraphs to reuse across offer templates."
              />
            ) : (
              <div className="scroll-x rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-sheet)]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Key &amp; tag</th>
                      <th scope="col">Name</th>
                      <th scope="col">Content excerpt</th>
                      <th scope="col">Updated</th>
                      {isAdmin ? (
                        <th scope="col" className="text-right">
                          Actions
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {blocksQuery.data.map((block) => (
                      <tr key={block.id}>
                        <td className="whitespace-nowrap">
                          <span className="mono text-xs font-semibold text-[var(--color-ink)]">
                            {block.key}
                          </span>
                          <span className="mono block text-[10px] text-[var(--color-cool-deep)]">
                            {`{{blocks.${block.key}}}`}
                          </span>
                        </td>
                        <td>
                          <span className="block text-sm font-medium text-[var(--color-ink)]">
                            {block.name}
                          </span>
                          {block.description ? (
                            <span className="block text-xs text-[var(--color-muted)]">
                              {block.description}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[380px]">
                          <p className="line-clamp-2 text-xs text-[var(--color-muted)]">
                            {block.content}
                          </p>
                        </td>
                        <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                          {formatDateTime(block.updated_at)}
                        </td>
                        {isAdmin ? (
                          <td>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setEditingBlock(block);
                                  setBlockDialogOpen(true);
                                }}
                              >
                                <Pencil size={12} strokeWidth={2} aria-hidden="true" />
                                Edit
                              </Button>
                              <Button
                                variant="danger-outline"
                                size="sm"
                                onClick={() => setDeleteBlockTarget(block)}
                              >
                                <Trash2 size={12} strokeWidth={2} aria-hidden="true" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingTemplate(null);
        }}
        template={editingTemplate}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["templates"] });
        }}
      />

      <BlockEditorDialog
        open={blockDialogOpen}
        onOpenChange={(open) => {
          setBlockDialogOpen(open);
          if (!open) setEditingBlock(null);
        }}
        block={editingBlock}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["template-blocks"] });
        }}
      />

      <Dialog open={previewHtml !== null} onOpenChange={(open) => !open && setPreviewHtml(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Template preview · {previewTitle}</DialogTitle>
            <DialogDescription>
              Rendered in a sandboxed Jinja environment with sample candidate and compensation data.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-rule-2)] bg-white">
            <iframe
              title={`Preview of ${previewTitle}`}
              srcDoc={previewHtml ?? ""}
              sandbox=""
              className="h-[68dvh] w-full bg-white"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewHtml(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title={`Delete "${deleteTarget?.name ?? "template"}"?`}
        description="Unused non-default templates are permanently deleted. Templates already linked to offers should be deactivated instead."
        confirmLabel="Delete template"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      >
        {deleteError ? (
          <p className="text-sm text-[var(--color-bad)]" role="alert">
            {deleteError}
          </p>
        ) : null}
      </ActionDialog>

      <ActionDialog
        open={deleteBlockTarget !== null}
        onOpenChange={(open) => !open && setDeleteBlockTarget(null)}
        title={`Delete block "${deleteBlockTarget?.key ?? ""}"?`}
        description="Any template referencing this block key will render empty for that tag."
        confirmLabel="Delete block"
        tone="danger"
        loading={deleteBlockMutation.isPending}
        onConfirm={() => deleteBlockTarget && deleteBlockMutation.mutate(deleteBlockTarget.id)}
      />
    </div>
  );
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: LetterTemplate | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{template ? `Edit template · ${template.name}` : "New offer template"}</DialogTitle>
          <DialogDescription>
            Author safe Jinja HTML templates. Active scripts and unsafe template constructs are
            rejected automatically.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TemplateEditorForm
            key={template?.id ?? "new"}
            template={template}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditorForm({
  template,
  onClose,
  onSaved,
}: {
  template: LetterTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [htmlContent, setHtmlContent] = React.useState(template?.html_content ?? STARTER_HTML);
  const [signatoryName, setSignatoryName] = React.useState(template?.signatory_name ?? "");
  const [signatoryTitle, setSignatoryTitle] = React.useState(template?.signatory_title ?? "");
  const [signatoryEmail, setSignatoryEmail] = React.useState(template?.signatory_email ?? "");
  const [isDefault, setIsDefault] = React.useState(template?.is_default ?? false);
  const [livePreview, setLivePreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => api.templates.preview(htmlContent),
    onSuccess: (res) => {
      setLivePreview(res.html);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        html_content: htmlContent,
        signatory_name: signatoryName.trim() || null,
        signatory_title: signatoryTitle.trim() || null,
        signatory_email: signatoryEmail.trim() || null,
      };
      if (template) {
        return api.templates.update(template.id, payload);
      }
      return api.templates.create({
        ...payload,
        is_active: true,
        is_default: isDefault,
      });
    },
    onSuccess: () => {
      toast.success(template ? "Template updated." : "Template created.");
      onSaved();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function insertPlaceholder(token: string) {
    setHtmlContent((prev) => `${prev}${prev.endsWith("\n") ? "" : "\n"}${token}`);
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name" htmlFor="tpl-name" required>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Site Engineering Offer Letter"
            />
          </Field>
          <Field label="Description" htmlFor="tpl-desc">
            <Input
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When HR should choose this template"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Signatory name override" htmlFor="tpl-sig-name" hint="Optional">
            <Input
              id="tpl-sig-name"
              value={signatoryName}
              onChange={(e) => setSignatoryName(e.target.value)}
              placeholder="Default from company settings"
            />
          </Field>
          <Field label="Signatory title override" htmlFor="tpl-sig-title">
            <Input
              id="tpl-sig-title"
              value={signatoryTitle}
              onChange={(e) => setSignatoryTitle(e.target.value)}
              placeholder="e.g. GM – Projects"
            />
          </Field>
          <Field label="Signatory email override" htmlFor="tpl-sig-email">
            <Input
              id="tpl-sig-email"
              type="email"
              value={signatoryEmail}
              onChange={(e) => setSignatoryEmail(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        {!template ? (
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            Set as the default offer template
          </label>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--color-ink-2)]">
              Supported placeholders (click to append)
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              <Eye size={13} strokeWidth={2} aria-hidden="true" />
              {livePreview ? "Refresh preview" : "Render live preview"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertPlaceholder(token)}
                className="mono rounded-[var(--radius-tag)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-2 py-0.5 text-[11px] text-[var(--color-cool-deep)] hover:border-[var(--color-cool)] hover:bg-[var(--color-cool-soft)]"
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        <div className={livePreview ? "grid gap-4 lg:grid-cols-2" : "flex flex-col"}>
          <Field
            label="HTML template source"
            htmlFor="tpl-html"
            required
            hint="Minimum 100 characters. Rendered inside a Jinja SandboxedEnvironment."
          >
            <Textarea
              id="tpl-html"
              rows={16}
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="font-mono text-xs leading-relaxed"
            />
          </Field>

          {livePreview ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--color-ink-2)]">
                Sandboxed live preview
              </span>
              <div className="h-[368px] overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-rule-2)] bg-white">
                <iframe
                  title="Live template preview"
                  srcDoc={livePreview}
                  sandbox=""
                  className="h-full w-full bg-white"
                />
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-[var(--color-bad)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saveMutation.isPending}
          disabled={!name.trim() || htmlContent.trim().length < 100}
          onClick={() => saveMutation.mutate()}
        >
          {template ? "Save changes" : "Create template"}
        </Button>
      </DialogFooter>
    </>
  );
}

function BlockEditorDialog({
  open,
  onOpenChange,
  block,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: TemplateBlock | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{block ? `Edit block · ${block.key}` : "New content block"}</DialogTitle>
          <DialogDescription>
            Use lowercase letters, numbers, and underscores for the block key (e.g.
            safety_gear_policy).
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <BlockEditorForm
            key={block?.id ?? "new"}
            block={block}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BlockEditorForm({
  block,
  onClose,
  onSaved,
}: {
  block: TemplateBlock | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = React.useState(block?.key ?? "");
  const [name, setName] = React.useState(block?.name ?? "");
  const [description, setDescription] = React.useState(block?.description ?? "");
  const [content, setContent] = React.useState(block?.content ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (block) {
        return api.templates.updateBlock(block.id, {
          name: name.trim(),
          description: description.trim() || null,
          content: content.trim(),
        });
      }
      return api.templates.createBlock({
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || null,
        content: content.trim(),
      });
    },
    onSuccess: () => {
      toast.success(block ? "Content block updated." : "Content block created.");
      onSaved();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <>
      <div className="flex flex-col gap-3">
        {!block ? (
          <Field label="Block key" htmlFor="blk-key" required>
            <Input
              id="blk-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. site_safety_clause"
              className="font-mono text-xs"
            />
          </Field>
        ) : null}
        <Field label="Block title" htmlFor="blk-name" required>
          <Input
            id="blk-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Site Safety & PPE Policy"
          />
        </Field>
        <Field label="Description" htmlFor="blk-desc">
          <Input
            id="blk-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Where this block is used"
          />
        </Field>
        <Field label="Content" htmlFor="blk-content" required>
          <Textarea
            id="blk-content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Approved policy text..."
          />
        </Field>
        {error ? (
          <p className="text-sm text-[var(--color-bad)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={mutation.isPending}
          disabled={(!block && !key.trim()) || !name.trim() || !content.trim()}
          onClick={() => mutation.mutate()}
        >
          {block ? "Save block" : "Create block"}
        </Button>
      </DialogFooter>
    </>
  );
}
