# Kịch bản kiểm thử chức năng cơ bản – LifeOS

## 1. Mục tiêu và cách dùng

Tài liệu này bao phủ các luồng chính trên giao diện LifeOS và các nhóm API được cung cấp trong backend. Đây là kịch bản kiểm thử thủ công; chưa thực hiện chạy kiểm thử.

- **Môi trường:** chạy ứng dụng theo hướng dẫn trong `README.md`; API tại `http://localhost:4000`, giao diện tại `http://localhost:5173`.
- **Dữ liệu:** dùng tài khoản kiểm thử riêng, ví dụ `qa.lifeos@example.com`; mật khẩu tối thiểu 8 ký tự. Có thể dùng tài khoản demo `demo@lifeos.local` / `LifeOS123!` nếu đã chạy seed.
- **Cách ghi nhận:** đánh dấu từng mã là Đạt/Không đạt/Không áp dụng, kèm trình duyệt, thời điểm, dữ liệu thực tế và ảnh chụp lỗi nếu có.
- **Lưu ý:** xóa dữ liệu ở các bước cleanup chỉ thực hiện với dữ liệu do người kiểm thử tạo.

## 2. Kiểm thử giao diện và phiên đăng nhập

| Mã | Chức năng | Các bước | Kết quả mong đợi |
|---|---|---|---|
| AUTH-01 | Đăng ký tài khoản | Tại màn hình đăng nhập, chọn đăng ký; nhập họ tên, email mới, mật khẩu hợp lệ và xác nhận trùng khớp; gửi form. | Tạo tài khoản thành công, vào ứng dụng với đúng tên; phiên được giữ sau khi tải lại trang. |
| AUTH-02 | Kiểm tra dữ liệu đăng ký sai | Thử email sai định dạng, mật khẩu dưới 8 ký tự, bỏ trống tên, xác nhận mật khẩu khác; sau đó thử đăng ký lại email đã tồn tại. | Trình duyệt/API chặn dữ liệu không hợp lệ hoặc hiện lỗi dễ hiểu; không tạo tài khoản trùng. |
| AUTH-03 | Đăng nhập | Đăng xuất; đăng nhập bằng tài khoản hợp lệ. | Vào màn hình Tổng quan; tải được dữ liệu của tài khoản. |
| AUTH-04 | Đăng nhập sai | Nhập email không tồn tại hoặc sai mật khẩu. | Không đăng nhập; có thông báo lỗi; không lộ thông tin nhạy cảm. |
| AUTH-05 | Hiện/ẩn mật khẩu | Bấm nút hiện mật khẩu rồi bấm lại. | Kiểu hiển thị đổi qua lại, giá trị không bị mất. |
| AUTH-06 | Đăng xuất và phiên cũ | Đăng xuất; thử tải lại hoặc truy cập API bằng token cũ. | Trở về màn hình đăng nhập; token cũ không còn truy cập được API bảo vệ. |
| NAV-01 | Điều hướng các khu vực | Lần lượt mở Tổng quan, Dự án, Học tập, Cá nhân bằng menu. | Tiêu đề/nội dung đúng khu vực; dữ liệu không biến mất khi chuyển qua lại. |
| NAV-02 | Giao diện tối/sáng | Đổi giao diện, tải lại trang. | Giao diện đổi đúng và lựa chọn được giữ sau khi tải lại. |
| NAV-03 | Điều hướng di động | Thu nhỏ cửa sổ/giả lập điện thoại; mở menu, chọn khu vực, đóng bằng nút hoặc nền mờ. | Menu mở/đóng đúng; chọn mục đóng menu; nội dung không tràn ngang gây mất thao tác. |
| NAV-04 | Cập nhật dữ liệu | Tạo hoặc sửa dữ liệu, bấm Cập nhật/Làm mới ở trang Tổng quan hoặc Cá nhân. | Số liệu và danh sách được tải lại, phản ánh dữ liệu mới nhất. |

## 3. Tổng quan, tìm kiếm và nhắc hạn

