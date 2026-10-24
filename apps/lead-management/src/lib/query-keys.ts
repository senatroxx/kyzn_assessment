export const leadQueryKeys = {
  all: ["leads"] as const,
  lists: () => [...leadQueryKeys.all, "list"] as const,
  list: (filters: Record<string, unknown> = {}) =>
    [...leadQueryKeys.lists(), filters] as const,
  details: () => [...leadQueryKeys.all, "detail"] as const,
  detail: (leadId: string) => [...leadQueryKeys.details(), leadId] as const,
  lookups: () => [...leadQueryKeys.all, "lookups"] as const,
};
