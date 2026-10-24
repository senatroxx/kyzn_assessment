import type { LeadListQuery } from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import { phoneSearchTerms } from "../contact-normalization.ts";
import { leadListRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function leadListService(db: Db) {
  const repository = leadListRepository(db);
  return async (query: LeadListQuery) => {
    const { rows, total } = await repository.list(
      query,
      phoneSearchTerms(query.search),
    );
    return {
      data: rows.map((row) => ({
        ...row,
        isDuplicate: Boolean(row.isDuplicate),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  };
}