| Mã | Chức năng | Các bước | Kết quả mong đợi |
|---|---|---|---|
| DASH-01 | Tổng quan có dữ liệu | Đăng nhập tài khoản có dự án, môn học, bài tập và trạng thái cá nhân. | Hiện lời chào, ngày, số liệu, danh sách dự án/bài tập và lối tắt; số liệu khớp dữ liệu nguồn. |
| DASH-02 | Tổng quan rỗng | Đăng nhập tài khoản mới chưa có dữ liệu. | Hiện trạng thái rỗng phù hợp; nút tạo dự án/lối tắt học tập điều hướng đúng. |
| SEARCH-01 | Tìm dự án | Tạo dự án có tên dễ nhận diện; tìm toàn bộ hoặc một phần tên trong tìm kiếm chung. | Gợi ý dự án phù hợp; chọn kết quả mở trang Dự án và đúng dự án. |
| SEARCH-02 | Tìm task | Tạo task trong dự án; tìm theo tên task, chọn kết quả. | Mở đúng dự án, bung danh sách task và làm nổi bật task phù hợp. |
| SEARCH-03 | Không có kết quả | Tìm chuỗi không tồn tại; thử khoảng trắng đầu/cuối và khác biệt chữ hoa/thường/dấu nếu phù hợp. | Hiện thông báo không tìm thấy hoặc chuẩn hóa truy vấn nhất quán; không lỗi giao diện. |
| REM-01 | Bật/tắt nhắc hạn | Trong trang Dự án, bật/tắt nhắc hạn; tải lại trang. | Trạng thái bật/tắt hiển thị đúng và được lưu theo tài khoản. |
| REM-02 | Task đến hạn ngày mai | Tạo task chưa hoàn thành có hạn ngày mai, bật nhắc hạn và mở/tải lại ứng dụng. | Có thông báo trong ứng dụng; nếu trình duyệt đã cấp quyền thì có notification; không nhắc lặp cùng task/hạn sau khi đã ghi nhận. |
| REM-03 | Bài tập đến hạn ngày mai | Tạo bài tập chưa hoàn thành có hạn ngày mai, bật nhắc hạn. | Có thông báo phù hợp; bài tập đã hoàn tất hoặc nhắc hạn bị tắt thì không phát thông báo. |

## 4. Dự án và task

| Mã | Chức năng | Các bước | Kết quả mong đợi |
|---|---|---|---|
| PROJ-01 | Tạo dự án | Chọn Tạo dự án; nhập tên và mô tả; lưu. | Dự án xuất hiện trong danh sách và Tổng quan; bộ đếm cập nhật. |
| PROJ-02 | Kiểm tra tên dự án | Thử gửi tên rỗng/khoảng trắng; thử độ dài vượt giới hạn nếu có thể qua API. | Form/API từ chối dữ liệu; không tạo bản ghi rỗng. |
| PROJ-03 | Mở/thu gọn task | Bấm Quản lý task trên dự án. | Khu vực task và form thêm task mở/đóng đúng dự án. |
| PROJ-04 | Tạo task | Nhập tên, ngày nộp (tùy chọn), mức ưu tiên; thêm task. | Task xuất hiện với tên, hạn, ưu tiên đúng. |
| PROJ-05 | Hoàn thành/khôi phục task | Bấm trạng thái hoàn thành rồi bấm lại. | Trạng thái và kiểu hiển thị đổi đúng; dữ liệu còn đúng sau tải lại. |
| PROJ-06 | Sửa task | Sửa tên, ngày nộp hoặc ưu tiên; lưu. | Giá trị mới hiển thị; không tạo task trùng. |
| PROJ-07 | Xóa task | Xóa task kiểm thử. | Task biến mất và vẫn không xuất hiện sau tải lại. |
| PROJ-08 | Xóa dự án | Xóa dự án kiểm thử đã tạo. | Dự án bị xóa; task liên quan không còn truy cập được; giao diện cập nhật. |
| PROJ-09 | Phân quyền dữ liệu dự án | Đăng nhập tài khoản B; thử lấy/sửa/xóa ID dự án/task thuộc tài khoản A qua API. | Tài khoản B không đọc hoặc thay đổi dữ liệu của A; trả lỗi phù hợp. |

## 5. Học tập

