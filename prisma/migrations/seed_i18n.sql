-- Boards: bug-report / saju-discussion / feature-request
-- npx wrangler d1 execute destiny-local --local --file=prisma/migrations/patch_i18n.sql
-- npx wrangler d1 execute destiny-local --local --file=prisma/migrations/seed_i18n.sql
-- ko
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('bug-report', '버그 제보', '서비스 버그 제보 공간', 0, 1, 'ko', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('saju-discussion', '사주 이야기', '사주/운세 토론 공간', 1, 1, 'ko', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('feature-request', '기능/개선 요청', '새 기능/개선 요청 공간', 2, 1, 'ko', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');

-- en
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('bug-report', 'Bug Report', 'Report bugs in the service', 0, 1, 'en', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('saju-discussion', 'Saju Discussion', 'Discuss saju and fortunes', 1, 1, 'en', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('feature-request', 'Feature Request', 'Request new or improved features', 2, 1, 'en', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');

-- ja
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('bug-report', 'バグ報告', 'サービスのバグを報告する場所', 0, 1, 'ja', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('saju-discussion', '四柱の話', '四柱・運勢のディスカッション', 1, 1, 'ja', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('feature-request', '機能要望', '新機能・改善の要望', 2, 1, 'ja', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');

-- zh
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('bug-report', '错误报告', '服务错误报告区', 0, 1, 'zh', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('saju-discussion', '四柱讨论', '讨论四柱与运势', 1, 1, 'zh', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('feature-request', '功能请求', '请求新功能或改进', 2, 1, 'zh', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');

-- vi
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('bug-report', 'Báo lỗi', 'Nơi báo lỗi dịch vụ', 0, 1, 'vi', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('saju-discussion', 'Thảo luận Tứ trụ', 'Thảo luận tứ trụ và vận mệnh', 1, 1, 'vi', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');
INSERT INTO Board (name, displayName, description, sortOrder, isActive, language, createdAt, updatedAt)
VALUES ('feature-request', 'Yêu cầu tính năng', 'Yêu cầu tính năng mới/cải tiến', 2, 1, 'vi', datetime('now','utc'), datetime('now','utc'))
ON CONFLICT(name, language) DO UPDATE SET displayName=excluded.displayName, description=excluded.description, sortOrder=excluded.sortOrder, isActive=excluded.isActive, updatedAt=datetime('now','utc');

-- Categories: bug-report
-- ko
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'ko', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '버그' AS name, 0 AS sortOrder UNION ALL
      SELECT 'UI/UX 문제', 1 UNION ALL
      SELECT '성능 문제', 2 UNION ALL
      SELECT '기타', 3) v
ON b.name='bug-report' AND b.language='ko'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='ko');

-- en
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'en', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'Bug', 0 UNION ALL SELECT 'UI/UX', 1 UNION ALL SELECT 'Performance', 2 UNION ALL SELECT 'Others', 3) v(name, sortOrder)
ON b.name='bug-report' AND b.language='en'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='en');

-- ja
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'ja', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'バグ', 0 UNION ALL SELECT 'UI/UX', 1 UNION ALL SELECT 'パフォーマンス', 2 UNION ALL SELECT 'その他', 3) v(name, sortOrder)
ON b.name='bug-report' AND b.language='ja'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='ja');

-- zh
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'zh', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '错误', 0 UNION ALL SELECT 'UI/UX', 1 UNION ALL SELECT '性能', 2 UNION ALL SELECT '其他', 3) v(name, sortOrder)
ON b.name='bug-report' AND b.language='zh'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='zh');

-- vi
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'vi', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'Lỗi', 0 UNION ALL SELECT 'UI/UX', 1 UNION ALL SELECT 'Hiệu năng', 2 UNION ALL SELECT 'Khác', 3) v(name, sortOrder)
ON b.name='bug-report' AND b.language='vi'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='vi');

-- Categories: saju-discussion
-- ko
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'ko', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '사주 해석',0 UNION ALL SELECT '운세 이야기',1 UNION ALL SELECT '사주 궁금증',2 UNION ALL SELECT '사주 팁',3 UNION ALL SELECT '일상 이야기',4 UNION ALL SELECT '기타',5) v(name, sortOrder)
ON b.name='saju-discussion' AND b.language='ko'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='ko');

-- en
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'en', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'Saju Interpretation',0 UNION ALL SELECT 'Fortune Talk',1 UNION ALL SELECT 'Saju Q&A',2 UNION ALL SELECT 'Saju Tips',3 UNION ALL SELECT 'Daily Life',4 UNION ALL SELECT 'Others',5) v(name, sortOrder)
ON b.name='saju-discussion' AND b.language='en'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='en');

-- ja
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'ja', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '四柱解釈',0 UNION ALL SELECT '運勢の話',1 UNION ALL SELECT '四柱Q&A',2 UNION ALL SELECT '四柱のコツ',3 UNION ALL SELECT '日常',4 UNION ALL SELECT 'その他',5) v(name, sortOrder)
ON b.name='saju-discussion' AND b.language='ja'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='ja');

