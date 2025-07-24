// ===== 어드민 커뮤니티 API 사용 예시 =====
// Base URL: https://your-domain.com/api/community/admin
// 주의: 모든 API는 관리자 권한이 필요합니다 (JWT 토큰에 admin 역할 포함)

// ===== 1. 게시판 관리 =====

// 1-1. 게시판 목록 조회 (전체 - 활성/비활성 포함)
async function getBoards() {
    const response = await fetch('/api/community/admin/boards', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN' // 관리자 토큰 필요
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
    //       sortOrder: 0,
    //       isActive: true,
    //       createdAt: "2023-01-01T00:00:00.000Z",
    //       updatedAt: "2023-01-01T00:00:00.000Z"
    //     }
    //   ]
    // }
}

// 1-2. 게시판 생성
async function createBoard(boardData) {
    const { name, displayName, description, sortOrder = 0, isActive = true } = boardData;

    const response = await fetch('/api/community/admin/boards', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        },
        body: JSON.stringify({
            name,           // 게시판 식별자 (필수, 고유값)
            displayName,    // 표시 이름 (필수)
            description,    // 설명 (선택)
            sortOrder,      // 정렬 순서 (기본값: 0)
            isActive        // 활성화 여부 (기본값: true)
        })
    });

    const data = await response.json();
    console.log('게시판 생성 결과:', data);
    // Response: {
    //   success: true,
    //   data: {
    //     id: 1,
    //     name: "bug-report",
    //     displayName: "버그 제보",
    //     description: "버그를 제보하는 공간입니다.",
    //     sortOrder: 0,
    //     isActive: true,
    //     createdAt: "2023-01-01T00:00:00.000Z"
    //   }
    // }
}

// 1-3. 게시판 수정
async function updateBoard(boardId, updateData) {
    const { displayName, description, sortOrder, isActive } = updateData;

    const response = await fetch(`/api/community/admin/boards/${boardId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        },
        body: JSON.stringify({
            displayName,    // 표시 이름 (선택)
            description,    // 설명 (선택)
            sortOrder,      // 정렬 순서 (선택)
            isActive        // 활성화 여부 (선택)
        })
    });

    const data = await response.json();
    console.log('게시판 수정 결과:', data);
    // Response: {
    //   success: true,
    //   data: {
    //     id: 1,
    //     name: "bug-report",
    //     displayName: "수정된 버그 제보",
    //     description: "수정된 설명",
    //     sortOrder: 1,
    //     isActive: true,
    //     updatedAt: "2023-01-01T00:00:00.000Z"
    //   }
    // }
}

// 1-4. 게시판 삭제 (비활성화)
async function deleteBoard(boardId) {
    const response = await fetch(`/api/community/admin/boards/${boardId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        }
    });

    const data = await response.json();
    console.log('게시판 삭제 결과:', data);
    // Response: {
    //   success: true,
    //   message: "게시판이 삭제되었습니다."
    // }
}

// ===== 2. 카테고리 관리 =====

// 2-1. 게시판별 카테고리 목록 조회
async function getBoardCategories(boardId) {
    const response = await fetch(`/api/community/admin/boards/${boardId}/categories`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        }
    });

    const data = await response.json();
    console.log('카테고리 목록:', data);
    // Response: {
    //   success: true,
    //   data: [
    //     {
    //       id: 1,
    //       name: "치명적 버그",
    //       sortOrder: 0,
    //       isActive: true,
    //       createdAt: "2023-01-01T00:00:00.000Z",
    //       updatedAt: "2023-01-01T00:00:00.000Z"
    //     }
    //   ]
    // }
}

// 2-2. 카테고리 생성
async function createCategory(boardId, categoryData) {
    const { name, sortOrder = 0, isActive = true } = categoryData;

    const response = await fetch(`/api/community/admin/boards/${boardId}/categories`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        },
        body: JSON.stringify({
            name,           // 카테고리 이름 (필수)
            sortOrder,      // 정렬 순서 (기본값: 0)
            isActive        // 활성화 여부 (기본값: true)
        })
    });

    const data = await response.json();
    console.log('카테고리 생성 결과:', data);
    // Response: {
    //   success: true,
    //   data: {
    //     id: 1,
    //     boardId: 1,
    //     name: "치명적 버그",
    //     sortOrder: 0,
    //     isActive: true,
    //     createdAt: "2023-01-01T00:00:00.000Z"
    //   }
    // }
}