| Mã | Chức năng | Các bước | Kết quả mong đợi |
|---|---|---|---|
| STUDY-01 | Tạo môn học | Thêm môn với tên, mã môn, học kỳ và giảng viên. | Môn hiển thị trong danh sách; có thể gắn bài tập/lịch học. |
| STUDY-02 | Sửa/xóa môn | Mở chi tiết môn, sửa thông tin rồi lưu; tiếp tục xóa môn kiểm thử. | Thông tin sửa được lưu; xóa loại bỏ môn khỏi danh sách và cập nhật dữ liệu liên quan theo quy tắc ứng dụng. |
| STUDY-03 | Thêm/sửa/xóa buổi học | Trong chi tiết môn, thêm ngày trong tuần, giờ bắt đầu/kết thúc, tiết, địa điểm/phòng; sửa rồi xóa. | Buổi học xuất hiện đúng trong chi tiết và thời khóa biểu; thao tác sửa/xóa được phản ánh. |
| STUDY-04 | Kiểm tra thời lượng buổi học | Thử giờ kết thúc trước/bằng giờ bắt đầu, hoặc tiết kết thúc trước tiết bắt đầu (qua API nếu form không cho). | API từ chối dữ liệu không hợp lệ với lỗi xác thực phù hợp. |
| STUDY-05 | Thời khóa biểu | Xem bản tóm tắt tuần, mở đầy đủ và thu gọn. | Ngày/giờ/môn học khớp buổi học đã khai báo; không lỗi khi tuần trống. |
| STUDY-06 | Tạo bài tập | Thêm bài tập với tiêu đề, hạn, ưu tiên và môn học (hoặc không gắn môn). | Bài tập xuất hiện đúng thông tin; số bài chờ và Tổng quan cập nhật. |
| STUDY-07 | Sửa/hoàn tất/khôi phục/xóa bài tập | Sửa bài tập; đánh dấu hoàn tất rồi khôi phục; cuối cùng xóa. | Thay đổi trạng thái/thông tin chính xác; bài tập hoàn tất không còn tính là đang chờ. |
| STUDY-08 | Bộ đếm tự học | Chọn môn hoặc tự học chung, nhập ghi chú; bắt đầu, tạm dừng, tiếp tục, kết thúc và lưu. | Bộ đếm hoạt động; log lưu số phút, ngày, môn và ghi chú; tổng thời gian/heatmap cập nhật. |
| STUDY-09 | Bỏ phiên bấm giờ | Bắt đầu phiên rồi chọn bỏ phiên. | Phiên bị hủy, không tạo study log. |
| STUDY-10 | Lịch sử/heatmap | Xem tuần hiện tại, tuần trước; thử điều hướng tới tuần sau. | Thời lượng mỗi ngày và tổng tuần khớp log; không cho điều hướng vượt tuần hiện tại nếu nút bị giới hạn. |
| STUDY-11 | Xóa study log | Xóa log kiểm thử trong danh sách lịch sử nếu hiển thị. | Log biến mất; tổng giờ/heatmap được tính lại. |
| STUDY-12 | Tóm tắt học tập | Tạo môn, bài tập, log rồi đối chiếu Tổng quan và trang Học tập. | Tổng môn đang hoạt động, bài tập chờ và giờ học khớp API/dữ liệu. |

## 6. Cá nhân và hồ sơ

| Mã | Chức năng | Các bước | Kết quả mong đợi |
|---|---|---|---|
| PERSONAL-01 | Xem nhịp sống | Mở khu vực Cá nhân. | Hiện chuỗi ngày, hạt giống, XP và cấp độ từ trạng thái đã lưu. |
| PERSONAL-02 | Chi hạt giống hợp lệ | Ghi số dư ban đầu; nhập số hạt dương không lớn hơn số dư; gieo hạt. | Thông báo thành công; số dư giảm đúng; trạng thái giữ sau tải lại. |
| PERSONAL-03 | Chi hạt giống không hợp lệ | Thử 0, số âm, vượt số dư và vượt giới hạn cho phép. | Bị chặn hoặc báo lỗi; số dư không đổi. |
| PROFILE-01 | Sửa hồ sơ | Mở phần hồ sơ, sửa tên, ngày sinh, điện thoại, nơi ở và giới thiệu; lưu. | Thông tin mới hiển thị và còn sau tải lại. |
| PROFILE-02 | Hủy sửa hồ sơ | Thay đổi dữ liệu trong form rồi bấm Hủy. | Không lưu thay đổi nháp; hồ sơ quay về dữ liệu trước đó. |
| PROFILE-03 | Kiểm tra dữ liệu hồ sơ | Thử URL avatar sai định dạng, giới thiệu dài hơn giới hạn hoặc tên rỗng qua API. | API từ chối dữ liệu sai; dữ liệu hợp lệ hiện lỗi thì không bị mất bản lưu cũ. |

## 7. Kiểm thử API cơ bản

Các kiểm tra dưới đây dùng Postman/cURL hoặc công cụ tương đương; endpoint bắt đầu bằng `/api`. Sau đăng nhập, gửi `Authorization: Bearer <token>` cho route yêu cầu xác thực.

