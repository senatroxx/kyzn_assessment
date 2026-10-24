import {
  createRootRoute,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router";

const dashboardUrl =
  import.meta.env.VITE_DASHBOARD_URL ?? "http://localhost:3000";

function RootLayout() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <a className="sr-only focus:not-sr-only" href="#main-content">
        Skip to content
      </a>
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#d5d7cf] pb-5">
        <Link className="font-semibold tracking-tight" to="/leads">
          KYZN{" "}
          <span className="font-normal text-[#555a53]">/ Lead management</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        >
          <Link
            activeProps={{
              className: "font-semibold underline underline-offset-4",
            }}
            className="min-h-11 inline-flex items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            to="/leads"
          >
            Leads
          </Link>
          <a
            className="min-h-11 inline-flex items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            href={dashboardUrl}
          >
            Dashboard
          </a>
        </nav>
      </header>
      <section id="main-content">
        <Outlet />
      </section>
    </main>
  );
}

function RouteError() {
  const router = useRouter();
  return (
    <p role="alert">
      This page could not load.{" "}
      <button className="underline" onClick={() => router.invalidate()}>
        Try again
      </button>
    </p>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: () => <p role="status">Loading page…</p>,
  errorComponent: RouteError,
  notFoundComponent: () => (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading" className="text-2xl font-semibold">
        Page not found
      </h1>
      <p className="mt-3 text-[#454a43]">
        That lead management page does not exist.
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center underline underline-offset-4"
        to="/leads"
      >
        Return to leads
      </Link>
    </section>
  ),
});
