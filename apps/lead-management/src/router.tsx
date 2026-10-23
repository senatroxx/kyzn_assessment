import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

function createAppRouter() {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPendingComponent: () => <p role="status">Loading page…</p>,
    defaultErrorComponent: ({ error }) => (
      <p role="alert">
        {error instanceof Error ? error.message : "This page could not load."}
      </p>
    ),
  });
}

export function App() {
  const router = createAppRouter();
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
