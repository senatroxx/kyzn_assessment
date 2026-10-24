import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/leads/")({
  component: LeadListPlaceholder,
});

function LeadListPlaceholder() {
  return (
    <section aria-labelledby="list-heading" className="max-w-2xl">
      <h2 id="list-heading" className="text-xl font-semibold">
        Lead list
      </h2>
      <p className="mt-3 leading-7 text-[#454a43]">
        Lead records will appear here when the lead API is available. No sample
        records are shown.
      </p>
      <p className="mt-5">
        <Link className="underline underline-offset-4" to="/leads/new">
          Create a lead
        </Link>
      </p>
    </section>
  );
}