-- zh
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'zh', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '四柱解读',0 UNION ALL SELECT '运势讨论',1 UNION ALL SELECT '四柱问答',2 UNION ALL SELECT '四柱技巧',3 UNION ALL SELECT '日常',4 UNION ALL SELECT '其他',5) v(name, sortOrder)
ON b.name='saju-discussion' AND b.language='zh'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='zh');

-- vi
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'vi', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'Giải thích Tứ trụ',0 UNION ALL SELECT 'Chuyện vận mệnh',1 UNION ALL SELECT 'Hỏi đáp Tứ trụ',2 UNION ALL SELECT 'Mẹo Tứ trụ',3 UNION ALL SELECT 'Đời sống',4 UNION ALL SELECT 'Khác',5) v(name, sortOrder)
ON b.name='saju-discussion' AND b.language='vi'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='vi');

-- Categories: feature-request
-- ko
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'ko', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '새로운 기능',0 UNION ALL SELECT '기존 기능 개선',1 UNION ALL SELECT '사주 해석 기능',2 UNION ALL SELECT 'UI/UX 개선',3 UNION ALL SELECT '모바일 앱',4 UNION ALL SELECT '기타',5) v(name, sortOrder)
ON b.name='feature-request' AND b.language='ko'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='ko');

-- en
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'en', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'New Feature',0 UNION ALL SELECT 'Enhancement',1 UNION ALL SELECT 'Saju Feature',2 UNION ALL SELECT 'UI/UX',3 UNION ALL SELECT 'Mobile App',4 UNION ALL SELECT 'Others',5) v(name, sortOrder)
ON b.name='feature-request' AND b.language='en'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='en');

-- ja
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'ja', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '新機能',0 UNION ALL SELECT '改善',1 UNION ALL SELECT '四柱機能',2 UNION ALL SELECT 'UI/UX',3 UNION ALL SELECT 'モバイルアプリ',4 UNION ALL SELECT 'その他',5) v(name, sortOrder)
ON b.name='feature-request' AND b.language='ja'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='ja');

-- zh
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'zh', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT '新功能',0 UNION ALL SELECT '改进',1 UNION ALL SELECT '四柱功能',2 UNION ALL SELECT 'UI/UX',3 UNION ALL SELECT '移动应用',4 UNION ALL SELECT '其他',5) v(name, sortOrder)
ON b.name='feature-request' AND b.language='zh'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='zh');

-- vi
INSERT INTO BoardCategory (boardId, name, sortOrder, isActive, language, createdAt, updatedAt)
SELECT b.id, v.name, v.sortOrder, 1, 'vi', datetime('now','utc'), datetime('now','utc')
FROM Board b
JOIN (SELECT 'Tính năng mới',0 UNION ALL SELECT 'Cải tiến',1 UNION ALL SELECT 'Tính năng Tứ trụ',2 UNION ALL SELECT 'UI/UX',3 UNION ALL SELECT 'Ứng dụng di động',4 UNION ALL SELECT 'Khác',5) v(name, sortOrder)
ON b.name='feature-request' AND b.language='vi'
WHERE NOT EXISTS (SELECT 1 FROM BoardCategory bc WHERE bc.boardId=b.id AND bc.name=v.name AND bc.language='vi');

-- Tags (unique on (name, language))
-- ko
INSERT INTO Tag (name, language, createdAt) VALUES ('버그','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UI','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UX','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('성능','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('모바일','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('웹','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('API','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('보안','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('접근성','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('호환성','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('사주','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('운세','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('사주해석','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('사주팁','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('사주궁금증','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('일상','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('기능요청','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('개선요청','ko',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;

-- en
INSERT INTO Tag (name, language, createdAt) VALUES ('Bug','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UI','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UX','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Performance','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Mobile','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Web','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('API','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Security','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Accessibility','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Compatibility','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Saju','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Fortune','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Saju Interpretation','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Saju Tips','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Saju Q&A','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Daily','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Feature Request','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Enhancement','en',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;

-- ja
INSERT INTO Tag (name, language, createdAt) VALUES ('バグ','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UI','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UX','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('パフォーマンス','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('モバイル','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Web','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('API','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('セキュリティ','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('アクセシビリティ','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('互換性','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('運勢','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱解釈','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱のコツ','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱Q&A','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('日常','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('機能要望','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('改善要望','ja',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;

-- zh
INSERT INTO Tag (name, language, createdAt) VALUES ('错误','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UI','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UX','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('性能','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('移动','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Web','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('API','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('安全','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('无障碍','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('兼容性','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('运势','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱解读','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱技巧','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('四柱问答','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('日常','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('功能请求','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('改进请求','zh',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;

-- vi
INSERT INTO Tag (name, language, createdAt) VALUES ('Lỗi','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UI','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('UX','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Hiệu năng','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Di động','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Web','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('API','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Bảo mật','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Tiếp cận','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Tương thích','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Tứ trụ','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Vận mệnh','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Giải thích Tứ trụ','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Mẹo Tứ trụ','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Hỏi đáp Tứ trụ','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Hằng ngày','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Yêu cầu tính năng','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;
INSERT INTO Tag (name, language, createdAt) VALUES ('Yêu cầu cải tiến','vi',datetime('now','utc')) ON CONFLICT(name,language) DO UPDATE SET name=excluded.name;