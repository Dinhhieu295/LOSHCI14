# Báo cáo Nghiệm thu Frontend — LifeOS (P0 / P1 / P2)

## 1. Trạng thái nghiệm thu tổng thể

**Trạng thái: ĐÃ NGHIỆM THU HOÀN TẤT (15/15 kịch bản Playwright E2E & API Passed, Build FE/BE 0 lỗi, `git diff --check` sạch).**

> **Lưu ý về dữ liệu `studyHours` cũ (nếu có trong môi trường cá nhân trước đây):**
> - Quy tắc hiện hành trên cả Backend (`/api/study/summary`) và Frontend (`computeUnifiedStudyHours`):
>   $$\text{Giờ mỗi môn} = \max(\text{studyHours nền}, \text{tổng giờ log của môn})$$
>   Khi không lọc học kỳ/trạng thái môn, tổng giờ học cộng thêm giờ log tự học chung (`courseId = null`).
> - Không tự động ghi đè hàng loạt dữ liệu `studyHours` cũ trong DB vì không thể tách biệt tự động phần giờ người dùng nhập tay với phần giờ từng được cộng dồn trước đây nếu không có bản sao lưu đối chiếu. Người dùng có thể xem trực tiếp cả **Giờ nền** và **Giờ log** ngay tại chi tiết môn học và form chỉnh sửa môn để chủ động điều chỉnh nếu cần.

---

## 2. Ma trận nghiệm thu 14 hạng mục P0 / P1 / P2

