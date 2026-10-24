import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@kyzn/ui/components/alert";
import { Skeleton } from "@kyzn/ui/components/skeleton";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

function createAppRouter() {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPendingComponent: () => (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading page…</span>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    ),
    defaultErrorComponent: ({ error }) => (
      <Alert role="alert" variant="destructive">
        <AlertDescription>
          {error instanceof Error ? error.message : "This page could not load."}
        </AlertDescription>
      </Alert>
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
