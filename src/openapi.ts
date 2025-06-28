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
      }
    }
  }
}; 