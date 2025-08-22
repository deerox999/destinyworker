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
    "subscriptionUntil" DATETIME,
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
CREATE TABLE "ApiLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "userJson" TEXT,
    "paramsJson" TEXT,
    "responseJson" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc'))
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
    "groupName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
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
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- CreateTable
CREATE TABLE "CelebrityTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "celebrityId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "aiResponse" TEXT,
    CONSTRAINT "CelebrityTranslation_celebrityId_fkey" FOREIGN KEY ("celebrityId") REFERENCES "Celebrity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc'))
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
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "provider" TEXT NOT NULL DEFAULT 'nicepay',
    "status" TEXT NOT NULL,
    "tid" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Board" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'ko',
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
    "language" TEXT NOT NULL DEFAULT 'ko',
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
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "isNotice" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'ko',
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
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
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
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
    "language" TEXT NOT NULL DEFAULT 'ko',
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
    "chartJson" TEXT,
    "modelUsed" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "i18n" TEXT,
    "timezone" TEXT,
    "analysisStartedAt" DATETIME,
    "analysisCompletedAt" DATETIME,
    "usageMetadata" TEXT,
    "optionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SajuAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_statusCode_createdAt_idx" ON "ApiLog"("statusCode", "createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_url_createdAt_idx" ON "ApiLog"("url", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Celebrity_id_key" ON "Celebrity"("id");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrityTranslation_celebrityId_languageCode_key" ON "CelebrityTranslation"("celebrityId", "languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "Document_text_key" ON "Document"("text");

-- CreateIndex
CREATE INDEX "ConversationHistory_conversationId_idx" ON "ConversationHistory"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationHistory_userId_conversationId_createdAt_idx" ON "ConversationHistory"("userId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransaction_userId_createdAt_idx" ON "PointTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_userId_reference_key" ON "PointTransaction"("userId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tid_key" ON "Payment"("tid");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Board_language_idx" ON "Board"("language");

-- CreateIndex
CREATE UNIQUE INDEX "Board_name_language_key" ON "Board"("name", "language");

-- CreateIndex
CREATE INDEX "BoardCategory_language_idx" ON "BoardCategory"("language");

-- CreateIndex
CREATE UNIQUE INDEX "BoardCategory_boardId_name_key" ON "BoardCategory"("boardId", "name");

-- CreateIndex
CREATE INDEX "Post_language_idx" ON "Post"("language");

-- CreateIndex
CREATE INDEX "Post_language_createdAt_idx" ON "Post"("language", "createdAt");

-- CreateIndex
CREATE INDEX "Post_boardId_createdAt_idx" ON "Post"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_categoryId_createdAt_idx" ON "Post"("categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_postId_parentId_createdAt_idx" ON "Comment"("postId", "parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "Tag_language_idx" ON "Tag"("language");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_language_key" ON "Tag"("name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "PostTag_postId_tagId_key" ON "PostTag"("postId", "tagId");

-- CreateIndex
CREATE INDEX "SajuAnalysis_userId_createdAt_idx" ON "SajuAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SajuAnalysis_userId_isFavorite_idx" ON "SajuAnalysis"("userId", "isFavorite");

