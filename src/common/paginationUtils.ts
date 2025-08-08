import { Context } from "hono";

// D1Database 타입 정의 (Cloudflare Workers Types가 없는 경우)
interface D1Database {
  prepare: (query: string) => D1PreparedStatement;
}

interface D1PreparedStatement {
  bind: (...values: any[]) => D1PreparedStatement;
  all: () => Promise<{ results: any[] }>;
  first: <T>() => Promise<T | null>;
}

interface PaginateOptions {
  tableName: string;
  searchField?: string;
  defaultLimit?: number;
  baseWhereClauses?: { clause: string; binding: any }[];
}

/**
 * D1 데이터베이스에 대한 페이지네이션 및 검색을 처리하는 공통 유틸리티 함수
 * @param request - 수신된 Request 객체
 * @param db - D1 Database 인스턴스
 * @param options - 테이블 이름, 검색 필드 등 페이지네이션 옵션
 * @returns 표준화된 페이지네이션 응답을 포함하는 Response 객체
 */
export async function paginate(
  c: Context,
  db: D1Database,
  options: PaginateOptions
) {
  const {
    tableName,
    searchField,
    defaultLimit = 10,
    baseWhereClauses = [],
  } = options;

  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || `${defaultLimit}`, 10);
  const search = c.req.query("search") || "";
  const sort = c.req.query("sort") || "id";
  const order = c.req.query("order") || "desc";
  const offset = (page - 1) * limit;

  const whereConditions = [...baseWhereClauses];
  if (search && searchField) {
    whereConditions.push({
      clause: `${searchField} LIKE ?`,
      binding: `%${search}%`,
    });
  }

  const whereClause =
    whereConditions.length > 0
      ? `WHERE ${whereConditions.map((c) => c.clause).join(" AND ")}`
      : "";
  const bindings = whereConditions.map((c) => c.binding);

  let dataQuery: D1PreparedStatement;
  let countQuery: D1PreparedStatement;

  const baseDataQuery = `SELECT * FROM ${tableName}`;
  const baseCountQuery = `SELECT count(*) as count FROM ${tableName}`;
  const orderByClause = `ORDER BY ${sort} ${order}`;

  dataQuery = db
    .prepare(
      `${baseDataQuery} ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`
    )
    .bind(...bindings, limit, offset);

  countQuery = db.prepare(`${baseCountQuery} ${whereClause}`).bind(...bindings);

  try {
    const [dataResult, countResult] = await Promise.all([
      dataQuery.all(),
      countQuery.first<{ count: number }>(),
    ]);

    let data = dataResult.results || [];
    if (data.length > 0 && "metadata" in data[0]) {
      data = data.map((item) => {
        try {
          const metadata =
            typeof item.metadata === "string"
              ? JSON.parse(item.metadata)
              : item.metadata;
          return { ...item, metadata };
        } catch (e) {
          // JSON 파싱 실패 시 원본 metadata 유지
          return item;
        }
      });
    }

    const totalItems = countResult?.count || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return c.json({
      data,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error(`Pagination error for table ${tableName}:`, error);
    throw new Error(`Failed to retrieve paginated data from ${tableName}.`);
  }
}

// 추가: 페이지네이션/정렬 유틸 공통 함수들
export type SortOrder = "asc" | "desc";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationOptionsEx {
  defaultPage?: number;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface SortParams {
  sort: string;
  order: SortOrder;
}

export interface SortOptions {
  allowedFields?: string[];
  defaultSort?: string;
  defaultOrder?: SortOrder;
}

export function parsePagination(
  c: Context,
  options: PaginationOptionsEx = {}
): PaginationParams {
  const { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = options;

  const rawPage = c.req.query("page");
  const rawLimit = c.req.query("limit");

  const page = Math.max(1, parseInt(rawPage || `${defaultPage}`, 10));
  const limit = Math.max(
    1,
    Math.min(maxLimit, parseInt(rawLimit || `${defaultLimit}`, 10))
  );
  const skip = (page - 1) * limit;
  const take = limit;

  return { page, limit, skip, take };
}

export function parseSort(
  c: Context,
  options: SortOptions = {}
): SortParams {
  const { allowedFields, defaultSort = "createdAt", defaultOrder = "desc" } = options;

  const sort = (c.req.query("sort") || defaultSort).toString();
  let order = (c.req.query("order") || defaultOrder).toString().toLowerCase();
  if (order !== "asc" && order !== "desc") order = defaultOrder;

  const finalSort = allowedFields && allowedFields.length > 0
    ? allowedFields.includes(sort) ? sort : defaultSort
    : sort;

  return { sort: finalSort, order: order as SortOrder };
}

export function buildPaginationMeta(totalItems: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    totalItems,
    totalPages,
    currentPage: page,
    pageSize,
  };
}