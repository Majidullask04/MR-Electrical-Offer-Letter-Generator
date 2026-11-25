"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { LetterTemplate } from "@/lib/types";

interface EditorState {
  mode: "create" | "edit";
  id?: string;
  name: string;
  description: string;
  html: string;
  signatory_name: string;
  signatory_title: string;
  signatory_email: string;
  is_active: boolean;
}

export function TemplateSettings({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["templates"], queryFn: api.templates.list });

  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [editorError, setEditorError] = React.useState<string | null>(null);
  const [editorPreview, setEditorPreview] = React.useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewName, setPreviewName] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<LetterTemplate | null>(null);

  const previewMutation = useMutation({
    mutationFn: ({ html }: { html: string; inline: boolean }) => api.templates.preview(html),
    onSuccess: (result, variables) => {
      if (variables.inline) {
        setEditorPreview(result.html);
        return;
      }
      setPreviewHtml(result.html);
      setPreviewOpen(true);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveMutation = useMutation({
    mutationFn: (state: EditorState) => {
      const payload = {
        name: state.name.trim(),
        description: state.description.trim() || null,
        html_content: state.html,
        signatory_name: state.signatory_name.trim() || null,
        signatory_title: state.signatory_title.trim() || null,
        signatory_email: state.signatory_email.trim() || null,
        is_active: state.is_active,
      };
      if (state.mode === "edit" && state.id) return api.templates.update(state.id, payload);
      return api.templates.create({ ...payload, is_default: false });
    },
    onSuccess: (saved, variables) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(variables.mode === "edit" ? "Template saved." : "Template created.");
      setEditor(null);
      setEditorError(null);
      setEditorPreview(null);
    },
    onError: (error) => setEditorError(errorMessage(error)),
  });

  const quickMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: "duplicate" | "default"; id: string }) =>
      kind === "duplicate" ? api.templates.duplicate(id) : api.templates.makeDefault(id),
    onSuccess: (_saved, variables) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(
        variables.kind === "duplicate"
          ? "Template duplicated. Edit the copy before using it."
          : "Default template updated.",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted.");
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isPending) return <PanelSkeleton lines={8} />;

  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : "Templates could not load."}
        onRetry={() => query.refetch()}
      />
    );
  }

  const templates = query.data;
  const fallbackHtml = templates.find((template) => template.is_default)?.html_content
    ?? templates[0]?.html_content
    ?? "";

  function openCreate() {
    setEditor({
      mode: "create",
      name: "",
      description: "",
      html: fallbackHtml,
      signatory_name: "",
      signatory_title: "",
      signatory_email: "",
      is_active: true,
    });
    setEditorError(null);
    setEditorPreview(null);
  }

  function openEdit(template: LetterTemplate) {
    setEditor({
      mode: "edit",
      id: template.id,
      name: template.name,
      description: template.description ?? "",
      html: template.html_content,
      signatory_name: template.signatory_name ?? "",
      signatory_title: template.signatory_title ?? "",
      signatory_email: template.signatory_email ?? "",
      is_active: template.is_active,
    });
    setEditorError(null);
    setEditorPreview(null);
  }

  function save() {
    if (!editor) return;
    if (editor.name.trim().length < 2) {
      setEditorError("Give the template a name of at least two characters.");
      return;
    }
    if (editor.html.trim().length < 100) {
      setEditorError("The HTML body must be at least 100 characters.");
      return;
    }
    if (
      editor.signatory_email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editor.signatory_email.trim())
    ) {
      setEditorError("Enter a valid signatory email address, or leave it blank.");
      return;
    }
    setEditorError(null);
    saveMutation.mutate(editor);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Letter templates"
        description="The HTML body that wraps the offer data. Placeholders are resolved by the document engine; duplicate the default to start a variant."
        actions={
          canEdit ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              New template
            </Button>
          ) : null
        }
      />

      {!canEdit ? (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-cool)] bg-[var(--color-cool-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
          Templates are readable by all staff. Only a super admin can create, edit, duplicate or
          retire one.
        </div>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState
          title="No letter templates"
          description="An offer cannot be submitted without an active template. Create one from the default body to get started."
          action={
            canEdit ? (
              <Button variant="primary" size="sm" onClick={openCreate}>
                New template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="scroll-x">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Template</th>
                <th scope="col">Version</th>
                <th scope="col">Signatory</th>
                <th scope="col">Updated</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                        {template.name}
                        {template.is_default ? (
                          <span className="inline-flex items-center gap-1 rounded-[var(--radius-tag)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent-deep)]">
                            <Star size={9} strokeWidth={2.5} aria-hidden="true" />
                            Default
                          </span>
                        ) : null}
                        {!template.is_active ? (
                          <span className="rounded-[var(--radius-tag)] bg-[var(--color-paper-3)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-muted)]">
                            Inactive
                          </span>
                        ) : null}
                      </span>
                      {template.description ? (
                        <span className="max-w-[60ch] text-xs leading-relaxed text-[var(--color-muted)]">
                          {template.description}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="mono whitespace-nowrap text-xs text-[var(--color-ink-2)]">
                    v{template.version}
                  </td>
                  <td className="min-w-[150px]">
                    <span className="block text-xs text-[var(--color-ink-2)]">
                      {template.signatory_name ?? "Company default"}
                    </span>
                    <span className="block text-[10px] text-[var(--color-muted)]">
                      {template.signatory_title ?? "Uses profile signatory"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                    {formatDateTime(template.updated_at)}
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPreviewName(template.name);
                          setPreviewHtml(null);
                          previewMutation.mutate({ html: template.html_content, inline: false });
                        }}
                        loading={previewMutation.isPending && !editor}
                      >
                        <Eye size={12} strokeWidth={2} aria-hidden="true" />
                        Preview
                      </Button>
                      {canEdit ? (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => openEdit(template)}>
                            <Pencil size={12} strokeWidth={2} aria-hidden="true" />
                            Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${template.name}`}>
                                <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                onSelect={() => quickMutation.mutate({ kind: "duplicate", id: template.id })}
                              >
                                <Copy size={14} strokeWidth={2} aria-hidden="true" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={template.is_default || !template.is_active}
                                onSelect={() => quickMutation.mutate({ kind: "default", id: template.id })}
                              >
                                <Star size={14} strokeWidth={2} aria-hidden="true" />
                                Make default
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={template.is_default}
                                className="text-[var(--color-bad)] data-[highlighted]:bg-[var(--color-bad-soft)] data-[highlighted]:text-[var(--color-bad)]"
                                onSelect={() => setDeleteTarget(template)}
                              >
                                <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            setEditorError(null);
            setEditorPreview(null);
          }
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "edit" ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Changes to the HTML body increment the template version. Existing issued offers keep
              their frozen snapshot.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              noValidate
            >
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Template name" htmlFor="template-name" required>
                  <Input
                    id="template-name"
                    value={editor.name}
                    onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                    placeholder="Standard full-time offer"
                  />
                </Field>
                <Field label="Description" htmlFor="template-description">
                  <Input
                    id="template-description"
                    value={editor.description}
                    onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                    placeholder="When to use this variant"
                  />
                </Field>
                <Field label="Signatory name" htmlFor="template-signatory" hint="Blank uses the company profile.">
                  <Input
                    id="template-signatory"
                    value={editor.signatory_name}
                    onChange={(event) => setEditor({ ...editor, signatory_name: event.target.value })}
                  />
                </Field>
                <Field label="Signatory title" htmlFor="template-signatory-title">
                  <Input
                    id="template-signatory-title"
                    value={editor.signatory_title}
                    onChange={(event) => setEditor({ ...editor, signatory_title: event.target.value })}
                  />
                </Field>
                <Field label="Signatory email" htmlFor="template-signatory-email" className="sm:col-span-2">
                  <Input
                    id="template-signatory-email"
                    type="email"
                    inputMode="email"
                    value={editor.signatory_email}
                    onChange={(event) => setEditor({ ...editor, signatory_email: event.target.value })}
                  />
                </Field>
              </div>

              <label className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-2 text-sm text-[var(--color-ink-2)]">
                <input
                  type="checkbox"
                  checked={editor.is_active}
                  onChange={(event) => setEditor({ ...editor, is_active: event.target.checked })}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                Active (available to the offer builder)
              </label>

              <Field
                label="HTML body"
                htmlFor="template-html"
                hint="At least 100 characters. Scripts and unsafe constructs are rejected by the server."
              >
                <Textarea
                  id="template-html"
                  rows={14}
                  value={editor.html}
                  onChange={(event) => {
                    setEditor({ ...editor, html: event.target.value });
                    setEditorPreview(null);
                  }}
                  className="font-mono text-xs leading-relaxed"
                  spellCheck={false}
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => previewMutation.mutate({ html: editor.html, inline: true })}
                  loading={previewMutation.isPending}
                  disabled={editor.html.trim().length < 100}
                >
                  <Eye size={13} strokeWidth={2} aria-hidden="true" />
                  Render preview
                </Button>
                <p className="text-[10px] text-[var(--color-muted)]">
                  Preview uses sample offer data and never issues anything.
                </p>
              </div>

              {editorPreview ? (
                <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-rule-2)] bg-white">
                  <iframe
                    title="Template preview"
                    srcDoc={editorPreview}
                    sandbox=""
                    className="h-[360px] w-full bg-white"
                  />
                </div>
              ) : null}

              {editorError ? (
                <p className="text-sm leading-relaxed text-[var(--color-bad)]" role="alert">
                  {editorError}
                </p>
              ) : null}

              <DialogFooter>
                <Button variant="secondary" onClick={() => setEditor(null)} disabled={saveMutation.isPending}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={saveMutation.isPending}>
                  {editor.mode === "edit" ? "Save template" : "Create template"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{previewName || "Template preview"}</DialogTitle>
            <DialogDescription>
              Rendered with sample data. Closing this dialog does not change the template.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-rule-2)] bg-white">
            {previewMutation.isPending ? (
              <div className="flex h-[520px] items-center justify-center text-sm text-[var(--color-muted)]" aria-busy="true">
                Rendering preview…
              </div>
            ) : previewHtml ? (
              <iframe
                title={`Preview of ${previewName}`}
                srcDoc={previewHtml}
                sandbox=""
                className="h-[520px] w-full bg-white"
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center px-6 text-center text-sm text-[var(--color-muted)]">
                The preview could not be rendered. Try again from the template row.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              <Check size={13} strokeWidth={2} aria-hidden="true" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? "this template"}?`}
        description="Deleting is only possible when no offer uses the template and it is not the default. Deactivate instead if you want to keep the record."
        confirmLabel="Delete template"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
