import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/leads/$leadId/edit")({
  component: LeadEditPlaceholder,
});

function LeadEditPlaceholder() {
  const { leadId } = Route.useParams();
  return (
    <section aria-labelledby="edit-heading" className="max-w-2xl">
      <h2 id="edit-heading" className="text-xl font-semibold">
        Edit lead
      </h2>
      <p className="mt-3 leading-7 text-[#454a43]">
        Editing lead {leadId} will be available when the lead API is available.
      </p>
      <p className="mt-5">
        <Link
          className="underline underline-offset-4"
          to="/leads/$leadId"
          params={{ leadId }}
        >
          Back to lead details
        </Link>
      </p>
    </section>
  );
}
