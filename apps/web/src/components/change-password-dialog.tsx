"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api";

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password."),
    new_password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(200, "Use no more than 200 characters."),
    confirm_password: z.string().min(1, "Repeat the new password."),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ["confirm_password"],
    message: "The two new passwords do not match.",
  });

type Values = z.infer<typeof schema>;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api.auth.changePassword(values.current_password, values.new_password),
    onSuccess: () => {
      toast.success("Password changed. Use the new password next time you sign in.");
      form.reset();
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "INVALID_PASSWORD") {
        form.setError("current_password", { message: error.message });
        return;
      }
      form.setError("root", { message: error instanceof Error ? error.message : "Try again." });
    },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset();
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Use at least 10 characters. Changing it does not sign out other sessions.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <Field
            label="Current password"
            htmlFor="current-password"
            error={form.formState.errors.current_password?.message}
            required
          >
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.current_password)}
              {...form.register("current_password")}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="new-password"
            error={form.formState.errors.new_password?.message}
            required
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.new_password)}
              {...form.register("new_password")}
            />
          </Field>
          <Field
            label="Repeat new password"
            htmlFor="confirm-password"
            error={form.formState.errors.confirm_password?.message}
            required
          >
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirm_password)}
              {...form.register("confirm_password")}
            />
          </Field>
          {form.formState.errors.root?.message ? (
            <p className="text-sm text-[var(--color-bad)]" role="alert">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
