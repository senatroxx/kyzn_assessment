import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  consultantsResponseSchema,
  duplicateQuerySchema,
  duplicatesResponseSchema,
  leadCreateSchema,
  leadDetailResponseSchema,
  leadResponseSchema,
  venuesResponseSchema,
  type Lead,
  type LeadCreateInput,
} from "@kyzn/shared";
import { apiRequest, ApiRequestError } from "../../lib/api";
import { leadQueryKeys } from "../../lib/query-keys";

const sourceLabels = {
  website: "Website",
  whatsapp: "WhatsApp",
  social_media: "Social media",
  referral: "Referral",
  walk_in: "Walk-in",
  other: "Other",
} as const;

type Props = { leadId?: string };

export function LeadForm({ leadId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const editing = Boolean(leadId);
  const [submitError, setSubmitError] = useState("");
  const [savedLead, setSavedLead] = useState<Lead | null>(null);
  const detail = useQuery({
    queryKey: leadQueryKeys.detail(leadId ?? ""),
    queryFn: () => apiRequest(`/v1/leads/${leadId}`, leadDetailResponseSchema),
    enabled: editing,
  });
  const venues = useQuery({
    queryKey: [...leadQueryKeys.lookups(), "venues"],
    queryFn: () => apiRequest("/v1/venues", venuesResponseSchema),
  });
  const consultants = useQuery({
    queryKey: [...leadQueryKeys.lookups(), "consultants"],
    queryFn: () => apiRequest("/v1/consultants", consultantsResponseSchema),
  });
  const form = useForm<LeadCreateInput>({
    resolver: zodResolver(leadCreateSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      source: "website",
      venueId: "",
      consultantId: "",
      nextFollowUpDate: null,
    },
  });
  const [phone, email] = form.watch(["phone", "email"]);
  const validContacts = useMemo(() => {
    const parsed = duplicateQuerySchema.safeParse({ phone, email });
    return parsed.success ? parsed.data : null;
  }, [phone, email]);
  const [duplicates, setDuplicates] = useState<Awaited<
    ReturnType<typeof loadDuplicates>
  > | null>(null);
  const [duplicateError, setDuplicateError] = useState("");
  const [duplicatePending, setDuplicatePending] = useState(false);

  useEffect(() => {
    if (detail.data) {
      const {
        fullName,
        phone: savedPhone,
        email: savedEmail,
        source,
        venueId,
        consultantId,
        nextFollowUpDate,
      } = detail.data.data;
      form.reset({
        fullName,
        phone: savedPhone,
        email: savedEmail,
        source,
        venueId,
        consultantId,
        nextFollowUpDate,
      });
    }
  }, [detail.data, form]);

  useEffect(() => {
    if (!validContacts) {
      setDuplicates(null);
      setDuplicateError("");
      setDuplicatePending(false);
      return;
    }
    setDuplicates(null);
    setDuplicateError("");
    let current = true;
    const timer = window.setTimeout(() => {
      setDuplicatePending(true);
      setDuplicateError("");
      const params = new URLSearchParams();
      if (validContacts.phone) params.set("phone", validContacts.phone);
      if (validContacts.email) params.set("email", validContacts.email);
      if (leadId) params.set("excludeId", leadId);
      void loadDuplicates(params.toString())
        .then((matches) => {
          if (current) setDuplicates(matches);
        })
        .catch((error: unknown) => {
          if (current)
            setDuplicateError(
              error instanceof Error
                ? error.message
                : "Duplicate check failed.",
            );
        })
        .finally(() => {
          if (current) setDuplicatePending(false);
        });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [validContacts, leadId]);

  async function submit(values: LeadCreateInput) {
    setSubmitError("");
    try {
      const response = await apiRequest(
        editing ? `/v1/leads/${leadId}` : "/v1/leads",
        leadResponseSchema,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      setSavedLead(response.data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: leadQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: leadQueryKeys.detail(response.data.id),
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "metrics"] }),
      ]);
      await navigate({
        to: "/leads/$leadId/",
        params: { leadId: response.data.id },
      });
    } catch (error) {
      setSubmitError(
        error instanceof ApiRequestError
          ? error.message
          : "Could not save this lead. Your entries are still here.",
      );
    }
  }

  if (editing && detail.isPending) return <p role="status">Loading lead…</p>;
  if (editing && detail.isError)
    return <p role="alert">{detail.error.message}</p>;
  const lookupFailure = venues.isError || consultants.isError;

  return (
    <section className="max-w-2xl" aria-labelledby="lead-form-heading">
      <h2 id="lead-form-heading" className="text-xl font-semibold">
        {editing ? "Edit lead" : "New lead"}
      </h2>
      {editing && detail.data && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Lead ID</dt>
            <dd className="break-all">{detail.data.data.id}</dd>
          </div>
          <div>
            <dt className="font-semibold">Created</dt>
            <dd>
              <time dateTime={detail.data.data.createdAt}>
                {new Date(detail.data.data.createdAt).toLocaleString()}
              </time>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Status</dt>
            <dd>{detail.data.data.status.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt className="font-semibold">Last contacted</dt>
            <dd>
              {detail.data.data.lastContactAt ? (
                <time dateTime={detail.data.data.lastContactAt}>
                  {new Date(detail.data.data.lastContactAt).toLocaleString()}
                </time>
              ) : (
                "Not recorded"
              )}
            </dd>
          </div>
        </dl>
      )}
      {lookupFailure ? (
        <p role="alert" className="mt-4">
          Could not load venues or consultants. Please retry the page.
        </p>
      ) : null}
      {!lookupFailure && (venues.isPending || consultants.isPending) ? (
        <p role="status" className="mt-4">
          Loading venues and consultants…
        </p>
      ) : null}
      <form
        className="mt-5 grid grid-cols-1 gap-4"
        noValidate
        onSubmit={form.handleSubmit(submit)}
      >
        <Field
          label="Full name"
          name="fullName"
          form={form}
          autoComplete="name"
        />
        <Field
          label="Phone"
          name="phone"
          form={form}
          type="tel"
          autoComplete="tel"
        />
        <Field
          label="Email"
          name="email"
          form={form}
          type="email"
          autoComplete="email"
        />
        <label className="grid gap-1 font-medium" htmlFor="source">
          Lead source
          <select
            id="source"
            className={controlClass}
            aria-invalid={Boolean(form.formState.errors.source)}
            aria-describedby={
              form.formState.errors.source ? "source-error" : undefined
            }
            {...form.register("source")}
          >
            {Object.entries(sourceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {form.formState.errors.source && (
            <span
              id="source-error"
              className="text-sm font-normal text-red-700"
              role="alert"
            >
              {form.formState.errors.source.message}
            </span>
          )}
        </label>
        <LookupSelect
          label="Interested venue"
          name="venueId"
          items={venues.data?.data ?? []}
          error={form.formState.errors.venueId?.message}
          register={form.register("venueId")}
        />
        <LookupSelect
          label="Assigned consultant"
          name="consultantId"
          items={consultants.data?.data ?? []}
          error={form.formState.errors.consultantId?.message}
          register={form.register("consultantId")}
        />
        <Field
          label="Next follow-up date (optional)"
          name="nextFollowUpDate"
          form={form}
          type="date"
        />
        {duplicates?.length ? (
          <div
            className="rounded border border-amber-700 bg-amber-50 p-3"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">
              Possible duplicate leads. You can still save this lead.
            </p>
            <ul className="mt-2 list-disc pl-5">
              {duplicates.map((match) => (
                <li key={match.id}>
                  <Link
                    className="underline underline-offset-2"
                    to="/leads/$leadId"
                    params={{ leadId: match.id }}
                  >
                    {match.fullName}
                  </Link>{" "}
                  matches {match.matchedFields.join(" and ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {duplicatePending && <p role="status">Checking for matching leads…</p>}
        {duplicateError && (
          <p role="status">Duplicate check unavailable: {duplicateError}</p>
        )}
        {submitError && <p role="alert">{submitError}</p>}
        {savedLead && <p role="status">Lead saved successfully.</p>}
        <div className="flex flex-wrap gap-4 pt-2">
          <button
            className={buttonClass}
            type="submit"
            disabled={
              form.formState.isSubmitting ||
              lookupFailure ||
              venues.isPending ||
              consultants.isPending
            }
          >
            {form.formState.isSubmitting
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create lead"}
          </button>
          {editing ? (
            <Link
              className="rounded px-3 py-2 underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
              to="/leads/$leadId"
              params={{ leadId: leadId ?? "" }}
            >
              Cancel
            </Link>
          ) : (
            <Link
              className="rounded px-3 py-2 underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
              to="/leads"
            >
              Cancel
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}

async function loadDuplicates(query: string) {
  return (
    await apiRequest(`/v1/leads/duplicates?${query}`, duplicatesResponseSchema)
  ).data;
}

const controlClass =
  "min-h-11 rounded border border-[#777] bg-white px-3 py-2 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800";
const buttonClass =
  "min-h-11 rounded bg-[#243b2e] px-4 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-60";

function Field({
  label,
  name,
  form,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: "fullName" | "phone" | "email" | "nextFollowUpDate";
  form: ReturnType<typeof useForm<LeadCreateInput>>;
  type?: string;
  autoComplete?: string;
}) {
  const id = name;
  const error = form.formState.errors[name]?.message;
  return (
    <label className="grid gap-1 font-medium" htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        className={controlClass}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...form.register(
          name,
          name === "nextFollowUpDate"
            ? { setValueAs: (value: string) => value || null }
            : undefined,
        )}
      />
      {error && (
        <span
          id={`${id}-error`}
          className="text-sm font-normal text-red-700"
          role="alert"
        >
          {error}
        </span>
      )}
    </label>
  );
}

function LookupSelect({
  label,
  name,
  items,
  error,
  register,
}: {
  label: string;
  name: string;
  items: { id: string; name: string; active: boolean }[];
  error?: string;
  register: ReturnType<ReturnType<typeof useForm<LeadCreateInput>>["register"]>;
}) {
  return (
    <label className="grid gap-1 font-medium" htmlFor={name}>
      {label}
      <select
        id={name}
        className={controlClass}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        {...register}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id} disabled={!item.active}>
            {item.name}
            {item.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
      {error && (
        <span
          id={`${name}-error`}
          className="text-sm font-normal text-red-700"
          role="alert"
        >
          {error}
        </span>
      )}
    </label>
  );
}
