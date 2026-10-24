import { createRootRoute, Outlet, useRouter } from "@tanstack/react-router";
import { Alert, AlertTitle } from "@kyzn/ui/components/alert";
import { Button } from "@kyzn/ui/components/button";

function RootLayout() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <a className="sr-only focus:not-sr-only" href="#main-content">
        Skip to content
      </a>
      <header className="mb-12 border-b border-[#d5d7cf] pb-5">
        <p className="font-semibold tracking-tight">
          KYZN <span className="font-normal text-[#555a53]">/ Dashboard</span>
        </p>
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
    <Alert role="alert" variant="destructive">
      <AlertTitle>This page could not load.</AlertTitle>
      <Button variant="ghost" onClick={() => router.invalidate()}>
        Try again
      </Button>
    </Alert>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: () => <p role="status">Loading page…</p>,
  errorComponent: RouteError,
  notFoundComponent: () => <p>Page not found.</p>,
});
