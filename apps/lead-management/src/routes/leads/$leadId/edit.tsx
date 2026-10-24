import { createFileRoute } from "@tanstack/react-router";
import { LeadForm } from "../../../features/lead-form/LeadForm";

export const Route = createFileRoute("/leads/$leadId/edit")({
  component: LeadEditRoute,
});

function LeadEditRoute() {
  const { leadId } = Route.useParams();
  return <LeadForm leadId={leadId} />;
}
