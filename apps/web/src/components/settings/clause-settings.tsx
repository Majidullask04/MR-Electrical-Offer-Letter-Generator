"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Field, Input, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { TemplateBlock } from "@/lib/types";

interface EditorState {
  mode: "create" | "edit";
  id?: string;
  key: string;
  name: string;
  description: string;
  content: string;
}

export function ClauseSettings({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["blocks"], queryFn: api.templates.blocks });

  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [editorError, setEditorError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TemplateBlock | null>(null);

  const saveMutation = useMutation({
    mutationFn: (state: EditorState) => {
      const payload = {
        name: state.name.trim(),
        description: state.description.trim() || null,
        content: state.content.trim(),
      };
      if (state.mode === "edit" && state.id) return api.templates.updateBlock(state.id, payload);
      return api.templates.createBlock({ ...payload, key: state.key.trim() });
    },
    onSuccess: (_saved, variables) => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      toast.success(variables.mode === "edit" ? "Clause saved." : "Clause added.");
      setEditor(null);
      setEditorError(null);
    },
    onError: (error) => setEditorError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.removeBlock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      toast.success("Clause deleted. Templates that reference it will render the key as empty.");
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function openCreate() {
    setEditor({ mode: "create", key: "", name: "", description: "", content: "" });
    setEditorError(null);
  }

  function openEdit(block: TemplateBlock) {
    setEditor({
      mode: "edit",
      id: block.id,
      key: block.key,
      name: block.name,
      description: block.description ?? "",
      content: block.content,
    });
    setEditorError(null);
  }

  function save() {
    if (!editor) return;
    if (editor.mode === "create" && !/^[a-z][a-z0-9_]*$/.test(editor.key.trim())) {
      setEditorError("The key must start with a letter and use lowercase letters, digits or underscores.");
      return;
    }
    if (editor.name.trim().length < 2) {
      setEditorError("Give the clause a name of at least two characters.");
      return;
    }
    if (!editor.content.trim()) {
      setEditorError("The clause text cannot be empty.");
      return;
    }
    setEditorError(null);
    saveMutation.mutate(editor);
  }

  if (query.isPending) return <PanelSkeleton lines={7} />;

  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : "Clauses could not load."}
        onRetry={() => query.refetch()}
      />
    );
  }

  const blocks = query.data;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Clause library"
        description="Reusable policy text kept beside the letter templates. Templates read these through the blocks map, for example {{ blocks.notice_period }}."
        actions={
          canEdit ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Add clause
            </Button>
          ) : null
        }
      />

      <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-warn)] bg-[var(--color-warn-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
        <strong className="font-semibold">Neutral starter copy, not legal advice.</strong> The seeded
        clauses are placeholders. Have a qualified adviser review and adapt every clause before it is
        relied on in a real appointment.
      </div>

      {!canEdit ? (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-cool)] bg-[var(--color-cool-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
          Clauses are readable by all staff. Only a super admin can add, edit or remove them.
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <EmptyState
          title="No clauses in the library"
          description="Add the reusable policy text your templates expect. Clause keys are referenced from the template body."
          action={
            canEdit ? (
              <Button variant="primary" size="sm" onClick={openCreate}>
                Add clause
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
          {blocks.map((block) => (
            <li key={block.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">{block.name}</h3>
                    <code className="mono rounded-[3px] bg-[var(--color-paper-3)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-2)]">
                      {block.key}
                    </code>
                  </div>
                  {block.description ? (
                    <p className="text-xs text-[var(--color-muted)]">{block.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mono mr-2 hidden text-[10px] text-[var(--color-muted)] sm:inline">
                    updated {formatDateTime(block.updated_at)}
                  </span>
                  {canEdit ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(block)}>
                        <Pencil size={12} strokeWidth={2} aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)] hover:text-[var(--color-bad)]"
                        onClick={() => setDeleteTarget(block)}
                      >
                        <Trash2 size={12} strokeWidth={2} aria-hidden="true" />
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <p className="max-w-[92ch] whitespace-pre-line text-xs leading-relaxed text-[var(--color-muted)]">
                {block.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            setEditorError(null);
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "edit" ? "Edit clause" : "Add clause"}</DialogTitle>
            <DialogDescription>
              Clause keys are stable references used by templates. They cannot be changed after the
              clause is created.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              noValidate
            >
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Key" htmlFor="block-key" required hint="Lowercase letters, digits and underscores.">
                  <Input
                    id="block-key"
                    value={editor.key}
                    onChange={(event) => setEditor({ ...editor, key: event.target.value })}
                    disabled={editor.mode === "edit"}
                    placeholder="notice_period"
                    className="font-mono text-xs"
                  />
                </Field>
                <Field label="Name" htmlFor="block-name" required>
                  <Input
                    id="block-name"
                    value={editor.name}
                    onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                    placeholder="Notice period"
                  />
                </Field>
                <Field label="Description" htmlFor="block-description" className="sm:col-span-2">
                  <Input
                    id="block-description"
                    value={editor.description}
                    onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                    placeholder="Where this clause is used"
                  />
                </Field>
              </div>
              <Field label="Clause text" htmlFor="block-content" required hint="Plain text or simple HTML. Scripts are not rendered.">
                <Textarea
                  id="block-content"
                  rows={8}
                  value={editor.content}
                  onChange={(event) => setEditor({ ...editor, content: event.target.value })}
                />
              </Field>
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
                  {editor.mode === "edit" ? "Save clause" : "Add clause"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? "this clause"}?`}
        description="Templates that reference this key will render an empty value. Check the template body before deleting."
        confirmLabel="Delete clause"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
