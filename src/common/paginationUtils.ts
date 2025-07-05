import { D1Database } from "@cloudflare/workers-types";
import { jsonResponse } from "./utils";

interface PaginateOptions {
  tableName: string;
  searchField?: string;
  defaultLimit?: number;
}

/**
 * D1 데이터베이스에 대한 페이지네이션 및 검색을 처리하는 공통 유틸리티 함수
 * @param request - 수신된 Request 객체
 * @param db - D1 Database 인스턴스
 * @param options - 테이블 이름, 검색 필드 등 페이지네이션 옵션
 * @returns 표준화된 페이지네이션 응답을 포함하는 Response 객체
 */
export async function paginate(
  request: Request,
  db: D1Database,
  options: PaginateOptions
) {
  const { tableName, searchField, defaultLimit = 10 } = options;
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || `${defaultLimit}`, 10);
  const search = searchParams.get("search") || "";
  const offset = (page - 1) * limit;

  let dataQuery: D1PreparedStatement;
  let countQuery: D1PreparedStatement;

  const baseDataQuery = `SELECT * FROM ${tableName}`;
  const baseCountQuery = `SELECT count(*) as count FROM ${tableName}`;

  if (search && searchField) {
    const whereClause = `WHERE ${searchField} LIKE ?`;
    const searchTerm = `%${search}%`;
    
    dataQuery = db
      .prepare(`${baseDataQuery} ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .bind(searchTerm, limit, offset);
    countQuery = db.prepare(`${baseCountQuery} ${whereClause}`).bind(searchTerm);
  } else {
    dataQuery = db
      .prepare(`${baseDataQuery} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset);
    countQuery = db.prepare(baseCountQuery);
  }

  try {
    const [dataResult, countResult] = await Promise.all([
      dataQuery.all(),
      countQuery.first<{ count: number }>()
    ]);
    
    const data = dataResult.results || [];
    const totalItems = countResult?.count || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return jsonResponse({
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