import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  consultantsResponseSchema,
  duplicateQuerySchema,
  duplicatesResponseSchema,
  leadCreateSchema,
  leadDetailResponseSchema,
  venuesResponseSchema,
  type Lead,
  type LeadCreateInput,
} from "@kyzn/shared";
import { Alert, AlertDescription, AlertTitle } from "@kyzn/ui/components/alert";
import { Button } from "@kyzn/ui/components/button";
import { Card, CardContent } from "@kyzn/ui/components/card";
import { Input } from "@kyzn/ui/components/input";
import { Label } from "@kyzn/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kyzn/ui/components/select";
import { Skeleton } from "@kyzn/ui/components/skeleton";
import { apiRequest, ApiRequestError } from "../../lib/api";
import { formatBusinessDateTime } from "../../lib/dates";
import { leadQueryKeys } from "../../lib/query-keys";
import { LeadStatusBadge } from "../lead-status/LeadStatusBadge";

const sourceLabels = {
  website: "Website",
  whatsapp: "WhatsApp",
  social_media: "Social media",
  referral: "Referral",
  walk_in: "Walk-in",
  other: "Other",
} as const;
const fieldOrder = [
  "fullName",
  "phone",
  "email",
  "source",
  "venueId",
  "consultantId",
  "nextFollowUpDate",
] as const;

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
    shouldFocusError: false,
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
  const focusFirstInvalidField = (errors: typeof form.formState.errors) => {
    const first = fieldOrder.find((field) => errors[field]);
    if (first) form.setFocus(first);
  };
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
        leadDetailResponseSchema,
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

  if (editing && detail.isPending)
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading lead…</span>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-11 w-full max-w-xl" />
      </div>
    );
  if (editing && detail.isError)
    return (
      <Alert role="alert" variant="destructive">
        <AlertDescription>{detail.error.message}</AlertDescription>
      </Alert>
    );
  const lookupFailure = venues.isError || consultants.isError;
  const retryLookups = () =>
    Promise.all([
      ...(venues.isError ? [venues.refetch()] : []),
      ...(consultants.isError ? [consultants.refetch()] : []),
    ]);

  return (
    <section className="max-w-2xl" aria-labelledby="lead-form-heading">
      <h2 id="lead-form-heading" className="text-xl font-semibold">
        {editing ? "Edit lead" : "New lead"}
      </h2>
      <p className="mt-1 text-sm text-[#555a53]">
        Fields marked * are required.
      </p>
      {editing && detail.data && (
        <Card className="mt-3">
          <CardContent className="p-4">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Lead ID</dt>
                <dd className="break-all">{detail.data.data.id}</dd>
              </div>
              <div>
                <dt className="font-semibold">Created</dt>
                <dd>
                  <time dateTime={detail.data.data.createdAt}>
                    {formatBusinessDateTime(detail.data.data.createdAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Status</dt>
                <dd>
                  <LeadStatusBadge status={detail.data.data.status} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Last contacted</dt>
                <dd>
                  {detail.data.data.lastContactAt ? (
                    <time dateTime={detail.data.data.lastContactAt}>
                      {formatBusinessDateTime(detail.data.data.lastContactAt)}
                    </time>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
      {lookupFailure ? (
        <Alert role="alert" variant="destructive" className="mt-4">
          <AlertDescription>
            Could not load venues or consultants. Retry the failed lookup.
          </AlertDescription>
          <Button
            type="button"
            className="mt-2"
            variant="outline"
            size="sm"
            disabled={venues.isFetching || consultants.isFetching}
            onClick={() => void retryLookups()}
          >
            Retry lookup
          </Button>
        </Alert>
      ) : null}
      {!lookupFailure && (venues.isPending || consultants.isPending) ? (
        <div role="status" className="mt-4 space-y-2">
          <span className="sr-only">Loading venues and consultants…</span>
          <Skeleton className="h-11 w-full max-w-2xl" />
          <Skeleton className="h-11 w-full max-w-2xl" />
        </div>
      ) : null}
      <form
        className="mt-5 grid grid-cols-1 gap-4"
        noValidate
        onSubmit={form.handleSubmit(submit, focusFirstInvalidField)}
      >
        <Field
          label="Full name"
          name="fullName"
          form={form}
          required
          placeholder="Full name"
          autoComplete="name"
        />
        <Field
          label="Phone"
          name="phone"
          form={form}
          required
          placeholder="+62 812 3456 7890"
          type="tel"
          autoComplete="tel"
        />
        <Field
          label="Email"
          name="email"
          form={form}
          required
          placeholder="name@example.com"
          type="email"
          autoComplete="email"
        />
        <Controller
          control={form.control}
          name="source"
          render={({ field }) => (
            <div className="grid gap-1 font-medium">
              <Label
                htmlFor="source"
                className="inline-flex items-center gap-1 whitespace-nowrap"
              >
                Lead source <RequiredMark />
              </Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="source"
                  ref={field.ref}
                  aria-required="true"
                  aria-invalid={Boolean(form.formState.errors.source)}
                  aria-describedby={
                    form.formState.errors.source ? "source-error" : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(sourceLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.source && (
                <span id="source-error" role="alert">
                  {form.formState.errors.source.message}
                </span>
              )}
            </div>
          )}
        />
        <LookupSelect
          label="Interested venue"
          name="venueId"
          required
          items={venues.data?.data ?? []}
          error={form.formState.errors.venueId?.message}
          form={form}
        />
        <LookupSelect
          label="Assigned consultant"
          name="consultantId"
          required
          items={consultants.data?.data ?? []}
          error={form.formState.errors.consultantId?.message}
          form={form}
        />
        <Field
          label="Next follow-up date (optional)"
          name="nextFollowUpDate"
          form={form}
          type="date"
        />
        {duplicates?.length ? (
          <Alert role="status" aria-live="polite">
            <AlertTitle>
              Possible duplicate leads. You can still save this lead.
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
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
            </AlertDescription>
          </Alert>
        ) : null}
        {duplicatePending && <p role="status">Checking for matching leads…</p>}
        {duplicateError && (
          <p role="status">Duplicate check unavailable: {duplicateError}</p>
        )}
        {submitError && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        {savedLead && <p role="status">Lead saved successfully.</p>}
        <div className="flex flex-wrap gap-4 pt-2">
          <Button
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
          </Button>
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

function Field({
  label,
  name,
  form,
  required = false,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: "fullName" | "phone" | "email" | "nextFollowUpDate";
  form: ReturnType<typeof useForm<LeadCreateInput>>;
  required?: boolean;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  const id = name;
  const error = form.formState.errors[name]?.message;
  return (
    <Label className="grid gap-1 font-medium" htmlFor={id}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {label} {required && <RequiredMark />}
      </span>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
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
    </Label>
  );
}

function LookupSelect({
  label,
  name,
  items,
  error,
  required = false,
  form,
}: {
  label: string;
  name: "venueId" | "consultantId";
  items: { id: string; name: string; active: boolean }[];
  error?: string;
  required?: boolean;
  form: ReturnType<typeof useForm<LeadCreateInput>>;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <div className="grid gap-1 font-medium">
          <Label
            htmlFor={name}
            className="inline-flex items-center gap-1 whitespace-nowrap"
          >
            {label} {required && <RequiredMark />}
          </Label>
          <Select
            value={field.value}
            onValueChange={field.onChange}
            disabled={items.length === 0}
          >
            <SelectTrigger
              id={name}
              ref={field.ref}
              aria-required={required || undefined}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${name}-error` : undefined}
            >
              <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  disabled={!item.active}
                >
                  {item.name}
                  {item.active ? "" : " (inactive)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && (
            <span id={`${name}-error`} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    />
  );
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="shrink-0">
      *
    </span>
  );
}
