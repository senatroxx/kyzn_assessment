import type { LeadStatus } from "@kyzn/shared";
import { Badge } from "@kyzn/ui/components/badge";

const statusStyles: Record<LeadStatus, string> = {
  new: "border-sky-300 bg-sky-50 text-sky-900",
  contacted: "border-blue-300 bg-blue-50 text-blue-900",
  trial_scheduled: "border-amber-300 bg-amber-50 text-amber-950",
  trial_completed: "border-emerald-300 bg-emerald-50 text-emerald-950",
  converted: "border-green-300 bg-green-100 text-green-950",
  lost: "border-slate-300 bg-slate-100 text-slate-800",
  invalid: "border-red-300 bg-red-50 text-red-900",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const label = status.replaceAll("_", " ");
  return (
    <Badge className={statusStyles[status]} variant="outline">
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
}
