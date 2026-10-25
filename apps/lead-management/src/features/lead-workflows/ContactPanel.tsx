import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityCreateSchema,
  activityResponseSchema,
  type LeadStatus,
} from "@kyzn/shared";
import { Alert, AlertDescription } from "@kyzn/ui/components/alert";
import { Button } from "@kyzn/ui/components/button";
import { Input } from "@kyzn/ui/components/input";
import { Label } from "@kyzn/ui/components/label";
import { Textarea } from "@kyzn/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kyzn/ui/components/select";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest, ApiRequestError } from "../../lib/api";
import { leadQueryKeys } from "../../lib/query-keys";

const formSchema = z
  .object({
    type: z.enum(["call", "whatsapp", "email", "note"]),
    occurredAt: z.string().min(1, "Enter when this activity occurred."),
    note: z.string(),
    followUpMode: z.enum(["unchanged", "set", "clear"]),
    nextFollowUpDate: z.string(),
  })
  .superRefine((values, context) => {
    if (values.followUpMode === "set" && !values.nextFollowUpDate) {
      context.addIssue({
        code: "custom",
        path: ["nextFollowUpDate"],
        message: "Choose a follow-up date.",
      });
    } else if (
      values.followUpMode === "set" &&
      !activityCreateSchema.safeParse({
        type: values.type,
        nextFollowUpDate: values.nextFollowUpDate,
      }).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["nextFollowUpDate"],
        message: "Enter a valid follow-up date.",
      });
    }
  });
type FormValues = z.infer<typeof formSchema>;

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function ContactPanel({
  leadId,
  leadStatus,
  mode = "activity",
  onSaved,
  onCancel,
  onPendingChange,
}: {
  leadId: string;
  leadStatus: LeadStatus;
  mode?: "activity" | "followUp";
  onSaved?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: mode === "followUp" ? "note" : "call",
      occurredAt: localDateTimeValue(new Date()),
      note: "",
      followUpMode: mode === "followUp" ? "set" : "unchanged",
      nextFollowUpDate: "",
    },
  });
  const contextual = Boolean(onCancel);
  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = activityCreateSchema.parse({
        type: values.type,
        occurredAt: new Date(values.occurredAt).toISOString(),
        note: values.note || undefined,
        ...(values.followUpMode === "set"
          ? { nextFollowUpDate: values.nextFollowUpDate }
          : {}),
        ...(values.followUpMode === "clear" ? { nextFollowUpDate: null } : {}),
      });
      return apiRequest(
        `/v1/leads/${encodeURIComponent(leadId)}/activities`,
        activityResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    },
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: leadQueryKeys.detail(leadId),
        }),
        queryClient.invalidateQueries({ queryKey: leadQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "metrics"] }),
      ]),
  });
  useEffect(() => {
    onPendingChange?.(mutation.isPending);
  }, [mutation.isPending, onPendingChange]);

  async function submit(values: FormValues) {
    if (mutation.isPending) return;
    setSuccess(false);
    try {
      await mutation.mutateAsync(values);
      form.reset({
        ...values,
        type: "call",
        occurredAt: localDateTimeValue(new Date()),
        note: "",
        followUpMode: "unchanged",
        nextFollowUpDate: "",
      });
      setSuccess(true);
      onSaved?.();
    } catch {
      // Mutation state keeps the submitted values available for correction or retry.
    }
  }

  const disabled =
    mutation.isPending ||
    leadStatus === "converted" ||
    leadStatus === "invalid";
  const errorText =
    mutation.error instanceof ApiRequestError
      ? mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : "Could not record this activity. Your entries are still here.";
  return (
    <section aria-labelledby="contact-panel-heading">
      <h2 id="contact-panel-heading" className="font-semibold">
        {mode === "followUp"
          ? "Update follow-up"
          : "Record contact or activity"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "followUp"
          ? "Schedule or clear a follow-up. This starts as a note; choose a contact type only if an interaction occurred."
          : "Record an interaction and optionally update the next follow-up."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Times entered here use your device timezone; saved times use the
        business timezone.
      </p>
      <form
        className="mt-3 grid max-w-2xl grid-cols-1 gap-4"
        noValidate
        onSubmit={form.handleSubmit(submit)}
      >
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <div className="grid gap-1 font-medium">
              <Label htmlFor="activity-type">Activity type</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger
                  id="activity-type"
                  autoFocus={contextual && mode === "activity"}
                  ref={field.ref}
                  aria-invalid={Boolean(form.formState.errors.type)}
                  aria-describedby={
                    form.formState.errors.type
                      ? "activity-type-error"
                      : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Note only</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.type && (
                <span id="activity-type-error" role="alert">
                  {form.formState.errors.type.message}
                </span>
              )}
            </div>
          )}
        />
        <Label
          className="grid gap-1 font-medium"
          htmlFor="activity-occurred-at"
        >
          Occurred at
          <Input
            id="activity-occurred-at"
            type="datetime-local"
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.occurredAt)}
            aria-describedby={
              form.formState.errors.occurredAt
                ? "activity-occurred-at-error"
                : undefined
            }
            {...form.register("occurredAt")}
          />
          {form.formState.errors.occurredAt && (
            <span id="activity-occurred-at-error" role="alert">
              {form.formState.errors.occurredAt.message}
            </span>
          )}
        </Label>
        <Label className="grid gap-1 font-medium" htmlFor="activity-note">
          Note (optional)
          <Textarea
            id="activity-note"
            rows={3}
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.note)}
            aria-describedby={
              form.formState.errors.note ? "activity-note-error" : undefined
            }
            {...form.register("note")}
          />
        </Label>
        <Controller
          control={form.control}
          name="followUpMode"
          render={({ field }) => (
            <div className="grid gap-1 font-medium">
              <Label htmlFor="follow-up-mode">Next follow-up</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id="follow-up-mode" ref={field.ref}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unchanged">Leave as is</SelectItem>
                  <SelectItem value="set">Set date</SelectItem>
                  <SelectItem value="clear">Clear date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />
        {form.watch("followUpMode") === "set" && (
          <Label
            className="grid gap-1 font-medium"
            htmlFor="next-follow-up-date"
          >
            Follow-up date
            <Input
              id="next-follow-up-date"
              autoFocus={contextual && mode === "followUp"}
              type="date"
              disabled={disabled}
              aria-invalid={Boolean(form.formState.errors.nextFollowUpDate)}
              aria-describedby={
                form.formState.errors.nextFollowUpDate
                  ? "next-follow-up-date-error"
                  : undefined
              }
              {...form.register("nextFollowUpDate")}
            />
            {form.formState.errors.nextFollowUpDate && (
              <span id="next-follow-up-date-error" role="alert">
                {form.formState.errors.nextFollowUpDate.message}
              </span>
            )}
          </Label>
        )}
        {mutation.isPending && (
          <p role="status">
            {mode === "followUp" ? "Saving follow-up…" : "Recording activity…"}
          </p>
        )}
        {mutation.isError && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        )}
        {success && <p role="status">Activity recorded successfully.</p>}
        {(leadStatus === "converted" || leadStatus === "invalid") && (
          <p role="status">
            Activities cannot be recorded for this lead status.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={disabled}>
            {mutation.isPending
              ? "Recording…"
              : mode === "followUp"
                ? "Save follow-up"
                : "Record activity"}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
