// ===== 커뮤니티 API 사용 예시 =====
// Base URL: https://your-domain.com/api/community/user

// ===== 1. 커뮤니티 메인 데이터 조회 =====
async function getCommunityData() {
  const response = await fetch('/api/community/user/', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  console.log('커뮤니티 메인 데이터:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     boards: [게시판 목록],
  //     recentPosts: [최근 게시글],
  //     popularPosts: [인기 게시글]
  //   }
  // }
}

// ===== 2. 게시판 목록 조회 =====
async function getBoards() {
  const response = await fetch('/api/community/user/boards', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  console.log('게시판 목록:', data);
  // Response: {
  //   success: true,
  //   data: [
  //     {
  //       id: 1,
  //       name: "bug-report",
  //       displayName: "버그 제보",
  //       description: "버그를 제보하는 공간입니다.",
  //       isActive: true
  //     }
  //   ]
  // }
}

// ===== 3. 특정 게시판 데이터 조회 =====
async function getBoardData(boardId, options = {}) {
  const { page = 1, limit = 10, categoryId, sort = 'newest', search, tags } = options;
  
  // URL 파라미터 구성
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort: sort
  });
  
  if (categoryId) params.append('categoryId', categoryId);
  if (search) params.append('search', search);
  if (tags) params.append('tags', tags.join(','));
  
  const response = await fetch(`/api/community/user/boards/${boardId}?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  console.log('게시판 데이터:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     board: { 게시판 정보 },
  //     categories: [카테고리 목록],
  //     posts: [게시글 목록],
  //     pagination: { 페이징 정보 }
  //   }
  // }
}

// ===== 4. 게시글 목록 조회 =====
async function getPosts(options = {}) {
  const { page = 1, limit = 20, boardId, categoryId, search, tags, sort = 'newest' } = options;
  
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort: sort
  });
  
  if (boardId) params.append('boardId', boardId);
  if (categoryId) params.append('categoryId', categoryId);
  if (search) params.append('search', search);
  if (tags) params.append('tags', tags.join(','));
  
  const response = await fetch(`/api/community/user/posts?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  console.log('게시글 목록:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     posts: [게시글 목록],
  //     pagination: { 페이징 정보 }
  //   }
  // }
}

// ===== 5. 게시글 상세 조회 =====
async function getPost(postId) {
  const response = await fetch(`/api/community/user/posts/${postId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  console.log('게시글 상세:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     title: "게시글 제목",
  //     content: "게시글 내용",
  //     authorName: "작성자명",
  //     isAnonymous: false,
  //     tags: ["태그1", "태그2"],
  //     viewCount: 10,
  //     likeCount: 5,
  //     commentCount: 3,
  //     board: { 게시판 정보 },
  //     category: { 카테고리 정보 }
  //   }
  // }
}

// ===== 6. 게시글 작성 =====

// 로그인 사용자용 게시글 작성
async function createPostAsLoggedInUser(postData) {
  const { title, content, boardId, categoryId, tags = [] } = postData;
  
  const response = await fetch('/api/community/user/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    },
    body: JSON.stringify({
      title,           // 게시글 제목 (필수)
      content,         // 게시글 내용 (필수)
      boardId,         // 게시판 ID (필수)
      categoryId,      // 카테고리 ID (선택)
      isAnonymous: false, // 익명 여부 (false)
      tags            // 태그 배열 (선택)
    })
  });
  
  const data = await response.json();
  console.log('게시글 작성 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     title: "게시글 제목",
  //     content: "게시글 내용",
  //     authorName: "유람하는 방랑자",
  //     isAnonymous: false,
  //     tags: ["태그1", "태그2"],
  //     createdAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// 익명 사용자용 게시글 작성
async function createPostAsAnonymous(postData) {
  const { title, content, boardId, categoryId, password, tags = [] } = postData;
  
  const response = await fetch('/api/community/user/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,           // 게시글 제목 (필수)
      content,         // 게시글 내용 (필수)
      boardId,         // 게시판 ID (필수)
      categoryId,      // 카테고리 ID (선택)
      isAnonymous: true,  // 익명 여부 (true)
      password,        // 비밀번호 (익명일 때 필수)
      tags            // 태그 배열 (선택)
    })
  });
  
  const data = await response.json();
  console.log('익명 게시글 작성 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     title: "게시글 제목",
  //     content: "게시글 내용",
  //     authorName: "익명",
  //     isAnonymous: true,
  //     tags: ["태그1", "태그2"],
  //     createdAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// ===== 7. 게시글 수정 =====

// 로그인 사용자용 게시글 수정
async function updatePostAsLoggedInUser(postId, updateData) {
  const { title, content, categoryId, tags } = updateData;
  
  const response = await fetch(`/api/community/user/posts/${postId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    },
    body: JSON.stringify({
      title,           // 게시글 제목 (선택)
      content,         // 게시글 내용 (선택)
      categoryId,      // 카테고리 ID (선택)
      tags            // 태그 배열 (선택)
    })
  });
  
  const data = await response.json();
  console.log('게시글 수정 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     title: "수정된 제목",
  //     content: "수정된 내용",
  //     tags: ["새태그1", "새태그2"],
  //     updatedAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// 익명 사용자용 게시글 수정
async function updatePostAsAnonymous(postId, updateData) {
  const { title, content, categoryId, password, tags } = updateData;
  
  const response = await fetch(`/api/community/user/posts/${postId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,           // 게시글 제목 (선택)
      content,         // 게시글 내용 (선택)
      categoryId,      // 카테고리 ID (선택)
      password,        // 비밀번호 (익명일 때 필수)
      tags            // 태그 배열 (선택)
    })
  });
  
  const data = await response.json();
  console.log('익명 게시글 수정 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     title: "수정된 제목",
  //     content: "수정된 내용",
  //     tags: ["새태그1", "새태그2"],
  //     updatedAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// ===== 8. 게시글 삭제 =====

// 로그인 사용자용 게시글 삭제
async function deletePostAsLoggedInUser(postId) {
  const response = await fetch(`/api/community/user/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    }
  });
  
  const data = await response.json();
  console.log('게시글 삭제 결과:', data);
  // Response: {
  //   success: true,
  //   message: "게시글이 삭제되었습니다."
  // }
}

// 익명 사용자용 게시글 삭제
async function deletePostAsAnonymous(postId, password) {
  const response = await fetch(`/api/community/user/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password  // 비밀번호 (익명일 때 필수)
    })
  });
  
  const data = await response.json();
  console.log('익명 게시글 삭제 결과:', data);
  // Response: {
  //   success: true,
  //   message: "게시글이 삭제되었습니다."
  // }
}

// ===== 9. 게시글 추천/취소 =====
async function togglePostLike(postId) {
  const response = await fetch(`/api/community/user/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    }
  });
  
  const data = await response.json();
  console.log('게시글 추천 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     liked: true  // true: 추천됨, false: 추천 취소됨
  //   }
  // }
}

// ===== 10. 댓글 목록 조회 =====
async function getComments(postId, options = {}) {
  const { page = 1, limit = 50 } = options;
  
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`/api/community/user/posts/${postId}/comments?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  console.log('댓글 목록:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     comments: [
  //       {
  //         id: 1,
  //         content: "댓글 내용",
  //         authorName: "댓글 작성자",
  //         isAnonymous: false,
  //         likeCount: 2,
  //         createdAt: "2023-01-01T00:00:00.000Z",
  //         parentId: null  // 대댓글인 경우 부모 댓글 ID
  //       }
  //     ],
  //     pagination: { 페이징 정보 }
  //   }
  // }
}

// ===== 11. 댓글 작성 =====

// 로그인 사용자용 댓글 작성
async function createCommentAsLoggedInUser(postId, commentData) {
  const { content, parentId } = commentData;
  
  const response = await fetch(`/api/community/user/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    },
    body: JSON.stringify({
      content,         // 댓글 내용 (필수)
      parentId,        // 부모 댓글 ID (대댓글용, 선택)
      isAnonymous: false  // 익명 여부 (false)
    })
  });
  
  const data = await response.json();
  console.log('댓글 작성 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     content: "댓글 내용",
  //     authorName: "유람하는 방랑자",
  //     isAnonymous: false,
  //     createdAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// 익명 사용자용 댓글 작성
async function createCommentAsAnonymous(postId, commentData) {
  const { content, parentId, password } = commentData;
  
  const response = await fetch(`/api/community/user/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,         // 댓글 내용 (필수)
      parentId,        // 부모 댓글 ID (대댓글용, 선택)
      isAnonymous: true,   // 익명 여부 (true)
      password         // 비밀번호 (익명일 때 필수)
    })
  });
  
  const data = await response.json();
  console.log('익명 댓글 작성 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     content: "댓글 내용",
  //     authorName: "익명",
  //     isAnonymous: true,
  //     createdAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// ===== 12. 댓글 수정 =====

// 로그인 사용자용 댓글 수정
async function updateCommentAsLoggedInUser(commentId, content) {
  const response = await fetch(`/api/community/user/comments/${commentId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    },
    body: JSON.stringify({
      content  // 댓글 내용 (필수)
    })
  });
  
  const data = await response.json();
  console.log('댓글 수정 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     content: "수정된 댓글 내용",
  //     updatedAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// 익명 사용자용 댓글 수정
async function updateCommentAsAnonymous(commentId, content, password) {
  const response = await fetch(`/api/community/user/comments/${commentId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,   // 댓글 내용 (필수)
      password   // 비밀번호 (익명일 때 필수)
    })
  });
  
  const data = await response.json();
  console.log('익명 댓글 수정 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     id: 1,
  //     content: "수정된 댓글 내용",
  //     updatedAt: "2023-01-01T00:00:00.000Z"
  //   }
  // }
}

// ===== 13. 댓글 삭제 =====

// 로그인 사용자용 댓글 삭제
async function deleteCommentAsLoggedInUser(commentId) {
  const response = await fetch(`/api/community/user/comments/${commentId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    }
  });
  
  const data = await response.json();
  console.log('댓글 삭제 결과:', data);
  // Response: {
  //   success: true,
  //   message: "댓글이 삭제되었습니다."
  // }
}

// 익명 사용자용 댓글 삭제
async function deleteCommentAsAnonymous(commentId, password) {
  const response = await fetch(`/api/community/user/comments/${commentId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password  // 비밀번호 (익명일 때 필수)
    })
  });
  
  const data = await response.json();
  console.log('익명 댓글 삭제 결과:', data);
  // Response: {
  //   success: true,
  //   message: "댓글이 삭제되었습니다."
  // }
}

// ===== 14. 댓글 추천/취소 =====
async function toggleCommentLike(commentId) {
  const response = await fetch(`/api/community/user/comments/${commentId}/like`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN' // 로그인 토큰 필요
    }
  });
  
  const data = await response.json();
  console.log('댓글 추천 결과:', data);
  // Response: {
  //   success: true,
  //   data: {
  //     liked: true  // true: 추천됨, false: 추천 취소됨
  //   }
  // }
}

// ===== 사용 예시 =====

// 1. 커뮤니티 메인 페이지 로드
async function loadCommunityMain() {
  await getCommunityData();
  await getBoards();
}

// 2. 게시판 페이지 로드
async function loadBoardPage(boardId) {
  await getBoardData(boardId, {
    page: 1,
    limit: 10,
    sort: 'newest'
  });
}

// 3. 게시글 검색
async function searchPosts() {
  await getPosts({
    boardId: 1,
    search: '버그',
    tags: ['중요', '긴급'],
    sort: 'popular'
  });
}

// 4. 로그인 사용자가 게시글 작성
async function writePostAsUser() {
  await createPostAsLoggedInUser({
    title: '버그 제보합니다',
    content: '로그인 버튼이 작동하지 않습니다.',
    boardId: 1,
    categoryId: 2,
    tags: ['버그', '로그인', '긴급']
  });
}

// 5. 익명 사용자가 게시글 작성
async function writePostAsAnonymous() {
  await createPostAsAnonymous({
    title: '익명으로 제보합니다',
    content: '익명으로 버그를 제보합니다.',
    boardId: 1,
    categoryId: 2,
    password: '1234',
    tags: ['버그', '익명']
  });
}

// 6. 로그인 사용자가 댓글 작성
async function writeCommentAsUser() {
  await createCommentAsLoggedInUser(1, {
    content: '좋은 정보 감사합니다!',
    parentId: null  // 최상위 댓글
  });
}

// 7. 익명 사용자가 대댓글 작성
async function writeReplyAsAnonymous() {
  await createCommentAsAnonymous(1, {
    content: '익명으로 답글 달아요',
    parentId: 5,  // 부모 댓글 ID
    password: '1234'
  });
}

// ===== 에러 처리 예시 =====
async function handleApiError(apiCall) {
  try {
    const result = await apiCall();
    return result;
  } catch (error) {
    console.error('API 호출 오류:', error);
    
    if (error.response) {
      const errorData = await error.response.json();
      console.error('에러 메시지:', errorData.message);
      
      switch (error.response.status) {
        case 400:
          alert('잘못된 요청입니다.');
          break;
        case 401:
          alert('로그인이 필요합니다.');
          break;
        case 403:
          alert('권한이 없습니다.');
          break;
        case 404:
          alert('찾을 수 없습니다.');
          break;
        case 409:
          alert('중복된 데이터입니다.');
          break;
        default:
          alert('서버 오류가 발생했습니다.');
      }
    }
  }
}

// ===== 실제 사용 예시 =====
document.addEventListener('DOMContentLoaded', async () => {
  // 페이지 로드 시 커뮤니티 메인 데이터 가져오기
  await handleApiError(loadCommunityMain);
  
  // 게시글 작성 버튼 클릭 이벤트
  document.getElementById('writePostBtn')?.addEventListener('click', async () => {
    const isLoggedIn = checkUserLoginStatus(); // 사용자 로그인 상태 확인
    
    if (isLoggedIn) {
      await handleApiError(writePostAsUser);
    } else {
      // 익명 작성 모달 표시
      showAnonymousWriteModal();
    }
  });
  
  // 댓글 작성 버튼 클릭 이벤트
  document.getElementById('writeCommentBtn')?.addEventListener('click', async () => {
    const isLoggedIn = checkUserLoginStatus();
    
    if (isLoggedIn) {
      await handleApiError(() => writeCommentAsUser());
    } else {
      showAnonymousCommentModal();
    }
  });
});

// 사용자 로그인 상태 확인 함수 (실제 구현 필요)
function checkUserLoginStatus() {
  return localStorage.getItem('jwt_token') !== null;
}

// 익명 작성 모달 표시 함수 (실제 구현 필요)
function showAnonymousWriteModal() {
  // 모달 UI 구현
  console.log('익명 작성 모달 표시');
}

// 익명 댓글 모달 표시 함수 (실제 구현 필요)
function showAnonymousCommentModal() {
  // 모달 UI 구현
  console.log('익명 댓글 모달 표시');
} 