| Mã | Hạng mục & Yêu cầu | Trạng thái | File & API liên quan | Ca kiểm thử nghiệm thu |
|---|---|---|---|---|
| **P0-1** | **Sửa dự án trên UI:** tên, mô tả, trạng thái, ưu tiên, tiến độ, tag, ngày bắt đầu/kết thúc, ghim và thành viên; hiển thị thống nhất giữa Dự án và Tổng quan. | **Đạt (PASS)** | `frontend/src/ProjectsPage.tsx`, `frontend/src/App.tsx`, `backend/src/routes/projects.ts` (`GET/POST/PATCH/DELETE /api/projects`) | Playwright UI Test #3, #4 & API Test #14 |
| **P0-2** | **Task nâng cao:** người phụ trách, trạng thái, ước lượng/thực tế, subtasks, milestone (kể cả mốc `0` ngày), dependencies cùng dự án, chặn chu kỳ phụ thuộc, dọn dependency khi xóa task, biểu đồ Timeline/Gantt & Baseline. | **Đạt (PASS)** | `frontend/src/ProjectsPage.tsx`, `frontend/src/tasks.css`, `backend/src/application/services/project-service.ts` (`/api/projects/:id/tasks`) | Playwright UI Test #3, #4 & API Test #14 |
| **P0-3** | **Form đổi mật khẩu & trạng thái cá nhân:** mật khẩu hiện tại/mới/xác nhận, báo lỗi rõ, giữ phiên hiện tại và thu hồi phiên khác; chọn giống cây & lưu nhật ký vườn. | **Đạt (PASS)** | `frontend/src/ProfileEditor.tsx`, `frontend/src/App.tsx`, `backend/src/routes/profile.ts` (`PUT /api/profile/password`, `PUT /api/personal/state`) | Playwright UI Test #10 & API Test #13, #15 |
| **P0-4** | **Đồng bộ dữ liệu giờ tự học:** hợp nhất giờ nền môn học và study log (`max(studyHours, loggedHours)`), cộng log tự học chung khi không lọc học kỳ, không cộng nhầm khi lọc học kỳ. | **Đạt (PASS)** | `frontend/src/StudyPage.tsx`, `frontend/src/App.tsx`, `backend/src/application/services/study-service.ts` (`/api/study/summary`, `/api/study/study-logs`) | Playwright UI Test #9, #12 & API Test #15 |
| **P1-5** | **Kỳ thi (`/api/study/exams`):** danh sách theo ngày/môn, thêm/sửa/xóa (có xác nhận), loại kỳ thi, trọng số, tiến độ ôn tập, cập nhật nhanh `+15%`/`100%`, chống gửi lặp. | **Đạt (PASS)** | `frontend/src/StudyPage.tsx`, `frontend/src/study.css` (`GET/POST/PATCH/DELETE /api/study/exams`) | Playwright UI Test #8 & API Test #15 |
| **P1-6** | **Ghi chú (`/api/study/notes`):** danh sách, tìm kiếm từ khóa, lọc theo môn và `#tag`, thêm/sửa/xóa, hỗ trợ nội dung dài tới 50.000 ký tự, hiển thị an toàn không thực thi HTML/script, giới hạn 30 tag ($\le 40$ ký tự/tag). | **Đạt (PASS)** | `frontend/src/StudyPage.tsx`, `frontend/src/study.css` (`GET/POST/PATCH/DELETE /api/study/notes`) | Playwright UI Test #8 & API Test #15 |
| **P1-7** | **Lịch cá nhân (`/api/study/schedule`):** xem theo ngày/tuần, thêm/sửa/xóa, phân biệt rõ với lớp học cố định, kiểm tra định dạng giờ nghiêm ngặt (`00:00–23:59`, kết thúc > bắt đầu), cảnh báo trùng giờ. | **Đạt (PASS)** | `frontend/src/StudyPage.tsx`, `frontend/src/study.css` (`GET/POST/PATCH/DELETE /api/study/schedule`) | Playwright UI Test #8 & API Test #15 |
| **P1-8** | **Môn học nâng cao (`/api/study/courses`):** chỉnh tín chỉ, điểm hệ 10, điểm chữ, chuyên cần, giờ nền, mục tiêu giờ học, màu, trạng thái (`Active`/`Archived`), lọc theo học kỳ và trạng thái. | **Đạt (PASS)** | `frontend/src/StudyPage.tsx`, `frontend/src/study.css` (`GET/POST/PATCH/DELETE /api/study/courses`) | Playwright UI Test #6, #12 & API Test #15 |
| **P2-9** | **Điều hướng URL & Deep link:** giữ khu vực, tab học tập và chi tiết dự án/task/môn/bài tập/kỳ thi/ghi chú qua Refresh và Back/Forward; cảnh báo & làm sạch URL khi ID không tồn tại. | **Đạt (PASS)** | `frontend/src/App.tsx`, `frontend/src/ProjectsPage.tsx`, `frontend/src/StudyPage.tsx` | Playwright UI Test #11, #12 |
| **P2-10** | **Toast phân loại rõ, Skeleton, Offline & Retry đúng thao tác:** Toast `success`/`error`/`warning`/`info`, nút **Thử lưu lại** thực thi lại đúng thao tác lưu thất bại, giữ bản nháp khi lỗi, đóng form khi lưu thành công nhưng refresh lỗi, Offline banner tự phục hồi. | **Đạt (PASS)** | `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/ProjectsPage.tsx`, `frontend/src/StudyPage.tsx`, `frontend/src/ProfileEditor.tsx` | Playwright UI Test #10, #11, #12 |
| **P2-11** | **Dialog chuẩn & Accessibility bàn phím:** Hộp thoại có `role="dialog"`, `aria-modal`, Focus Trap (`Tab`/`Shift+Tab`), đóng bằng `Escape` trả focus về nút mở; ô tìm kiếm chuẩn WAI-ARIA Combobox/Listbox chọn bằng `ArrowUp`/`ArrowDown`/`Enter`/`Escape`. | **Đạt (PASS)** | `frontend/src/App.tsx`, `frontend/src/GlobalSearch.tsx`, `frontend/src/ProfileEditor.tsx` | Playwright UI Test #11, #12 |
| **P2-12** | **Responsive `320px`–Desktop & `prefers-reduced-motion`:** Không tràn ngang ở `320px`, `390px`, `768px`, `1024px`, `1280px`; bảng thời khóa biểu và timeline cuộn ngang có chỉ dẫn; giảm chuyển động và cuộn tức thì khi bật `prefers-reduced-motion`. | **Đạt (PASS)** | `frontend/src/styles.css`, `frontend/src/study.css`, `frontend/src/tasks.css` | Playwright UI Test #10 |
| **P2-13** | **Tìm kiếm toàn cục mở rộng:** Tìm kiếm không dấu (hỗ trợ `đ -> d`) trên Dự án, Task, Môn học, Bài tập, Kỳ thi, Ghi chú thuộc tài khoản hiện tại; phân bổ quota công bằng giữa các nhóm kết quả; chống ghi đè bởi truy vấn cũ. | **Đạt (PASS)** | `frontend/src/GlobalSearch.tsx`, `frontend/src/search.css` | Playwright UI Test #3, #12 |
| **P2-14** | **Bộ lọc & Sắp xếp theo tài khoản:** Lưu filter và sort theo `userId` trong `localStorage` kèm kiểm tra giá trị hợp lệ; có nút **Xóa bộ lọc**; phân biệt danh sách rỗng với bộ lọc không có kết quả; tự mở khóa bộ lọc khi chọn từ tìm kiếm/deep link. | **Đạt (PASS)** | `frontend/src/ProjectsPage.tsx`, `frontend/src/StudyPage.tsx` | Playwright UI Test #12 |

