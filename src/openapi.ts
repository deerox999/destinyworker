import { API_TAGS } from './openapi/tags';
import { addTagsToOpenApiSpec } from './openapi/utils';

const baseOpenApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Destiny API",
    version: "1.0.0",
    description: "사주 서비스를 위한 백엔드 API",
  },
  servers: [
    {
      url: "http://localhost:9393",
      description: "로컬 개발 서버"
    }
  ],
  tags: API_TAGS,
  paths: {
    "/api/comments": {
      get: {
        summary: "댓글 목록 조회",
        description: "댓글 목록을 조회합니다.",
        responses: {
          "200": {
            description: "댓글 목록 조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Comment"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/json": {
      post: {
        summary: "JSON 데이터 저장",
        description: "사용자의 JSON 데이터를 저장합니다.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SaveJsonRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "JSON 데이터 저장 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SaveJsonResponse"
                }
              }
            }
          },
          "400": {
            description: "잘못된 요청",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            description: "서버 오류",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/json/{userId}": {
      get: {
        summary: "JSON 데이터 조회",
        description: "특정 사용자의 저장된 JSON 데이터를 조회합니다.",
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            description: "사용자 ID",
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "JSON 데이터 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GetJsonResponse"
                }
              }
            }
          },
          "404": {
            description: "데이터를 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            description: "서버 오류",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/auth/google/login": {
      post: {
        summary: "Google OAuth 로그인",
        description: "Google ID 토큰을 사용하여 로그인하고 JWT 토큰을 받습니다.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GoogleLoginRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "로그인 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LoginResponse"
                }
              }
            }
          },
          "400": {
            description: "잘못된 요청",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        summary: "로그아웃",
        description: "현재 세션을 종료합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "로그아웃 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SuccessResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/auth/me": {
      get: {
        summary: "사용자 정보 조회",
        description: "현재 로그인한 사용자의 정보를 조회합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "사용자 정보 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserInfoResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "사용자를 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/auth/refresh": {
      post: {
        summary: "토큰 갱신",
        description: "만료되기 전에 JWT 토큰을 갱신합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "토큰 갱신 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RefreshTokenResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/saju-profiles": {
      get: {
        summary: "사주 프로필 목록 조회",
        description: "로그인한 사용자의 모든 사주 프로필을 최신순으로 조회합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "사주 프로필 목록 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SajuProfileListResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      post: {
        summary: "사주 프로필 생성",
        description: "새로운 사주 프로필을 생성합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SajuProfileRequest"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "사주 프로필 생성 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SajuProfileCreateResponse"
                }
              }
            }
          },
          "400": {
            description: "잘못된 요청",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/saju-profiles/{id}": {
      get: {
        summary: "특정 사주 프로필 조회",
        description: "특정 사주 프로필의 상세 정보를 조회합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "사주 프로필 ID",
            schema: {
              type: "integer"
            }
          }
        ],
        responses: {
          "200": {
            description: "사주 프로필 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SajuProfileResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "권한 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "프로필을 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      put: {
        summary: "사주 프로필 수정",
        description: "기존 사주 프로필을 수정합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "사주 프로필 ID",
            schema: {
              type: "integer"
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SajuProfileRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "사주 프로필 수정 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SajuProfileUpdateResponse"
                }
              }
            }
          },
          "400": {
            description: "잘못된 요청",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "권한 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "프로필을 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      delete: {
        summary: "사주 프로필 삭제",
        description: "기존 사주 프로필을 삭제합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "사주 프로필 ID",
            schema: {
              type: "integer"
            }
          }
        ],
        responses: {
          "200": {
            description: "사주 프로필 삭제 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SuccessResponse"
                }
              }
            }
          },
          "401": {
            description: "인증 실패",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "권한 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "프로필을 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/celebrities": {
      get: {
        summary: "유명인물 목록 조회",
        description: "유명인물 사주 프로필 목록을 페이징과 검색 기능으로 조회합니다. 인증이 필요하지 않습니다.",
        parameters: [
          {
            name: "page",
            in: "query",
            description: "페이지 번호 (기본값: 1)",
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            }
          },
          {
            name: "limit",
            in: "query",
            description: "페이지당 항목 수 (기본값: 20, 최대: 50)",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              default: 20
            }
          },
          {
            name: "search",
            in: "query",
            description: "검색어 (이름, 직업, 설명에서 검색)",
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "유명인물 목록 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CelebrityListResponse"
                }
              }
            }
          },
          "500": {
            description: "서버 오류",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      post: {
        summary: "유명인물 생성",
        description: "새로운 유명인물 사주 프로필을 생성합니다. 관리자 권한이 필요합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CelebrityRequest"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "유명인물 생성 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CelebrityCreateResponse"
                }
              }
            }
          },
          "400": {
            description: "잘못된 요청",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "관리자 권한 필요",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "이미 존재하는 ID",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/celebrities/{id}": {
      get: {
        summary: "특정 유명인물 조회",
        description: "특정 유명인물의 사주 프로필을 조회합니다. 인증이 필요하지 않습니다.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "유명인물 ID",
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "유명인물 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CelebrityResponse"
                }
              }
            }
          },
          "404": {
            description: "유명인물을 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      put: {
        summary: "유명인물 수정",
        description: "기존 유명인물 사주 프로필을 수정합니다. 관리자 권한이 필요합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "유명인물 ID",
            schema: {
              type: "string"
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CelebrityRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "유명인물 수정 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SuccessResponse"
                }
              }
            }
          },
          "400": {
            description: "잘못된 요청",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "관리자 권한 필요",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "유명인물을 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "변경하려는 ID가 이미 존재",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      delete: {
        summary: "유명인물 삭제",
        description: "기존 유명인물 사주 프로필을 삭제합니다. 관리자 권한이 필요합니다.",
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "유명인물 ID",
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "유명인물 삭제 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SuccessResponse"
                }
              }
            }
          },
          "403": {
            description: "관리자 권한 필요",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "유명인물을 찾을 수 없음",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "사용자 ID"
          },
          name: {
            type: "string",
            description: "사용자 이름"
          },
          email: {
            type: "string",
            format: "email",
            description: "이메일 주소"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "생성 일시"
          }
        }
      },
      CreateUser: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: {
            type: "string",
            description: "사용자 이름"
          },
          email: {
            type: "string",
            format: "email",
            description: "이메일 주소"
          }
        }
      },
      Comment: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "댓글 ID"
          },
          author: {
            type: "string",
            description: "작성자"
          },
          body: {
            type: "string",
            description: "댓글 내용"
          }
        }
      },
      SajuRequest: {
        type: "object",
        required: ["year", "month", "day", "hour"],
        properties: {
          year: {
            type: "integer",
            description: "연도"
          },
          month: {
            type: "integer",
            description: "월"
          },
          day: {
            type: "integer",
            description: "일"
          },
          hour: {
            type: "integer",
            description: "시간"
          },
          minute: {
            type: "integer",
            description: "분"
          }
        }
      },
      SajuResult: {
        type: "object",
        properties: {
          년주: {
            type: "string",
            description: "년주"
          },
          월주: {
            type: "string",
            description: "월주"
          },
          일주: {
            type: "string",
            description: "일주"
          },
          시주: {
            type: "string",
            description: "시주"
          },
          대운: {
            type: "array",
            items: {
              type: "string"
            },
            description: "대운"
          }
        }
      },
      HealthCheck: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "서버 상태"
          },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "확인 시각"
          },
          version: {
            type: "string",
            description: "API 버전"
          }
        }
      },
      GoogleLoginRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: {
            type: "string",
            description: "Google ID 토큰"
          }
        }
      },
      LoginResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "로그인 성공 여부"
          },
          token: {
            type: "string",
            description: "JWT 토큰"
          },
          user: {
            $ref: "#/components/schemas/AuthUser"
          }
        }
      },
      AuthUser: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "사용자 ID"
          },
          email: {
            type: "string",
            format: "email",
            description: "이메일 주소"
          },
          name: {
            type: "string",
            description: "사용자 이름"
          },
          picture: {
            type: "string",
            description: "프로필 이미지 URL"
          }
        }
      },
      UserInfoResponse: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "사용자 ID"
              },
              email: {
                type: "string",
                format: "email",
                description: "이메일 주소"
              },
              name: {
                type: "string",
                description: "사용자 이름"
              },
              picture: {
                type: "string",
                description: "프로필 이미지 URL"
              },
              created_at: {
                type: "string",
                format: "date-time",
                description: "계정 생성일"
              }
            }
          }
        }
      },
      RefreshTokenResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "토큰 갱신 성공 여부"
          },
          token: {
            type: "string",
            description: "새로운 JWT 토큰"
          }
        }
      },
      SuccessResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "작업 성공 여부"
          },
          message: {
            type: "string",
            description: "성공 메시지"
          }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "string",
            description: "오류 메시지"
          }
        }
      },
      SaveJsonRequest: {
        type: "object",
        required: ["userId", "data"],
        properties: {
          userId: {
            type: "string",
            description: "사용자 ID"
          },
          data: {
            type: "object",
            description: "저장할 JSON 데이터 (any 타입)"
          }
        }
      },
      SaveJsonResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "저장 성공 여부"
          },
          id: {
            type: "integer",
            description: "저장된 데이터의 ID"
          },
          message: {
            type: "string",
            description: "성공 메시지"
          }
        }
      },
      GetJsonResponse: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "사용자 ID"
          },
          records: {
            type: "array",
            items: {
              $ref: "#/components/schemas/JsonRecord"
            },
            description: "저장된 JSON 데이터 목록"
          },
          count: {
            type: "integer",
            description: "총 레코드 수"
          }
        }
      },
      JsonRecord: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "데이터 ID"
          },
          data: {
            type: "object",
            description: "저장된 JSON 데이터"
          },
          created_at: {
            type: "string",
            format: "date-time",
            description: "생성 일시"
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description: "수정 일시"
          }
        }
      },
      SajuProfileRequest: {
        type: "object",
        required: ["이름", "년", "월", "일", "시간", "분", "달력", "성별"],
        properties: {
          "이름": {
            type: "string",
            description: "이름"
          },
          "년": {
            type: "string",
            pattern: "^\\d{4}$",
            description: "출생년도 (4자리)"
          },
          "월": {
            type: "string",
            pattern: "^(0[1-9]|1[0-2])$",
            description: "출생월 (01-12)"
          },
          "일": {
            type: "string",
            pattern: "^(0[1-9]|[12]\\d|3[01])$",
            description: "출생일 (01-31)"
          },
          "시간": {
            type: "string",
            pattern: "^([01]\\d|2[0-3])$",
            description: "출생시간 (00-23)"
          },
          "분": {
            type: "string",
            pattern: "^[0-5]\\d$",
            description: "출생분 (00-59)"
          },
          "달력": {
            type: "string",
            enum: ["양력", "음력"],
            description: "달력 종류"
          },
          "성별": {
            type: "string",
            enum: ["남자", "여자"],
            description: "성별"
          }
        }
      },
      SajuProfile: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "프로필 ID"
          },
          "이름": {
            type: "string",
            description: "이름"
          },
          "년": {
            type: "string",
            description: "출생년도"
          },
          "월": {
            type: "string",
            description: "출생월"
          },
          "일": {
            type: "string",
            description: "출생일"
          },
          "시간": {
            type: "string",
            description: "출생시간"
          },
          "분": {
            type: "string",
            description: "출생분"
          },
          "달력": {
            type: "string",
            description: "달력 종류"
          },
          "성별": {
            type: "string",
            description: "성별"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "생성 일시"
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "수정 일시"
          }
        }
      },
      SajuProfileListResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "조회 성공 여부"
          },
          profiles: {
            type: "array",
            items: {
              $ref: "#/components/schemas/SajuProfile"
            },
            description: "사주 프로필 목록"
          },
          count: {
            type: "integer",
            description: "총 프로필 수"
          }
        }
      },
      SajuProfileResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "조회 성공 여부"
          },
          profile: {
            $ref: "#/components/schemas/SajuProfile"
          }
        }
      },
      SajuProfileCreateResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "생성 성공 여부"
          },
          id: {
            type: "integer",
            description: "생성된 프로필 ID"
          },
          message: {
            type: "string",
            description: "성공 메시지"
          }
        }
      },
      SajuProfileUpdateResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "수정 성공 여부"
          },
          id: {
            type: "integer",
            description: "수정된 프로필 ID"
          },
          message: {
            type: "string",
            description: "성공 메시지"
          }
        }
      },
      CelebrityRequest: {
        type: "object",
        required: ["id", "이름", "년", "월", "일", "달력", "성별", "직업", "설명"],
        properties: {
          id: {
            type: "string",
            description: "유명인물 고유 ID (예: lee-seung-man)"
          },
          "이름": {
            type: "string",
            description: "이름"
          },
          "년": {
            type: "string",
            pattern: "^\\d{4}$",
            description: "출생년도 (4자리)"
          },
          "월": {
            type: "string",
            pattern: "^(0[1-9]|1[0-2])$",
            description: "출생월 (01-12)"
          },
          "일": {
            type: "string",
            pattern: "^(0[1-9]|[12]\\d|3[01])$",
            description: "출생일 (01-31)"
          },
          "달력": {
            type: "string",
            enum: ["양력", "음력"],
            description: "달력 종류"
          },
          "성별": {
            type: "string",
            enum: ["남자", "여자"],
            description: "성별"
          },
          "직업": {
            type: "string",
            description: "직업"
          },
          "설명": {
            type: "string",
            description: "설명"
          },
          "썸네일": {
            type: "string",
            description: "썸네일 이미지 URL (선택사항)"
          }
        }
      },
      CelebrityProfile: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "유명인물 고유 ID"
          },
          "이름": {
            type: "string",
            description: "이름"
          },
          "년": {
            type: "string",
            description: "출생년도"
          },
          "월": {
            type: "string",
            description: "출생월"
          },
          "일": {
            type: "string",
            description: "출생일"
          },
          "달력": {
            type: "string",
            description: "달력 종류"
          },
          "성별": {
            type: "string",
            description: "성별"
          },
          "직업": {
            type: "string",
            description: "직업"
          },
          "설명": {
            type: "string",
            description: "설명"
          },
          "썸네일": {
            type: "string",
            description: "썸네일 이미지 URL"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "생성 일시"
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "수정 일시"
          }
        }
      },
      CelebrityListResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "조회 성공 여부"
          },
          profiles: {
            type: "array",
            items: {
              $ref: "#/components/schemas/CelebrityProfile"
            },
            description: "유명인물 프로필 목록"
          },
          pagination: {
            type: "object",
            properties: {
              page: {
                type: "integer",
                description: "현재 페이지"
              },
              limit: {
                type: "integer",
                description: "페이지당 항목 수"
              },
              total: {
                type: "integer",
                description: "총 항목 수"
              },
              totalPages: {
                type: "integer",
                description: "총 페이지 수"
              },
              hasNext: {
                type: "boolean",
                description: "다음 페이지 존재 여부"
              },
              hasPrev: {
                type: "boolean",
                description: "이전 페이지 존재 여부"
              }
            }
          }
        }
      },
      CelebrityResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "조회 성공 여부"
          },
          profile: {
            $ref: "#/components/schemas/CelebrityProfile"
          }
        }
      },
      CelebrityCreateResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "생성 성공 여부"
          },
          id: {
            type: "string",
            description: "생성된 유명인물 ID"
          },
          message: {
            type: "string",
            description: "성공 메시지"
          }
        }
      }
    }
  }
};

// 자동으로 태그를 추가하여 최종 OpenAPI 스펙 생성
export const openApiSpec = addTagsToOpenApiSpec(baseOpenApiSpec); 