import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityCreateSchema,
  activityResponseSchema,
  type LeadStatus,
} from "@kyzn/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
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

const controlClass =
  "min-h-11 rounded border border-[#777] bg-white px-3 py-2 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800";
const buttonClass =
  "min-h-11 rounded bg-[#243b2e] px-4 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-60";

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function ContactPanel({
  leadId,
  leadStatus,
}: {
  leadId: string;
  leadStatus: LeadStatus;
}) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "call",
      occurredAt: localDateTimeValue(new Date()),
      note: "",
      followUpMode: "unchanged",
      nextFollowUpDate: "",
    },
  });
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

  async function submit(values: FormValues) {
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
    <section aria-labelledby="contact-panel-heading" className="mt-8">
      <h3 id="contact-panel-heading" className="font-semibold">
        Record contact or activity
      </h3>
      <form
        className="mt-3 grid max-w-2xl grid-cols-1 gap-4"
        noValidate
        onSubmit={form.handleSubmit(submit)}
      >
        <label className="grid gap-1 font-medium" htmlFor="activity-type">
          Activity type
          <select
            id="activity-type"
            className={controlClass}
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.type)}
            aria-describedby={
              form.formState.errors.type ? "activity-type-error" : undefined
            }
            {...form.register("type")}
          >
            <option value="call">Call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="note">Note only</option>
          </select>
          {form.formState.errors.type && (
            <span id="activity-type-error" role="alert">
              {form.formState.errors.type.message}
            </span>
          )}
        </label>
        <label
          className="grid gap-1 font-medium"
          htmlFor="activity-occurred-at"
        >
          Occurred at
          <input
            id="activity-occurred-at"
            type="datetime-local"
            className={controlClass}
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
        </label>
        <label className="grid gap-1 font-medium" htmlFor="activity-note">
          Note (optional)
          <textarea
            id="activity-note"
            rows={3}
            className={controlClass}
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.note)}
            aria-describedby={
              form.formState.errors.note ? "activity-note-error" : undefined
            }
            {...form.register("note")}
          />
        </label>
        <label className="grid gap-1 font-medium" htmlFor="follow-up-mode">
          Next follow-up
          <select
            id="follow-up-mode"
            className={controlClass}
            disabled={disabled}
            {...form.register("followUpMode")}
          >
            <option value="unchanged">Leave as is</option>
            <option value="set">Set date</option>
            <option value="clear">Clear date</option>
          </select>
        </label>
        {form.watch("followUpMode") === "set" && (
          <label
            className="grid gap-1 font-medium"
            htmlFor="next-follow-up-date"
          >
            Follow-up date
            <input
              id="next-follow-up-date"
              type="date"
              className={controlClass}
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
          </label>
        )}
        {mutation.isPending && <p role="status">Recording activity…</p>}
        {mutation.isError && <p role="alert">{errorText}</p>}
        {success && <p role="status">Activity recorded successfully.</p>}
        {(leadStatus === "converted" || leadStatus === "invalid") && (
          <p role="status">
            Activities cannot be recorded for this lead status.
          </p>
        )}
        <button type="submit" className={buttonClass} disabled={disabled}>
          {mutation.isPending ? "Recording…" : "Record activity"}
        </button>
      </form>
    </section>
  );
}
