import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/leads/new")({
  component: NewLeadPlaceholder,
});

function NewLeadPlaceholder() {
  return (
    <section aria-labelledby="placeholder-heading" className="max-w-2xl">
      <h2 id="placeholder-heading" className="text-xl font-semibold">
        New lead
      </h2>
      <p className="mt-3 leading-7 text-[#454a43]">
        Lead creation will be available when the lead API and workflow are
        implemented.
      </p>
      <p className="mt-5">
        <Link className="underline underline-offset-4" to="/leads">
          Back to leads
        </Link>
      </p>
    </section>
  );
}
