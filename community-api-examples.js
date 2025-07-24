// 커뮤니티 API 사용 예시
// 로그인한 사용자와 익명 사용자의 API 사용법을 구분하여 설명

// ===== 로그인한 사용자용 API =====

// 1. 댓글 작성 (로그인 사용자)
async function createCommentAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인한 사용자의 JWT 토큰
    },
    body: JSON.stringify({
      content: '정말 좋은 글이네요!',
      isAnonymous: false,
      authorImage: 'https://example.com/user-profile.jpg' // 사용자 프로필 이미지 URL
    })
  });

  const result = await response.json();
  console.log('댓글 작성 결과:', result);
  // 응답 예시:
  // {
  //   "success": true,
  //   "data": {
  //     "id": 3,
  //     "content": "정말 좋은 글이네요!",
  //     "authorName": "사용자명",
  //     "authorImage": "https://example.com/user-profile.jpg",
  //     "isAnonymous": false,
  //     "createdAt": "2025-07-20T11:54:40.248Z"
  //   }
  // }
}

// 2. 게시글 작성 (로그인 사용자)
async function createPostAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      title: '새로운 게시글',
      content: '<p>게시글 내용입니다.</p>',
      boardId: 1,
      categoryId: 1,
      isAnonymous: false,
      tags: ['태그1', '태그2']
    })
  });

  const result = await response.json();
  console.log('게시글 작성 결과:', result);
}

// 3. 게시글 수정 (로그인 사용자)
async function updatePostAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      title: '수정된 제목',
      content: '<p>수정된 내용입니다.</p>',
      tags: ['새태그1', '새태그2']
    })
  });

  const result = await response.json();
  console.log('게시글 수정 결과:', result);
}

// 4. 게시글 삭제 (로그인 사용자)
async function deletePostAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  });

  const result = await response.json();
  console.log('게시글 삭제 결과:', result);
}

// 5. 댓글 수정 (로그인 사용자)
async function updateCommentAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/comments/3', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      content: '수정된 댓글 내용입니다.'
    })
  });

  const result = await response.json();
  console.log('댓글 수정 결과:', result);
}

// 6. 댓글 삭제 (로그인 사용자)
async function deleteCommentAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/comments/3', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  });

  const result = await response.json();
  console.log('댓글 삭제 결과:', result);
}

// ===== 익명 사용자용 API =====

// 1. 게시글 작성 (익명 사용자)
async function createPostAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: '익명 게시글',
      content: '<p>익명으로 작성한 게시글입니다.</p>',
      boardId: 1,
      categoryId: 1,
      isAnonymous: true,
      password: 'myPassword123', // 수정/삭제용 비밀번호
      tags: ['익명', '자유']
    })
  });

  const result = await response.json();
  console.log('익명 게시글 작성 결과:', result);
}

// 2. 게시글 수정 (익명 사용자)
async function updatePostAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: '수정된 익명 게시글',
      content: '<p>수정된 익명 게시글 내용입니다.</p>',
      password: 'myPassword123' // 작성 시 입력한 비밀번호
    })
  });

  const result = await response.json();
  console.log('익명 게시글 수정 결과:', result);
}

// 3. 게시글 삭제 (익명 사용자)
async function deletePostAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      password: 'myPassword123' // 작성 시 입력한 비밀번호
    })
  });

  const result = await response.json();
  console.log('익명 게시글 삭제 결과:', result);
}

// 4. 댓글 작성 (익명 사용자)
async function createCommentAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: '익명으로 작성하는 댓글입니다.',
      isAnonymous: true,
      password: 'myPassword123' // 익명 댓글 수정/삭제용 비밀번호
    })
  });

  const result = await response.json();
  console.log('익명 댓글 작성 결과:', result);
  // 응답 예시:
  // {
  //   "success": true,
  //   "data": {
  //     "id": 4,
  //     "content": "익명으로 작성하는 댓글입니다.",
  //     "authorName": "익명",
  //     "authorImage": null,
  //     "isAnonymous": true,
  //     "createdAt": "2025-07-20T11:55:00.000Z"
  //   }
  // }
}

