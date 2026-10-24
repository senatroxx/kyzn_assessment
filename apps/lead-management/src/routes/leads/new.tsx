import { createFileRoute } from "@tanstack/react-router";
import { LeadForm } from "../../features/lead-form/LeadForm";

export const Route = createFileRoute("/leads/new")({
  component: () => <LeadForm />,
});