| Mã | Nhóm | Bước/đầu vào | Kết quả mong đợi |
|---|---|---|---|
| API-01 | Health | `GET /health` | HTTP 200, JSON có `status: ok`, `database: postgres`. |
| API-02 | Bảo vệ route | Gọi `/api/profile`, `/api/projects`, `/api/study/summary`, `/api/personal/state` không token hoặc token sai. | HTTP 401; không trả dữ liệu riêng tư. |
| API-03 | Auth/profile | Kiểm tra `/auth/me`, `PATCH /profile`, `PUT /profile/password`; sau đổi mật khẩu đăng nhập lại bằng mật khẩu mới. | Trả thông tin tài khoản hiện tại; đổi hồ sơ/mật khẩu đúng; mật khẩu sai cũ bị từ chối; phiên theo chính sách bị thu hồi. |
| API-04 | CRUD dự án/task | Thực hiện GET/POST/PATCH/DELETE dự án và task; thử ID không tồn tại, payload sai. | Mã phản hồi và dữ liệu đúng; payload sai bị từ chối; không sửa/xóa nhầm bản ghi. |
| API-05 | CRUD tài nguyên học tập | Với `/study/courses`, `/assignments`, `/exams`, `/notes`, `/schedule`, `/course-sessions`, `/study-logs`: lần lượt GET/POST/PATCH/DELETE bản ghi kiểm thử. | CRUD hoạt động, dữ liệu đúng kiểu; summary cập nhật khi tài nguyên liên quan thay đổi. |
| API-06 | Quyền sở hữu môn học | Tạo hai tài khoản; dùng `courseId` của A khi tạo assignment/session/log cho B. | API từ chối liên kết tài nguyên không thuộc người dùng hiện tại. |
| API-07 | Query tóm tắt | Gọi `GET /study/summary` có và không có `semester`. | Tổng hợp trả về đúng phạm vi học kỳ và dữ liệu người dùng. |
| API-08 | Trạng thái cá nhân | GET/PUT `/personal/state`; POST `/personal/coins/spend` với giá trị hợp lệ và không hợp lệ. | Lưu/đọc nhất quán; số dư không âm; dữ liệu không hợp lệ bị từ chối. |
| API-09 | Endpoint không tồn tại | Gọi URL API không được khai báo. | HTTP 404 với mã lỗi `NOT_FOUND`. |

> Ghi chú phạm vi: giao diện hiện cung cấp rõ luồng môn học, bài tập, lịch buổi học và study log. Các endpoint `exams`, `notes`, `schedule` có trong backend nhưng chưa thấy luồng CRUD tương ứng trên giao diện; kiểm thử các phần này ở mức API.

## 8. Kiểm thử tương thích và lỗi cơ bản

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| COMPAT-01 | Dùng ứng dụng trên Chrome/Edge bản hiện hành và kích thước desktop/mobile. | Các nút, form, menu, bảng lịch và nội dung sử dụng được; không mất chức năng chính. |
| ERROR-01 | Tạm dừng backend hoặc ngắt mạng khi tải/lưu dữ liệu. | Giao diện không bị treo; có thông báo lỗi; thao tác có thể thử lại sau khi kết nối phục hồi. |
| ERROR-02 | Gửi form thiếu trường bắt buộc hoặc dữ liệu vượt giới hạn. | Không lưu dữ liệu lỗi; thông báo/validation rõ ràng; không tạo bản ghi một phần. |
| PERSIST-01 | Tạo/cập nhật dữ liệu rồi tải lại trang và đăng nhập lại. | Dữ liệu backend vẫn còn; tùy chọn giao diện được lưu theo cơ chế hiện tại. |

## 9. Checklist chạy nhanh trước khi bàn giao

1. Đăng ký/đăng nhập, tải lại trang và đăng xuất.
2. Tạo dự án, task; sửa, hoàn thành, tìm kiếm và xóa dữ liệu kiểm thử.
3. Tạo môn, lịch học, bài tập; ghi một phiên tự học và đối chiếu tổng số liệu.
4. Sửa hồ sơ, thử chi hạt giống hợp lệ và không hợp lệ.
5. Kiểm tra giao diện sáng/tối, mobile, nhắc hạn và trạng thái rỗng.
6. Gọi `/health`, kiểm tra route không token, CRUD và quyền sở hữu dữ liệu qua API.
