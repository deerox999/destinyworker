import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
    SuccessSchema,
    TagQuerySchema,
    TagSchema
} from "../../common/schemas";
import { tagApi } from './tagApi';

export function createTagRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 태그 목록 조회 라우트
  const getTagsRoute = createRoute({
    method: "get",
    path: "/",
    summary: "태그 목록 조회",
    description: "태그 목록을 조회합니다.",
    tags: ["태그"],
    request: {
      query: TagQuerySchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z.array(TagSchema).openapi({ type: 'array' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // 인기 태그 조회 라우트
  // const getPopularTagsRoute = createRoute({
  //   method: "get",
  //   path: "/popular",
  //   summary: "인기 태그 조회",
  //   description: "가장 많이 사용된 인기 태그 목록을 조회합니다.",
  //   tags: ["태그"],
  //   request: {
  //     query: z.object({
  //       limit: z.coerce.number().int().positive().default(10).optional().openapi({
  //         param: { name: "limit", in: "query" },
  //         description: "조회할 태그 수",
  //         example: 10,
  //       }),
  //     }).openapi({ type: 'object' }),
  //   },
  //   responses: {
  //     200: {
  //       description: "성공",
  //       content: {
  //         "application/json": {
  //           schema: SuccessSchema.extend({
  //             data: z.array(TagSchema.extend({
  //               _count: z.object({
  //                 postTags: z.number().int().openapi({ example: 15 }),
  //               }).openapi({ type: 'object' }),
  //             })).openapi({ type: 'array' }),
  //           }).openapi({ type: 'object' }),
  //         },
  //       },
  //     },
  //     500: { description: "서버 오류" },
  //   },
  // });

  // 라우트 등록
  app.openapi(getTagsRoute, (c) => tagApi.getTags(c));
  // app.openapi(getPopularTagsRoute, (c) => tagApi.getTags(c));

  return app;
} 