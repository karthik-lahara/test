/** Shared pagination rules for every list endpoint */

export const DEFAULT_PAGE_LIMIT = 20;
/** Most items one request may ask for (protects the server from ?limit=1000000) */
export const MAX_PAGE_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** How many items to skip to reach a page. Page 1 skips 0, page 2 skips one limit, ... */
export function getSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** The pagination block sent back with every list */
export function buildPagination(page: number, limit: number, total: number): Pagination {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages };
}
