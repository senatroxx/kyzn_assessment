import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import {
  consultantsResponseSchema,
  leadListResponseSchema,
  leadSources,
  leadStatuses,
  type LeadListQuery,
  type LeadListResponse,
} from "@kyzn/shared";
import { Alert, AlertDescription } from "@kyzn/ui/components/alert";
import { Badge } from "@kyzn/ui/components/badge";
import { Button } from "@kyzn/ui/components/button";
import { Input } from "@kyzn/ui/components/input";
import { Label } from "@kyzn/ui/components/label";
import { Skeleton } from "@kyzn/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kyzn/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kyzn/ui/components/table";
import { apiRequest } from "../../lib/api";
import { leadQueryKeys } from "../../lib/query-keys";

const sortLabels = {
  createdAt: "Created date",
  nextFollowUpDate: "Next follow-up",
} as const;

function listPath(query: LeadListQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `/v1/leads?${params}`;
}

export function LeadList() {
  const search = useSearch({ from: "/leads/" });
  const navigate = useNavigate({ from: "/leads/" });
  const [searchText, setSearchText] = useState(search.search);

  useEffect(() => setSearchText(search.search), [search.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText !== search.search) {
        void navigate({
          search: (current: LeadListQuery) => ({
            ...current,
            search: searchText,
            page: 1,
          }),
        });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [navigate, search.search, searchText]);

  const listQuery = useQuery({
    queryKey: leadQueryKeys.list(search),
    queryFn: () => apiRequest(listPath(search), leadListResponseSchema),
  });
  const consultantsQuery = useQuery({
    queryKey: [...leadQueryKeys.lookups(), "consultants"],
    queryFn: () => apiRequest("/v1/consultants", consultantsResponseSchema),
  });
  const rows = listQuery.data?.data ?? [];
  const consultantNames = useMemo(
    () =>
      new Map(
        consultantsQuery.data?.data.map((person) => [person.id, person.name]),
      ),
    [consultantsQuery.data],
  );
  const columns = useMemo(
    () => makeColumns(consultantNames),
    [consultantNames],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: listQuery.data?.meta.totalPages ?? 0,
  });

  function updateQuery(patch: Partial<LeadListQuery>) {
    void navigate({
      search: (current: LeadListQuery) => ({ ...current, ...patch }),
    });
  }

  function clearFilters() {
    setSearchText("");
    void navigate({
      search: {
        search: "",
        sortBy: "createdAt",
        sortOrder: "desc",
        page: 1,
        pageSize: search.pageSize,
      },
    });
  }

  const hasFilters = Boolean(
    search.search || search.source || search.consultantId || search.status,
  );
  const data = listQuery.data;
  const sortButton = (sortBy: LeadListQuery["sortBy"]) => (
    <Button
      type="button"
      className="min-h-11"
      variant="outline"
      size="sm"
      aria-pressed={search.sortBy === sortBy}
      onClick={() => updateQuery({ sortBy, page: 1 })}
    >
      {sortLabels[sortBy]}
      {search.sortBy === sortBy
        ? search.sortOrder === "asc"
          ? " ↑"
          : " ↓"
        : ""}
    </Button>
  );
  const toggleSortOrder = () =>
    updateQuery({
      sortOrder: search.sortOrder === "asc" ? "desc" : "asc",
      page: 1,
    });

  return (
    <section aria-labelledby="list-heading">
      <h2 id="list-heading" className="sr-only">
        Lead list
      </h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Label className="text-sm font-medium" htmlFor="lead-search">
          Search name, phone, or email
          <Input
            id="lead-search"
            className="mt-1 min-h-11 w-full font-normal"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </Label>
        <div className="grid gap-1 text-sm font-medium">
          <Label htmlFor="lead-source">Source</Label>
          <Select
            value={search.source ?? "all"}
            onValueChange={(value) =>
              updateQuery({
                source:
                  value === "all"
                    ? undefined
                    : (value as LeadListQuery["source"]),
                page: 1,
              })
            }
          >
            <SelectTrigger
              id="lead-source"
              className="mt-1 min-h-11 w-full font-normal"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {leadSources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1 text-sm font-medium">
          <Label htmlFor="lead-consultant">Consultant</Label>
          <Select
            value={search.consultantId ?? "all"}
            onValueChange={(value) =>
              updateQuery({
                consultantId: value === "all" ? undefined : value,
                page: 1,
              })
            }
          >
            <SelectTrigger
              id="lead-consultant"
              className="mt-1 min-h-11 w-full font-normal"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All consultants</SelectItem>
              {consultantsQuery.data?.data.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1 text-sm font-medium">
          <Label htmlFor="lead-status">Status</Label>
          <Select
            value={search.status ?? "all"}
            onValueChange={(value) =>
              updateQuery({
                status:
                  value === "all"
                    ? undefined
                    : (value as LeadListQuery["status"]),
                page: 1,
              })
            }
          >
            <SelectTrigger
              id="lead-status"
              className="mt-1 min-h-11 w-full font-normal"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {leadStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Sort leads"
        >
          <span className="text-sm">Sort:</span>
          {sortButton("createdAt")}
          {sortButton("nextFollowUpDate")}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={toggleSortOrder}
            aria-label={`Change sort order to ${search.sortOrder === "asc" ? "descending" : "ascending"}`}
          >
            {search.sortOrder === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearFilters}
          disabled={
            !hasFilters &&
            search.sortBy === "createdAt" &&
            search.sortOrder === "desc" &&
            search.page === 1
          }
        >
          Clear filters
        </Button>
        <div className="flex items-center text-sm">
          <Label htmlFor="lead-page-size">Rows per page</Label>
          <Select
            value={String(search.pageSize)}
            onValueChange={(value) =>
              updateQuery({ pageSize: Number(value), page: 1 })
            }
          >
            <SelectTrigger id="lead-page-size" className="ml-2 min-h-11 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {listQuery.isPending ? (
        <div role="status" className="space-y-3 py-4">
          <span className="sr-only">Loading leads…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {listQuery.isError ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>
            Could not load leads: {listQuery.error.message}
          </AlertDescription>
          <Button
            type="button"
            className="mt-2"
            variant="outline"
            size="sm"
            onClick={() => void listQuery.refetch()}
          >
            Retry
          </Button>
        </Alert>
      ) : null}
      {data && data.meta.total === 0 ? (
        <p role="status" className="py-8">
          {hasFilters
            ? "No leads match these filters."
            : "No leads yet. Create your first lead to get started."}{" "}
          {hasFilters ? (
            <Link className="underline" to="/leads/new">
              Create a lead
            </Link>
          ) : null}
        </p>
      ) : null}
      {data && data.meta.total > 0 && rows.length === 0 ? (
        <p role="status" className="py-8">
          No leads on this page.
        </p>
      ) : null}
      {data && rows.length > 0 ? (
        <>
          <div className="w-full overflow-hidden rounded-sm border border-[#d5d9d1]">
            <Table className="w-full text-left text-xs sm:table-fixed sm:text-sm">
              <TableHeader className="hidden bg-[#f1f3ef] sm:table-header-group">
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        scope="col"
                        className="break-words p-2 font-semibold sm:p-3"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="divide-y divide-[#e1e4df]">
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="block border-b border-[#e1e4df] align-top sm:table-row"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="block break-words p-2 sm:table-cell sm:p-3"
                      >
                        <span className="mb-1 block font-semibold text-[#555a53] sm:hidden">
                          {columnLabels[cell.column.id]}
                        </span>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              Showing {(data.meta.page - 1) * data.meta.pageSize + 1}–
              {Math.min(data.meta.page * data.meta.pageSize, data.meta.total)}{" "}
              of {data.meta.total}
            </p>
            <nav
              aria-label="Lead list pages"
              className="flex items-center gap-2"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={data.meta.page <= 1}
                onClick={() => updateQuery({ page: data.meta.page - 1 })}
              >
                Previous
              </Button>
              <span aria-live="polite">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={data.meta.page >= data.meta.totalPages}
                onClick={() => updateQuery({ page: data.meta.page + 1 })}
              >
                Next
              </Button>
            </nav>
          </div>
        </>
      ) : null}
    </section>
  );
}

const columnLabels: Record<string, string> = {
  name: "Name / contact",
  source: "Source",
  consultantId: "Consultant",
  status: "Status",
  nextFollowUpDate: "Next follow-up",
  createdAt: "Created",
  isDuplicate: "Duplicate",
};

function makeColumns(
  consultantNames: Map<string, string>,
): ColumnDef<LeadListResponse["data"][number]>[] {
  return [
    {
      id: "name",
      header: "Name / contact",
      cell: ({ row }) => (
        <Link
          className="font-medium text-[#24533d] underline underline-offset-2 focus-visible:outline-2"
          to="/leads/$leadId"
          params={{ leadId: row.original.id }}
        >
          {row.original.fullName}
          <span className="mt-1 block font-normal text-[#555a53]">
            {row.original.phone}
            <br />
            {row.original.email}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ getValue }) => String(getValue()).replaceAll("_", " "),
    },
    {
      accessorKey: "consultantId",
      header: "Consultant",
      cell: ({ getValue }) =>
        consultantNames.get(String(getValue())) ?? "Unknown consultant",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => (
        <Badge variant="secondary">
          {String(getValue()).replaceAll("_", " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "nextFollowUpDate",
      header: "Next follow-up",
      cell: ({ getValue }) => (getValue() ? String(getValue()) : "—"),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ getValue }) => new Date(String(getValue())).toLocaleDateString(),
    },
    {
      accessorKey: "isDuplicate",
      header: "Duplicate",
      cell: ({ getValue }) =>
        getValue() ? <Badge variant="outline">Potential duplicate</Badge> : "—",
    },
  ];
}