// 2-3. 카테고리 수정
async function updateCategory(categoryId, updateData) {
    const { name, sortOrder, isActive } = updateData;

    const response = await fetch(`/api/community/admin/categories/${categoryId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        },
        body: JSON.stringify({
            name,           // 카테고리 이름 (선택)
            sortOrder,      // 정렬 순서 (선택)
            isActive        // 활성화 여부 (선택)
        })
    });

    const data = await response.json();
    console.log('카테고리 수정 결과:', data);
    // Response: {
    //   success: true,
    //   data: {
    //     id: 1,
    //     name: "수정된 카테고리명",
    //     sortOrder: 1,
    //     isActive: true,
    //     updatedAt: "2023-01-01T00:00:00.000Z"
    //   }
    // }
}

// 2-4. 카테고리 삭제 (비활성화)
async function deleteCategory(categoryId) {
    const response = await fetch(`/api/community/admin/categories/${categoryId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        }
    });

    const data = await response.json();
    console.log('카테고리 삭제 결과:', data);
    // Response: {
    //   success: true,
    //   message: "카테고리가 삭제되었습니다."
    // }
}

// ===== 3. 샘플 데이터 관리 =====

// 3-1. 샘플 데이터 생성
async function createSampleData() {
    const response = await fetch('/api/community/admin/sample-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        }
    });

    const data = await response.json();
    console.log('샘플 데이터 생성 결과:', data);
    // Response: {
    //   success: true,
    //   data: {
    //     message: "샘플 데이터가 생성되었습니다.",
    //     boards: 4,
    //     categories: 12,
    //     details: {
    //       boards: [
    //         {
    //           id: 1,
    //           name: "free-discussion",
    //           displayName: "자유 토론",
    //           sortOrder: 0
    //         }
    //       ],
    //       categories: [
    //         {
    //           id: 1,
    //           name: "일상",
    //           boardId: 1,
    //           sortOrder: 0
    //         }
    //       ]
    //     }
    //   }
    // }
}

// 3-2. 샘플 데이터 초기화
async function resetSampleData() {
    const response = await fetch('/api/community/admin/sample-data', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN'
        }
    });

    const data = await response.json();
    console.log('샘플 데이터 초기화 결과:', data);
    // Response: {
    //   success: true,
    //   data: {
    //     message: "모든 게시판과 카테고리가 초기화되었습니다.",
    //     deletedBoards: 4,
    //     deletedCategories: 12
    //   }
    // }
}

// ===== 사용 예시 =====

// 1. 게시판 관리 예시
async function manageBoards() {
    // 게시판 목록 조회
    await getBoards();

    // 새 게시판 생성
    await createBoard({
        name: 'feature-request',
        displayName: '기능 요청',
        description: '새로운 기능을 제안하는 공간입니다.',
        sortOrder: 2,
        isActive: true
    });

    // 게시판 수정
    await updateBoard(1, {
        displayName: '수정된 버그 제보',
        sortOrder: 1
    });

    // 게시판 삭제
    await deleteBoard(3);
}

// 2. 카테고리 관리 예시
async function manageCategories() {
    const boardId = 1;

    // 카테고리 목록 조회
    await getBoardCategories(boardId);

    // 새 카테고리 생성
    await createCategory(boardId, {
        name: 'UI/UX 문제',
        sortOrder: 2,
        isActive: true
    });

    // 카테고리 수정
    await updateCategory(1, {
        name: '수정된 카테고리명',
        sortOrder: 1
    });

    // 카테고리 삭제
    await deleteCategory(3);
}

// 3. 순서 관리 예시
async function manageOrder() {
    // 게시판 순서 변경
    await updateBoard(1, { sortOrder: 0 });
    await updateBoard(2, { sortOrder: 1 });
    await updateBoard(3, { sortOrder: 2 });

    // 카테고리 순서 변경
    await updateCategory(1, { sortOrder: 0 });
    await updateCategory(2, { sortOrder: 1 });
    await updateCategory(3, { sortOrder: 2 });
}

// 4. 샘플 데이터 관리 예시
async function manageSampleData() {
    // 샘플 데이터 생성
    await createSampleData();

    // 필요시 초기화
    // await resetSampleData();
}

// ===== 에러 처리 예시 =====
async function handleAdminApiError(apiCall) {
    try {
        const result = await apiCall();
        return result;
    } catch (error) {
        console.error('어드민 API 호출 오류:', error);

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
                    alert('관리자 권한이 필요합니다.');
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
    // 관리자 권한 확인
    if (!checkAdminStatus()) {
        alert('관리자 권한이 필요합니다.');
        return;
    }

    // 페이지 로드 시 게시판 목록 가져오기
    await handleAdminApiError(getBoards);

    // 게시판 생성 버튼 클릭 이벤트
    document.getElementById('createBoardBtn')?.addEventListener('click', async () => {
        const boardData = {
            name: document.getElementById('boardName').value,
            displayName: document.getElementById('boardDisplayName').value,
            description: document.getElementById('boardDescription').value,
            sortOrder: parseInt(document.getElementById('boardSortOrder').value) || 0,
            isActive: document.getElementById('boardIsActive').checked
        };

        await handleAdminApiError(() => createBoard(boardData));
    });

    // 카테고리 생성 버튼 클릭 이벤트
    document.getElementById('createCategoryBtn')?.addEventListener('click', async () => {
        const boardId = parseInt(document.getElementById('categoryBoardId').value);
        const categoryData = {
            name: document.getElementById('categoryName').value,
            sortOrder: parseInt(document.getElementById('categorySortOrder').value) || 0,
            isActive: document.getElementById('categoryIsActive').checked
        };

        await handleAdminApiError(() => createCategory(boardId, categoryData));
    });

    // 샘플 데이터 생성 버튼 클릭 이벤트
    document.getElementById('createSampleDataBtn')?.addEventListener('click', async () => {
        await handleAdminApiError(createSampleData);
    });

    // 샘플 데이터 초기화 버튼 클릭 이벤트
    document.getElementById('resetSampleDataBtn')?.addEventListener('click', async () => {
        if (confirm('모든 게시판과 카테고리를 초기화하시겠습니까?')) {
            await handleAdminApiError(resetSampleData);
        }
    });
});