// 5. 댓글 수정 (익명 사용자)
async function updateCommentAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/comments/4', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: '수정된 익명 댓글입니다.',
      password: 'myPassword123' // 작성 시 입력한 비밀번호
    })
  });

  const result = await response.json();
  console.log('익명 댓글 수정 결과:', result);
}

// 6. 댓글 삭제 (익명 사용자)
async function deleteCommentAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/comments/4', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      password: 'myPassword123' // 작성 시 입력한 비밀번호
    })
  });

  const result = await response.json();
  console.log('익명 댓글 삭제 결과:', result);
}

// ===== 공통 API (인증 불필요) =====

// 1. 커뮤니티 전체 데이터 조회
async function getCommunityData() {
  const response = await fetch('http://localhost:9393/api/community/user/');
  const result = await response.json();
  console.log('커뮤니티 데이터:', result);
}

// 2. 게시판 목록 조회
async function getBoards() {
  const response = await fetch('http://localhost:9393/api/community/user/boards');
  const result = await response.json();
  console.log('게시판 목록:', result);
}

// 3. 게시글 목록 조회
async function getPosts() {
  const response = await fetch('http://localhost:9393/api/community/user/posts?boardId=1&page=1&limit=20');
  const result = await response.json();
  console.log('게시글 목록:', result);
}

// 4. 게시글 상세 조회
async function getPost() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1');
  const result = await response.json();
  console.log('게시글 상세:', result);
  // 응답에 isLiked 필드가 포함됩니다 (현재 사용자가 추천했는지 여부)
}

// 5. 댓글 목록 조회
async function getComments() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1/comments?page=1&limit=20');
  const result = await response.json();
  console.log('댓글 목록:', result);
  // 각 댓글에 isLiked 필드가 포함됩니다 (현재 사용자가 추천했는지 여부)
}

// ===== 로그인 사용자 전용 API =====

// 1. 게시글 추천/취소
async function togglePostLike() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1/like', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  });

  const result = await response.json();
  console.log('게시글 추천 결과:', result);
  // 응답 예시:
  // {
  //   "success": true,
  //   "data": { "liked": true }
  // }
}

// 2. 댓글 추천/취소
async function toggleCommentLike() {
  const response = await fetch('http://localhost:9393/api/community/user/comments/3/like', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  });

  const result = await response.json();
  console.log('댓글 추천 결과:', result);
}

// ===== 대댓글 기능 =====

// 1. 대댓글 작성 (로그인 사용자)
async function createReplyAsLoggedInUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      content: '대댓글입니다!',
      parentId: 3, // 부모 댓글 ID
      isAnonymous: false,
      authorImage: 'https://example.com/user-profile.jpg'
    })
  });

  const result = await response.json();
  console.log('대댓글 작성 결과:', result);
}

// 2. 대댓글 작성 (익명 사용자)
async function createReplyAsAnonymousUser() {
  const response = await fetch('http://localhost:9393/api/community/user/posts/1/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: '익명 대댓글입니다!',
      parentId: 3, // 부모 댓글 ID
      isAnonymous: true,
      password: 'replyPassword123'
    })
  });

  const result = await response.json();
  console.log('익명 대댓글 작성 결과:', result);
}

// ===== 관리자용 API =====

// 1. 게시판 생성 (관리자)
async function createBoardAsAdmin() {
  const response = await fetch('http://localhost:9393/api/community/admin/boards', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ADMIN_JWT_TOKEN'
    },
    body: JSON.stringify({
      name: 'new-board',
      displayName: '새 게시판',
      description: '새로 만든 게시판입니다.',
      isActive: true
    })
  });

  const result = await response.json();
  console.log('게시판 생성 결과:', result);
}

// 2. 카테고리 생성 (관리자)
async function createCategoryAsAdmin() {
  const response = await fetch('http://localhost:9393/api/community/admin/boards/1/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ADMIN_JWT_TOKEN'
    },
    body: JSON.stringify({
      name: '새 카테고리',
      sortOrder: 1,
      isActive: true
    })
  });

  const result = await response.json();
  console.log('카테고리 생성 결과:', result);
}

// ===== 이미지 업로드 및 게시글 작성 예제 =====

