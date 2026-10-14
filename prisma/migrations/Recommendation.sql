CREATE TABLE IF NOT EXISTS "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "badge" TEXT,
    "bannerImage" TEXT NOT NULL,
    "point" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "questionsJson" TEXT NOT NULL,
    "galleryImagesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now', 'utc'))
);