---

## 3. Các lỗi kỹ thuật và đồng bộ dữ liệu đã phát hiện & xử lý

1. **Lỗi Zod `.default().partial()` ghi đè dữ liệu khi `PATCH` một phần (`backend/src/routes/projects.ts`, `backend/src/routes/study.ts`):**
   - **Nguyên nhân:** Trong Zod v4, khi gọi `.partial()` trên schema có các trường khai báo `.default(...)`, các trường không được gửi trong body `PATCH` (ví dụ chỉ gửi `{ isPinned: true }` hoặc `{ note: 'Updated' }`) bị Zod tự động điền giá trị mặc định (`courseId: null`, `progress: 0`, `members: []`, `weight: 0`...), làm mất dữ liệu đã lưu.
   - **Khắc phục:** Bổ sung hàm `pickPresentKeys(parsed, req.body)` tại tầng route `PATCH /api/projects`, `PATCH /api/projects/:id/tasks/:taskId` và `PATCH /api/study/:resource/:id` để chỉ giữ lại các trường thực sự có mặt trong `req.body` sau khi đã xác thực kiểu dữ liệu qua Zod.
   - **Ca hồi quy:** API Test #15 (`PATCH /study/study-logs/:id` chỉ cập nhật `note` không làm mất `courseId`, giữ nguyên tổng giờ học `8h`).

2. **Lỗi Timeline ép thời lượng cột mốc `0` ngày thành `1` ngày (`frontend/src/ProjectsPage.tsx`):**
   - **Nguyên nhân:** Biểu thức `(t.durationDays || 1)` và thuộc tính HTML `min={1}` trên ô nhập thời lượng khiến cột mốc `0` ngày bị ép thành `1` ngày.
   - **Khắc phục:** Đổi `min={0}` cho cả `durationDays` và `baselineDuration`, dùng `t.durationDays ?? 0`, và hiển thị ký hiệu kim cương `◆` (`.timeline-milestone-zero`) rõ ràng cho cột mốc `0` ngày trên biểu đồ Timeline.
   - **Ca hồi quy:** UI Test #4 & API Test #14.

3. **Lỗi cộng nhầm log tự học chung khi lọc theo học kỳ trên UI (`frontend/src/StudyPage.tsx`):**
   - **Nguyên nhân:** Hàm `computeUnifiedStudyHours` luôn cộng `unassignedMinutes` ngay cả khi người dùng đang bật bộ lọc học kỳ hoặc trạng thái môn.
   - **Khắc phục:** Thêm tham số `includeUnassigned = !isCourseScoped` vào `computeUnifiedStudyHours` và lọc `scopedLogs` theo tập môn học đang lọc để số liệu trên UI khớp tuyệt đối với `/api/study/summary?semester=...`.
   - **Ca hồi quy:** UI Test #12 & API Test #15.

4. **Lỗi `loadData()` nuốt ngoại lệ khiến thông báo thành công ghi đè cảnh báo lỗi làm mới (`frontend/src/App.tsx`):**
   - **Nguyên nhân:** Khi thao tác tạo/sửa (`POST`/`PATCH`) thành công nhưng bước `refresh()` kế tiếp thất bại, `loadData()` bắt lỗi nội bộ và không ném lại ngoại lệ cho `safeRefreshAfterMutation`, dẫn tới Toast báo thành công đè lên thông báo lỗi tải danh sách.
   - **Khắc phục:** Bổ sung tùy chọn `loadData({ throwOnError: true })` cho các lệnh refresh sau mutation để hiển thị đúng `.toast-warning` (*"Đã tạo dự án mới. Tuy nhiên chưa tải lại được danh sách mới nhất."*) đồng thời đóng form tạo mới để ngăn người dùng bấm lưu lặp.
   - **Ca hồi quy:** UI Test #12 (mục 4).