// 1. 이미지 업로드 URL 받기
async function getImageUploadUrl() {
  const response = await fetch('http://localhost:9393/api/user/r2/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      fileName: 'example.jpg',
      contentType: 'image/jpeg'
    })
  });

  const result = await response.json();
  console.log('업로드 URL 받기 결과:', result);
  // 응답 예시:
  // {
  //   "success": true,
  //   "uploadUrl": "https://...",
  //   "fileUrl": "https://your-r2-domain.com/uploads/user-123/..."
  // }
}

// 2. 이미지를 R2에 업로드
async function uploadImageToR2(uploadUrl, file) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type
    },
    body: file
  });

  if (response.ok) {
    console.log('이미지 업로드 성공');
    return true;
  } else {
    console.error('이미지 업로드 실패');
    return false;
  }
}

// 3. 이미지 URL을 포함한 게시글 작성
async function createPostWithImageUrl(imageUrl) {
  const response = await fetch('http://localhost:9393/api/community/user/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      title: '이미지가 포함된 게시글',
      content: `
        <p>이미지가 포함된 게시글입니다.</p>
        <p><img src="${imageUrl}" alt="업로드된 이미지"></p>
        <p>이미지는 별도로 R2에 업로드된 후 URL로 첨부됩니다.</p>
      `,
      boardId: 1,
      categoryId: 1,
      isAnonymous: false,
      tags: ['이미지', '테스트']
    })
  });

  const result = await response.json();
  console.log('이미지 포함 게시글 작성 결과:', result);
}

// 4. 게시글 수정 (기존 이미지 삭제)
async function updatePostWithNewImage(postId, newImageUrl) {
  const response = await fetch(`http://localhost:9393/api/community/user/posts/${postId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      title: '수정된 이미지 게시글',
      content: `
        <p>새로운 이미지로 수정된 게시글입니다.</p>
        <p><img src="${newImageUrl}" alt="새 이미지"></p>
        <p>기존 이미지는 자동으로 R2에서 삭제됩니다.</p>
      `,
      categoryId: 1
    })
  });

  const result = await response.json();
  console.log('게시글 수정 결과:', result);
}

// 5. 게시글 삭제 (포함된 모든 이미지 자동 삭제)
async function deletePostWithImages(postId) {
  const response = await fetch(`http://localhost:9393/api/community/user/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({})
  });

  const result = await response.json();
  console.log('게시글 삭제 결과:', result);
  // 게시글 삭제 시 포함된 모든 이미지가 R2에서 자동으로 삭제됩니다
}

// 6. 전체 이미지 업로드 및 게시글 작성 프로세스
async function completeImageUploadAndPost(file) {
  try {
    // 1. 업로드 URL 받기
    const uploadUrlResponse = await getImageUploadUrl();
    const { uploadUrl, fileUrl } = uploadUrlResponse.data;

    // 2. 이미지 업로드
    const uploadSuccess = await uploadImageToR2(uploadUrl, file);
    if (!uploadSuccess) {
      throw new Error('이미지 업로드 실패');
    }

    // 3. 게시글 작성
    await createPostWithImageUrl(fileUrl);
    
    console.log('이미지 업로드 및 게시글 작성 완료!');
  } catch (error) {
    console.error('프로세스 실패:', error);
  }
}

// ===== 사용 예시 =====

// 실제 사용 예시
async function exampleUsage() {
  console.log('=== 커뮤니티 데이터 조회 ===');
  await getCommunityData();
  
  console.log('\n=== 로그인 사용자 게시글 작성 ===');
  await createPostAsLoggedInUser();
  
  console.log('\n=== 익명 사용자 게시글 작성 ===');
  await createPostAsAnonymousUser();
  
  console.log('\n=== 게시글 목록 조회 ===');
  await getPosts();
  
  console.log('\n=== 로그인 사용자 댓글 작성 ===');
  await createCommentAsLoggedInUser();
  
  console.log('\n=== 익명 사용자 댓글 작성 ===');
  await createCommentAsAnonymousUser();
  
  console.log('\n=== 댓글 목록 조회 ===');
  await getComments();
  
  console.log('\n=== 대댓글 작성 ===');
  await createReplyAsLoggedInUser();
  
  console.log('\n=== 게시글 추천 ===');
  await togglePostLike();
  
  console.log('\n=== 댓글 추천 ===');
  await toggleCommentLike();
}

// 실행
// exampleUsage(); 