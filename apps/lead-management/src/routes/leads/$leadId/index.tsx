import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/leads/$leadId/")({
  component: LeadDetailPlaceholder,
});

function LeadDetailPlaceholder() {
  const { leadId } = Route.useParams();
  return (
    <section aria-labelledby="detail-heading" className="max-w-2xl">
      <h2 id="detail-heading" className="text-xl font-semibold">
        Lead details
      </h2>
      <p className="mt-3 leading-7 text-[#454a43]">
        Details for lead {leadId} will appear when the lead API is available.
      </p>
      <p className="mt-5 flex flex-wrap gap-5">
        <Link
          className="underline underline-offset-4"
          to="/leads/$leadId/edit"
          params={{ leadId }}
        >
          Edit lead
        </Link>
        <Link className="underline underline-offset-4" to="/leads">
          Back to leads
        </Link>
      </p>
    </section>
  );
}