5. **Lỗi kiểm tra khung giờ lịch cá nhân và chu kỳ phụ thuộc task:**
   - **Khắc phục:** Sử dụng biểu thức chính quy toàn chuỗi trong `parseTimeRange` để chặn triệt để giờ ngoài phạm vi (`25:00`), chuỗi thừa ký tự hoặc giờ kết thúc $\le$ giờ bắt đầu (`10:00 - 09:00`); bổ sung thuật toán DFS kiểm tra chu kỳ phụ thuộc (`hasTaskDependencyCycle`) ở cả Frontend và Backend (`ProjectService.updateTask`) và tự động gỡ ID task bị xóa khỏi `dependencies` của các task còn lại.
   - **Ca hồi quy:** UI Test #8 & API Test #14.

---

## 4. Bằng chứng Build và Kiểm thử thực tế

### 4.1. Kết quả Build & Kiểm tra mã nguồn
- **Backend Build (`cd backend && npm run build`):** Thành công (`tsc` exit code 0).
- **Frontend Build (`cd frontend && npm run build`):** Thành công (`tsc -b && vite build` exit code 0).
- **Docker Compose (`docker compose up --build -d`):** Cả 3 container `loshci14-db-1`, `loshci14-api-1`, `loshci14-frontend-1` hoạt động ở trạng thái `Healthy / Running`.
- **Git Diff Check (`git diff --check`):** Exit code 0 (không có lỗi khoảng trắng hay xung đột).

### 4.2. Kết quả chạy Playwright E2E & API (`test/lifeos.spec.ts`)
- **Lệnh thực thi:** `npx playwright test test/lifeos.spec.ts --reporter=list`
- **Kết quả:** **15/15 Passed (18.9s)**

| # | Nhóm | Tên kịch bản kiểm thử | Kết quả |
|---:|---|---|---|
| 1 | UI | `đăng nhập lại và đăng xuất` | **PASSED** |
| 2 | UI | `hiển thị tổng quan và lưu giao diện tối sau khi tải lại` | **PASSED** |
| 3 | UI | `tạo, sửa, hoàn thành, tìm kiếm (hỗ trợ đ -> d) và xóa dự án cùng task` | **PASSED** |
| 4 | UI | `dự án nâng cao, task milestone 0 ngày, subtasks, phụ thuộc và timeline` | **PASSED** |
| 5 | UI | `bật/tắt nhắc hạn task` | **PASSED** |
| 6 | UI | `thêm môn và lịch học, sửa/xóa buổi học, xem thời khóa biểu` | **PASSED** |
| 7 | UI | `tạo, sửa, hoàn tất/khôi phục và xóa bài tập` | **PASSED** |
| 8 | UI | `CRUD kỳ thi, ghi chú (an toàn script) và lịch cá nhân (kiểm tra trùng giờ & thứ tự giờ)` | **PASSED** |
| 9 | UI | `bấm giờ tự học, tạm dừng/tiếp tục và lưu study log` | **PASSED** |
| 10 | UI | `sửa hồ sơ, đổi mật khẩu, chi hạt giống và điều hướng trên mobile (390px & 320px)` + kiểm tra không tràn ngang ở `320/390/768/1024/1280px` & Offline banner | **PASSED** |
| 11 | UI | `điều hướng URL, Back/Forward, hộp thoại Escape focus trap và retry khi lưu lỗi` | **PASSED** |
| 12 | UI | `lọc học kỳ giờ học trên UI, tìm kiếm bàn phím, mutation thành công nhưng refresh lỗi và hết hạn token` | **PASSED** |
| 13 | API | `health, đăng ký, đăng nhập sai, đổi mật khẩu thu hồi phiên khác và xác thực phiên` | **PASSED** |
| 14 | API | `CRUD dự án/task, giữ durationDays=0, chặn vòng lặp phụ thuộc và ngăn truy cập chéo tài khoản` | **PASSED** |
| 15 | API | `CRUD tài nguyên học tập, quy tắc tính giờ nền/log/lọc học kỳ, quyền môn học và trạng thái cá nhân` | **PASSED** |
