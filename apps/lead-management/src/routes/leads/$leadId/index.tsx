import { createFileRoute } from "@tanstack/react-router";
import { LeadDetail } from "../../../features/lead-detail/LeadDetail";

export const Route = createFileRoute("/leads/$leadId/")({
  component: LeadDetailRoute,
});

function LeadDetailRoute() {
  const { leadId } = Route.useParams();
  return <LeadDetail leadId={leadId} />;
}
