import { createFileRoute } from "@tanstack/react-router";

function HomePage() {
  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-sm text-[#555a53]">Case Study B</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Lead management setup
      </h1>
      <p className="mt-4 leading-7 text-[#454a43]">
        The lead management foundation is ready. Lead workflows will appear here
        when the API and data model are added.
      </p>
    </div>
  );
}

export const Route = createFileRoute("/")({ component: HomePage });
