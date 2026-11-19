# Nhật ký cập nhật giao diện Frontend & Đồng bộ API — LifeOS

Tài liệu này ghi nhận chi tiết toàn bộ các thay đổi thực tế trên mã nguồn để hoàn thiện và nghiệm thu 14 hạng mục **P0 / P1 / P2** theo `FRONTEND-PROMPTING.md` và `NGHIEM-THU-FRONTEND.md`.

---

## 1. Danh sách các file thay đổi

| # | File | Phạm vi | Nội dung thay đổi chính |
|---:|---|---|---|
| 1 | `frontend/src/api.ts` | API Client & Types | Định nghĩa đầy đủ kiểu dữ liệu (`Project`, `ProjectTask`, `Course`, `Assignment`, `Exam`, `StudyNote`, `ScheduleItem`, `PersonalState`, `NoticePayload`), hàm `changePassword`, `updatePersonalState` và phát sự kiện toàn cục `lifeos:unauthorized` khi nhận HTTP `401`. |
| 2 | `frontend/src/App.tsx` | Điều hướng URL, Tổng quan, Cá nhân, Toast/Offline | Đồng bộ URL 2 chiều (`/projects?project=...&task=...`, `/study?tab=...&course=...&assignment=...&exam=...&note=...`), chống race-condition khi đổi tài khoản (`loadGenRef`), phân biệt trạng thái tải lần đầu (`dataReady`) với danh sách rỗng, xử lý `throwOnError` khi refresh lỗi sau mutation, Focus Trap hộp thoại Trợ giúp và cấu hình vườn hạt giống (`PUT /api/personal/state`). |
| 3 | `frontend/src/ProjectsPage.tsx` | Dự án & Task nâng cao | Tạo/sửa đầy đủ trường dự án, ghim dự án, đồng bộ tiến độ thủ công/theo task, task nâng cao (`assignee`, `status`, `estimate`, `actual`, `subtasksDone/Total`, `isMilestone`, `dependencies`, `startDay`, `durationDays`, `baselineStart/Duration`), hỗ trợ cột mốc `0` ngày (`◆`), chặn vòng lặp phụ thuộc, lưu bộ lọc theo tài khoản và retry đúng thao tác lưu thất bại. |
| 4 | `frontend/src/StudyPage.tsx` | Không gian Học tập | Hệ thống Tab học tập (`Tất cả`, `Môn học`, `Bài tập`, `Kỳ thi`, `Ghi chú`, `Lịch`), CRUD đầy đủ cho Môn học nâng cao, Buổi học, Bài tập, Kỳ thi, Ghi chú, Lịch cá nhân và Study Log; kiểm tra khung giờ nghiêm ngặt và cảnh báo trùng lịch; đồng bộ quy tắc giờ học theo phạm vi lọc học kỳ. |
| 5 | `frontend/src/ProfileEditor.tsx` | Hồ sơ & Đổi mật khẩu | Chỉnh sửa hồ sơ kèm kiểm tra URL ảnh đại diện, form Đổi mật khẩu bảo mật (`PUT /api/profile/password`), liên kết lỗi với input qua `aria-describedby`/`aria-invalid` và hỗ trợ retry khi lưu lỗi. |
| 6 | `frontend/src/GlobalSearch.tsx` | Tìm kiếm toàn cục | Tìm kiếm không dấu (hỗ trợ `đ -> d`) trên Dự án, Task, Môn học, Bài tập, Kỳ thi, Ghi chú; phân bổ kết quả cân bằng (`balancedMerge`) giữa các nhóm; điều hướng bàn phím chuẩn WAI-ARIA Combobox/Listbox (`ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, `Escape`); chống ghi đè kết quả bởi truy vấn cũ. |
| 7 | `frontend/src/styles.css` | CSS toàn cục | Responsive từ `320px`, style cho `.toast-success`, `.toast-error`, `.toast-warning`, `.toast-info`, `.offline-banner`, `.error-retry-banner`, `.skeleton-card`/`.skeleton-line`, focus ring rõ ràng và `@media (prefers-reduced-motion: reduce)`. |
| 8 | `frontend/src/tasks.css` | CSS Dự án & Task | Style cho form dự án/task nâng cao, thanh công cụ lọc, biểu đồ Timeline/Gantt, đánh dấu cột mốc `0` ngày (`.timeline-milestone-zero`) và trạng thái vô hiệu hóa chip phụ thuộc gây vòng lặp. |
| 9 | `frontend/src/study.css` | CSS Học tập | Style cho thanh Tab học tập, chỉ số giờ nền/giờ log môn học, thẻ Kỳ thi, thẻ Ghi chú, lưới Lịch cá nhân tuần/ngày, cảnh báo trùng giờ và chỉ dẫn cuộn ngang thời khóa biểu. |
| 10 | `frontend/src/profile.css` | CSS Hồ sơ & Cá nhân | Style cho form đổi mật khẩu, banner xác nhận bảo mật, bảng chọn giống cây và lịch sử phát triển cá nhân. |
| 11 | `frontend/src/search.css` | CSS Tìm kiếm | Style cho các biểu tượng phân loại kết quả tìm kiếm và trạng thái `.active-option` khi di chuyển bằng bàn phím. |
| 12 | `backend/src/routes/projects.ts` | Backend Route Projects | Bổ sung `pickPresentKeys` cho các route `PATCH` để ngăn Zod `.default().partial()` ghi đè các trường không gửi lên về giá trị mặc định. |
| 13 | `backend/src/routes/study.ts` | Backend Route Study | Bổ sung `pickPresentKeys` cho `PATCH /api/study/:resource/:id` để bảo toàn dữ liệu hiện có khi cập nhật một phần. |
| 14 | `backend/src/application/services/project-service.ts` | Backend Service Projects | Kiểm tra chặn chu kỳ phụ thuộc (`hasCycle`) khi cập nhật `dependencies` của task và tự động gỡ ID task đã xóa khỏi `dependencies` của các task cùng dự án. |
| 15 | `backend/src/application/services/study-service.ts` | Backend Service Study | Đồng bộ quy tắc tính `totalStudyHours` (`max(studyHours, loggedHours)` cho mỗi môn + log tự học chung khi không lọc học kỳ) và lọc số lượng bài tập theo học kỳ được chọn. |
| 16 | `test/lifeos.spec.ts` | Kiểm thử tự động Playwright | Mở rộng bộ kiểm thử lên **15 kịch bản E2E UI & API** bao phủ toàn bộ luồng P0/P1/P2, xác nhận xóa, cột mốc 0 ngày, chặn vòng lặp phụ thuộc, lọc học kỳ, đổi mật khẩu, tìm kiếm bàn phím, URL deep link, retry khi lưu lỗi, refresh lỗi sau mutation, hết hạn token, responsive `320px–1280px` và Offline mode. |

---

## 2. Ma trận trạng thái P0 / P1 / P2

- **P0 (Mục 1–4):** Hoàn tất 4/4 hạng mục — Đã kiểm thử E2E & API (**PASS**).
- **P1 (Mục 5–8):** Hoàn tất 4/4 hạng mục — Đã kiểm thử E2E & API (**PASS**).
- **P2 (Mục 9–14):** Hoàn tất 6/6 hạng mục — Đã kiểm thử E2E & API (**PASS**).

Chi tiết từng ca kiểm thử, nguyên nhân lỗi đã khắc phục và bằng chứng chạy thực tế được trình bày đầy đủ trong file [NGHIEM-THU-FRONTEND.md](file:///D:/lifeOS%202.0/LOSHCI14/NGHIEM-THU-FRONTEND.md).
