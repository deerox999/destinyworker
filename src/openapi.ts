export const openApiSpec = {
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
  paths: {
    "/api/users": {
      get: {
        summary: "사용자 목록 조회",
        description: "등록된 모든 사용자의 목록을 반환합니다.",
        responses: {
          "200": {
            description: "사용자 목록 조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/User"
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: "새 사용자 생성",
        description: "새로운 사용자를 생성합니다.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateUser"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "사용자 생성 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User"
                }
              }
            }
          }
        }
      }
    },
    "/api/users/{id}": {
      get: {
        summary: "특정 사용자 조회",
        description: "ID로 특정 사용자 정보를 조회합니다.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "사용자 ID",
            schema: {
              type: "integer"
            }
          }
        ],
        responses: {
          "200": {
            description: "사용자 조회 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User"
                }
              }
            }
          },
          "404": {
            description: "사용자를 찾을 수 없음"
          }
        }
      }
    },
    "/api/comments": {
      get: {
        summary: "댓글 목록 조회",
        description: "D1 데이터베이스에서 댓글 목록을 조회합니다.",
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
    "/api/saju/calculate": {
      post: {
        summary: "사주 계산",
        description: "생년월일과 시간을 입력받아 사주를 계산합니다.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SajuRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "사주 계산 성공",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SajuResult"
                }
              }
            }
          }
        }
      }
    },
    "/api/health": {
      get: {
        summary: "헬스체크",
        description: "서버 상태를 확인합니다.",
        responses: {
          "200": {
            description: "서버 정상",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthCheck"
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
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
      }
    }
  }
}; 