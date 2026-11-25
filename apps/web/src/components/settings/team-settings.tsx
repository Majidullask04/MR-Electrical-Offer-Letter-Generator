"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime, roleLabel } from "@/lib/format";
import type { StaffUser } from "@/lib/types";

interface EditorState {
  mode: "create" | "edit";
  id?: string;
  full_name: string;
  email: string;
  password: string;
  role_key: string;
  is_active: boolean;
}

export function TeamSettings() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list });
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.auth.roles, staleTime: 300_000 });

  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [editorError, setEditorError] = React.useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (state: EditorState) => {
      if (state.mode === "edit" && state.id) {
        return api.users.update(state.id, {
          full_name: state.full_name.trim(),
          role_key: state.role_key,
          is_active: state.is_active,
          ...(state.password ? { password: state.password } : {}),
        });
      }
      return api.users.create({
        full_name: state.full_name.trim(),
        email: state.email.trim().toLowerCase(),
        password: state.password,
        role_key: state.role_key,
      });
    },
    onSuccess: (_saved, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(variables.mode === "edit" ? "Staff account updated." : "Staff account created.");
      setEditor(null);
      setEditorError(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "USER_EXISTS") {
        setEditorError("A staff account with that email already exists.");
        return;
      }
      setEditorError(errorMessage(error));
    },
  });

  function openCreate() {
    setEditor({
      mode: "create",
      full_name: "",
      email: "",
      password: "",
      role_key: roles.data?.[0]?.key ?? "HR_MANAGER",
      is_active: true,
    });
    setEditorError(null);
  }

  function openEdit(user: StaffUser) {
    setEditor({
      mode: "edit",
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      password: "",
      role_key: user.primary_role,
      is_active: user.is_active,
    });
    setEditorError(null);
  }

  function save() {
    if (!editor) return;
    if (editor.full_name.trim().length < 2) {
      setEditorError("Enter the staff member's full name.");
      return;
    }
    if (editor.mode === "create" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editor.email.trim())) {
      setEditorError("Enter a valid work email address.");
      return;
    }
    if (!editor.role_key) {
      setEditorError("Choose a role.");
      return;
    }
    if ((editor.mode === "create" || editor.password) && editor.password.length < 10) {
      setEditorError("Use a password of at least 10 characters.");
      return;
    }
    setEditorError(null);
    saveMutation.mutate(editor);
  }

  if (users.isPending) return <PanelSkeleton lines={7} />;

  if (users.isError) {
    return (
      <ErrorState
        message={users.error instanceof Error ? users.error.message : "Staff accounts could not load."}
        onRetry={() => users.refetch()}
      />
    );
  }

  const staff = users.data;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Staff accounts"
        description="Roles decide who can draft, approve and administer. Candidates never have an account here."
        actions={
          <Button variant="primary" size="sm" onClick={openCreate} disabled={roles.isPending}>
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            Add staff
          </Button>
        }
      />

      <div className="rounded-[var(--radius-control)] border border-[var(--color-rule)] border-l-[3px] border-l-[var(--color-cool)] bg-[var(--color-cool-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
        Super admins manage everything. HR managers draft and issue offers. Hiring managers record
        approval decisions. The last active super admin cannot be deactivated.
      </div>

      <div className="scroll-x">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Staff member</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Last sign-in</th>
              <th scope="col" className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((user) => (
              <tr key={user.id} className={user.is_active ? undefined : "opacity-65"}>
                <td>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-[var(--color-ink)]">{user.full_name}</span>
                    <span className="text-[11px] text-[var(--color-muted)]">{user.email}</span>
                  </div>
                </td>
                <td>
                  <span className="text-xs text-[var(--color-ink-2)]">{roleLabel(user.primary_role)}</span>
                  {user.roles.length > 1 ? (
                    <span className="mono mt-0.5 block text-[9px] text-[var(--color-muted)]">
                      +{user.roles.length - 1} more
                    </span>
                  ) : null}
                </td>
                <td>
                  <span
                    className={
                      user.is_active
                        ? "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] bg-[var(--color-ok-soft)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-ok)]"
                        : "inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] bg-[var(--color-paper-3)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--color-muted)]"
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={
                        user.is_active
                          ? "h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
                          : "h-1.5 w-1.5 rounded-full bg-[var(--color-faint)]"
                      }
                    />
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                  {user.last_login_at ? (
                    <span title={formatDateTime(user.last_login_at)}>{relativeTime(user.last_login_at)}</span>
                  ) : (
                    "Never"
                  )}
                </td>
                <td>
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                      <Pencil size={12} strokeWidth={2} aria-hidden="true" />
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            setEditorError(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "edit" ? "Edit staff account" : "Add staff account"}</DialogTitle>
            <DialogDescription>
              {editor?.mode === "edit"
                ? "Changing a role takes effect on the next request. Leave the password blank to keep the current one."
                : "The person signs in with this email and password. Share the password through a secure channel."}
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
              <Field label="Full name" htmlFor="staff-name" required>
                <Input
                  id="staff-name"
                  autoComplete="name"
                  value={editor.full_name}
                  onChange={(event) => setEditor({ ...editor, full_name: event.target.value })}
                />
              </Field>
              <Field label="Work email" htmlFor="staff-email" required>
                <Input
                  id="staff-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={editor.email}
                  onChange={(event) => setEditor({ ...editor, email: event.target.value })}
                  disabled={editor.mode === "edit"}
                />
              </Field>
              <Field label="Role" htmlFor="staff-role" required>
                <Select
                  id="staff-role"
                  value={editor.role_key}
                  onChange={(event) => setEditor({ ...editor, role_key: event.target.value })}
                  disabled={roles.isPending}
                >
                  {(roles.data ?? []).map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={editor.mode === "edit" ? "New password (optional)" : "Initial password"}
                htmlFor="staff-password"
                required={editor.mode === "create"}
                hint="At least 10 characters."
              >
                <Input
                  id="staff-password"
                  type="password"
                  autoComplete="new-password"
                  value={editor.password}
                  onChange={(event) => setEditor({ ...editor, password: event.target.value })}
                />
              </Field>
              {editor.mode === "edit" ? (
                <label className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-2 text-sm text-[var(--color-ink-2)]">
                  <input
                    type="checkbox"
                    checked={editor.is_active}
                    onChange={(event) => setEditor({ ...editor, is_active: event.target.checked })}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  Account is active
                </label>
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
                  {editor.mode === "edit" ? "Save account" : "Create account"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