// 관리자 권한 확인 함수 (실제 구현 필요)
function checkAdminStatus() {
    const token = localStorage.getItem('jwt_token');
    if (!token) return false;

    // JWT 토큰에서 사용자 역할 확인
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.role === 'admin';
    } catch (error) {
        console.error('토큰 파싱 오류:', error);
        return false;
    }
}

// ===== 관리자 대시보드 예시 =====

// 게시판 관리 대시보드
async function loadBoardDashboard() {
    console.log('=== 게시판 관리 대시보드 ===');

    // 1. 전체 게시판 목록 조회
    const boardsResponse = await getBoards();
    console.log('전체 게시판:', boardsResponse.data);

    // 2. 각 게시판의 카테고리 조회
    for (const board of boardsResponse.data) {
        const categoriesResponse = await getBoardCategories(board.id);
        console.log(`${board.displayName} 카테고리:`, categoriesResponse.data);
    }
}

// 순서 변경 대시보드
async function loadOrderDashboard() {
    console.log('=== 순서 관리 대시보드 ===');

    // 1. 게시판 순서별 정렬
    const boardsResponse = await getBoards();
    const sortedBoards = boardsResponse.data.sort((a, b) => a.sortOrder - b.sortOrder);
    console.log('정렬된 게시판:', sortedBoards);

    // 2. 각 게시판의 카테고리 순서별 정렬
    for (const board of sortedBoards) {
        const categoriesResponse = await getBoardCategories(board.id);
        const sortedCategories = categoriesResponse.data.sort((a, b) => a.sortOrder - b.sortOrder);
        console.log(`${board.displayName} 정렬된 카테고리:`, sortedCategories);
    }
}

// ===== 배치 작업 예시 =====

// 여러 게시판 일괄 생성
async function createMultipleBoards() {
    const boards = [
        {
            name: 'announcement',
            displayName: '공지사항',
            description: '중요한 공지사항을 확인하세요.',
            sortOrder: 0
        },
        {
            name: 'free-discussion',
            displayName: '자유 토론',
            description: '자유롭게 이야기를 나누는 공간입니다.',
            sortOrder: 1
        },
        {
            name: 'bug-report',
            displayName: '버그 제보',
            description: '버그를 발견하셨다면 여기에 제보해주세요.',
            sortOrder: 2
        }
    ];

    for (const board of boards) {
        await createBoard(board);
    }

    console.log('모든 게시판이 생성되었습니다.');
}

// 여러 카테고리 일괄 생성
async function createMultipleCategories(boardId) {
    const categories = [
        { name: '일상', sortOrder: 0 },
        { name: '정보 공유', sortOrder: 1 },
        { name: '질문', sortOrder: 2 }
    ];

    for (const category of categories) {
        await createCategory(boardId, category);
    }

    console.log('모든 카테고리가 생성되었습니다.');
}

// ===== 유틸리티 함수 =====

// 게시판 이름으로 ID 찾기
async function findBoardIdByName(boardName) {
    const boardsResponse = await getBoards();
    const board = boardsResponse.data.find(b => b.name === boardName);
    return board ? board.id : null;
}

// 카테고리 이름으로 ID 찾기
async function findCategoryIdByName(boardId, categoryName) {
    const categoriesResponse = await getBoardCategories(boardId);
    const category = categoriesResponse.data.find(c => c.name === categoryName);
    return category ? category.id : null;
}

// 게시판 활성화/비활성화 토글
async function toggleBoardStatus(boardId, currentStatus) {
    await updateBoard(boardId, { isActive: !currentStatus });
    console.log(`게시판 ${boardId} 상태가 ${!currentStatus ? '활성화' : '비활성화'}되었습니다.`);
}

// 카테고리 활성화/비활성화 토글
async function toggleCategoryStatus(categoryId, currentStatus) {
    await updateCategory(categoryId, { isActive: !currentStatus });
    console.log(`카테고리 ${categoryId} 상태가 ${!currentStatus ? '활성화' : '비활성화'}되었습니다.`);
} 