# LifeOS — prompt triển khai và hướng phát triển frontend

## Trạng thái hiện tại

Giao diện có đăng ký/đăng nhập, tổng quan, tìm kiếm dự án/task, CRUD dự án và task, môn học, lịch học, bài tập, bấm giờ tự học, heatmap, hồ sơ, trạng thái cá nhân, nhắc hạn, theme sáng/tối và menu mobile. Nút Trợ giúp đã mở hướng dẫn sử dụng ngay trong ứng dụng.

Backend còn API chưa có giao diện: kỳ thi (`/api/study/exams`), ghi chú (`/api/study/notes`), lịch cá nhân (`/api/study/schedule`), đổi mật khẩu (`PUT /api/profile/password`), cập nhật đầy đủ trạng thái cá nhân (`PUT /api/personal/state`). Dự án có các trường nâng cao như tiến độ, trạng thái, thành viên, mốc và phụ thuộc task nhưng form hiện chỉ nhập tên/mô tả và task cơ bản.

## Prompt để tiếp tục hoàn thiện

> Bạn là kỹ sư frontend React/TypeScript cho dự án LifeOS tại `D:\lifeOS 2.0\LOSHCI14`. Hãy kiểm tra source và git status trước khi sửa, giữ nguyên các thay đổi của người dùng. Hoàn thiện giao diện cho toàn bộ API hiện có theo thứ tự ưu tiên bên dưới. Với mỗi chức năng, thêm trạng thái loading, lỗi, rỗng, validation, xác nhận trước khi xóa, hỗ trợ bàn phím và mobile. Dùng `frontend/src/api.ts` và các mẫu component hiện có, không tạo mock thay cho API thật. Không sửa backend trừ khi tìm thấy lỗi ngăn tính năng hoạt động; báo rõ mọi thay đổi. Sau mỗi nhóm chạy `npm run build`, kiểm thử luồng chính, kiểm tra `git diff --check`, ghi lại chức năng đã hoàn tất và phần còn lại.

### P0 — hoàn thiện luồng hiện có

1. Sửa dự án trên UI: tên, mô tả, trạng thái, ưu tiên, tiến độ, tag, ngày bắt đầu/kết thúc, ghim và thành viên. Hiển thị thống nhất ở trang Dự án/Tổng quan.
2. Task nâng cao: người phụ trách, ước lượng/thực tế, subtasks, milestone, dependencies và timeline. Kiểm tra phụ thuộc chỉ trỏ đến task cùng dự án.
3. Form đổi mật khẩu ở Cá nhân: mật khẩu hiện tại/mới/xác nhận, trạng thái lỗi rõ ràng, xử lý phiên sau khi đổi theo backend.
4. Khắc phục dữ liệu tổng quan tự học: xác định nguồn giờ học từ course và study log, tránh hiển thị số liệu lệch sau khi bấm giờ.

### P1 — đưa API học tập lên UI

5. Kỳ thi: danh sách theo ngày/môn, thêm/sửa/xóa, loại kỳ thi, trọng số, tiến độ ôn tập, trạng thái sắp tới/quá hạn.
6. Ghi chú: danh sách, tìm kiếm/lọc theo môn/tag, thêm/sửa/xóa, nội dung dài và trạng thái rỗng.
7. Lịch cá nhân: xem theo ngày/tuần, thêm/sửa/xóa, phân biệt với thời khóa biểu môn học, xử lý trùng thời gian.
8. Môn học: cho chỉnh tín chỉ, điểm, điểm chữ, tỷ lệ chuyên cần, mục tiêu giờ học, màu, trạng thái lưu trữ; lọc theo học kỳ.

### P2 — nâng trải nghiệm

9. Điều hướng URL cho từng khu vực và chi tiết dự án/môn để refresh và chia sẻ liên kết không mất vị trí.
10. Toast có loại thành công/lỗi, nút thử lại khi API lỗi, skeleton khi tải, trạng thái offline.
11. Dialog chuẩn với focus trap, Escape, trả focus về nút mở; kiểm tra tương phản, nhãn input và thao tác bàn phím.
12. Responsive cho 320px–desktop; bảng thời khóa biểu cuộn có chỉ dẫn; giảm chuyển động theo `prefers-reduced-motion`.
13. Tìm kiếm mở rộng sang môn, bài tập, ghi chú và kỳ thi; chỉ tìm dữ liệu thuộc tài khoản hiện tại.
14. Bộ lọc/sắp xếp cho dự án, task và bài tập theo trạng thái, ưu tiên, hạn; lưu lựa chọn hợp lý.

## Tiêu chí nghiệm thu

- Mọi nút có tác dụng thực, form lưu qua API, dữ liệu còn sau refresh và đăng nhập lại.
- Không đọc/sửa dữ liệu tài khoản khác; route không token được xử lý nhất quán.
- Các trạng thái rỗng, loading, lỗi, thành công và validation đều hiển thị rõ.
- Không mất dữ liệu khi hủy form; xóa có xác nhận; thao tác lặp không tạo bản ghi trùng.
- `npm run build` thành công và kiểm thử thủ công theo `test/KICH-BAN-KIEM-THU.md`.

## Gợi ý định hướng UI

Giữ ngôn ngữ thị giác LifeOS hiện tại: thẻ bo góc, màu nhẹ, biểu tượng Lucide, typography dễ đọc. Ưu tiên mật độ thông tin vừa phải và hành động chính rõ ràng; dùng cùng một mẫu form, modal, empty state, loading và toast trên toàn ứng dụng. Trang Học tập nên có tab Môn học, Bài tập, Kỳ thi, Ghi chú và Lịch; Tổng quan hiển thị việc sắp đến hạn trước, sau đó mới đến thống kê. Trên mobile, đưa hành động thêm vào vị trí dễ chạm và tránh biểu đồ/bảng vượt chiều ngang.
