import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";

export const Route = createFileRoute("/leads")({
  component: LeadsLayout,
});

function LeadsLayout() {
  const isDetail = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/leads/$leadId/"),
  });
  return (
    <>
      {!isDetail && (
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-[#555a53]">Lead operations</p>
            <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-sm bg-[#31634c] px-4 py-2 text-sm font-medium text-white hover:bg-[#254d3a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#31634c]"
            to="/leads/new"
          >
            New lead
          </Link>
        </header>
      )}
      <Outlet />
    </>
  );
}
