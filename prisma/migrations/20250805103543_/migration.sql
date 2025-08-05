-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userName" TEXT,
    "picture" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "point" INTEGER NOT NULL DEFAULT 3000,
    "privacyConsent" BOOLEAN NOT NULL DEFAULT false,
    "privacyConsentVersion" TEXT NOT NULL DEFAULT '1.0',
    "privacyConsentAt" DATETIME,
    "reportStorageConsent" BOOLEAN NOT NULL DEFAULT false,
    "reportStorageConsentVersion" TEXT NOT NULL DEFAULT '1.0',
    "reportStorageConsentAt" DATETIME,
    "lastConsentAt" DATETIME,
    "consentStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "jwtToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SajuProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "hour" TEXT,
    "minute" TEXT,
    "calendar" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "calculationMethod" TEXT,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SajuProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Celebrity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birthYear" INTEGER NOT NULL,
    "birthMonth" INTEGER NOT NULL,
    "birthDay" INTEGER NOT NULL,
    "birthHour" INTEGER,
    "birthMinute" INTEGER,
    "calendar" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CelebrityTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "celebrityId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "CelebrityTranslation_celebrityId_fkey" FOREIGN KEY ("celebrityId") REFERENCES "Celebrity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CelebrityViewCount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "celebrityId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CelebrityViewCount_celebrityId_fkey" FOREIGN KEY ("celebrityId") REFERENCES "Celebrity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CelebrityComment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "celebrityId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CelebrityComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CelebrityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CelebrityComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CelebrityComment_celebrityId_fkey" FOREIGN KEY ("celebrityId") REFERENCES "Celebrity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CelebrityCommentLike" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "CelebrityCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CelebrityCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CelebrityComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CelebrityRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConversationHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "ConversationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT,
    "analysisId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Board" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoardCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "boardId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoardCategory_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "boardId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "authorName" TEXT,
    "authorImage" TEXT,
    "password" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "isNotice" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BoardCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "postId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "authorName" TEXT,
    "authorImage" TEXT,
    "password" TEXT,
    "parentId" INTEGER,
    "content" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostLike" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommentLike" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "commentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- CreateTable
CREATE TABLE "PostTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "postId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    CONSTRAINT "PostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SajuAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "analysisType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sajuData" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "aiResponse" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "i18n" TEXT,
    "timezone" TEXT,
    "analysisStartedAt" DATETIME,
    "analysisCompletedAt" DATETIME,
    "promptTokenCount" INTEGER,
    "candidatesTokenCount" INTEGER,
    "totalTokenCount" INTEGER,
    "modelVersion" TEXT,
    "chunkCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SajuAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_jwtToken_key" ON "Session"("jwtToken");

-- CreateIndex
CREATE UNIQUE INDEX "Celebrity_id_key" ON "Celebrity"("id");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrityTranslation_celebrityId_languageCode_key" ON "CelebrityTranslation"("celebrityId", "languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrityViewCount_celebrityId_key" ON "CelebrityViewCount"("celebrityId");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrityCommentLike_userId_commentId_key" ON "CelebrityCommentLike"("userId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_text_key" ON "Document"("text");

-- CreateIndex
CREATE INDEX "ConversationHistory_conversationId_idx" ON "ConversationHistory"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "Board_name_key" ON "Board"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PostTag_postId_tagId_key" ON "PostTag"("postId", "tagId");

-- CreateIndex
CREATE INDEX "SajuAnalysis_userId_createdAt_idx" ON "SajuAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SajuAnalysis_userId_isFavorite_idx" ON "SajuAnalysis"("userId", "isFavorite");
