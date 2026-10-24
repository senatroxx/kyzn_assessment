import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  conversionCreateSchema,
  conversionResponseSchema,
  type Conversion,
  type ConversionCreateInput,
  type LeadStatus,
} from "@kyzn/shared";
import { apiRequest, ApiRequestError } from "../../lib/api";
import { leadQueryKeys } from "../../lib/query-keys";

const eligibleStatuses: LeadStatus[] = [
  "contacted",
  "trial_scheduled",
  "trial_completed",
];
const dateTime = (value: string) => new Date(value).toLocaleString();

export function ConversionPanel({
  leadId,
  leadStatus,
  conversion,
}: {
  leadId: string;
  leadStatus: LeadStatus;
  conversion: Conversion | null;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [membershipReference, setMembershipReference] = useState("");
  const [result, setResult] = useState<Conversion | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const savedConversion = conversion ?? result;
  const eligible = eligibleStatuses.includes(leadStatus);
  const mutation = useMutation({
    mutationFn: (input: ConversionCreateInput) =>
      apiRequest(
        `/v1/leads/${encodeURIComponent(leadId)}/conversion`,
        conversionResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async (response) => {
      setResult(response.data);
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: leadQueryKeys.detail(leadId),
        }),
        queryClient.invalidateQueries({ queryKey: leadQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "metrics"] }),
      ]);
    },
  });

  useEffect(() => {
    if (confirming) noteRef.current?.focus();
  }, [confirming]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(
      conversionCreateSchema.parse({ note, membershipReference }),
    );
  }

  return (
    <section aria-labelledby="conversion-action-heading" className="mt-4">
      <h4 id="conversion-action-heading" className="font-semibold">
        Paid membership
      </h4>
      {savedConversion ? (
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-[#555a53]">Converted</dt>
            <dd>
              <time dateTime={savedConversion.convertedAt}>
                {dateTime(savedConversion.convertedAt)}
              </time>
            </dd>
          </div>
          {savedConversion.note && (
            <div>
              <dt className="text-sm text-[#555a53]">Note</dt>
              <dd>{savedConversion.note}</dd>
            </div>
          )}
          {savedConversion.membershipReference && (
            <div>
              <dt className="text-sm text-[#555a53]">Membership reference</dt>
              <dd>{savedConversion.membershipReference}</dd>
            </div>
          )}
        </dl>
      ) : !eligible ? (
        <>
          <p className="mt-2">No conversion recorded.</p>
          <p className="mt-2">
            Conversion is unavailable for this lead status.
          </p>
        </>
      ) : !confirming ? (
        <>
          <p className="mt-2">No conversion recorded.</p>
          <button
            type="button"
            className="mt-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setConfirming(true)}
          >
            Record paid membership
          </button>
        </>
      ) : (
        <form className="mt-2 space-y-3" onSubmit={submit}>
          <p>
            Confirm that payment has been recorded. This is a manual business
            record; no payment is processed.
          </p>
          <div>
            <label htmlFor="conversion-note" className="block text-sm">
              Note (optional)
            </label>
            <input
              ref={noteRef}
              id="conversion-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 rounded-sm border border-[#aeb5aa] p-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
          <div>
            <label htmlFor="membership-reference" className="block text-sm">
              Membership reference (optional)
            </label>
            <input
              id="membership-reference"
              value={membershipReference}
              onChange={(event) => setMembershipReference(event.target.value)}
              className="mt-1 rounded-sm border border-[#aeb5aa] p-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
          {mutation.isError && (
            <p role="alert">
              {mutation.error instanceof ApiRequestError
                ? mutation.error.message
                : "Could not record the conversion. Try again."}
            </p>
          )}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="underline underline-offset-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {mutation.isPending ? "Recording…" : "Confirm conversion"}
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setConfirming(false);
                mutation.reset();
              }}
              className="underline underline-offset-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
