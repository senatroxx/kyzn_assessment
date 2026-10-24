import { createFileRoute } from "@tanstack/react-router";
import { leadListQuerySchema } from "@kyzn/shared";
import { LeadList } from "../../features/lead-list/lead-list";

export const Route = createFileRoute("/leads/")({
  validateSearch: (search) => leadListQuerySchema.parse(search),
  component: LeadList,
});
