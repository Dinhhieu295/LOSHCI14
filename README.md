# LifeOS

Ứng dụng quản lý nhịp sống cá nhân, dự án và việc học. LifeOS giúp người dùng theo dõi mục tiêu, công việc, lịch học và thói quen trong một không gian thống nhất.

## 1. Thông tin học phần Tương tác người - máy

- **Học phần:** Tương tác người - máy
- **Mã lớp:** INT2041 1
- **Giảng viên:** Ngô Thị Duyên
- **Thành viên nhóm:**

| Họ và tên | MSSV |
|---|---|
| Trần Đình Hiếu | 23021555 |
| Hồ Văn Tiến Nguyên | 23021649 |
| Bùi Quang Huy | 23021571 |
| Nguyễn Mạnh Hoàng | 24021489 |
## 2. Giới thiệu dự án

LifeOS là ứng dụng web hỗ trợ người dùng tổ chức các khía cạnh thường ngày như kế hoạch dự án, nhiệm vụ và học tập. Trang Tổng quan tóm tắt tiến độ, còn các khu vực Dự án, Học tập và Cá nhân cung cấp công cụ quản lý chi tiết. Dữ liệu được lưu ở backend và gắn với tài khoản người dùng.

## 3. Chức năng chính

- **Tài khoản:** đăng ký, đăng nhập, xác thực phiên và đăng xuất.
- **Tổng quan:** xem tiến độ dự án, GPA, chuỗi ngày và bài tập đang chờ.
- **Dự án và công việc:** quản lý hạn, tiến độ, mức ưu tiên và thời lượng thực tế. LifeOS ghi thời điểm khi đánh dấu một công việc hoàn thành.
- **Học tập:** quản lý môn học, bài tập, kỳ thi, ghi chú, tự học và gợi ý học. Mục **Phân tích GPA** tính GPA hệ 4 theo tín chỉ, có bộ lọc học kỳ và kịch bản điểm.
- **Lịch trình:** chuyển tuần, nhảy tới một ngày hoặc xem tổng quan 4 tuần. Lịch hiển thị buổi học, sự kiện cá nhân và hạn chót của việc cá nhân lẫn task dự án. Có thể đặt khung giờ rảnh, kéo thả hoặc nhờ LifeOS gợi ý và lưu phiên làm việc.
- **Công việc:** lịch **Việc làm** như đi dạy hay làm thêm tự lặp cùng thứ và giờ mỗi tuần kể từ ngày bắt đầu. **Việc cá nhân** như sinh nhật hoặc du lịch diễn ra một lần, có thể đặt giờ cụ thể hoặc đưa vào hàng đợi để xếp sau. Có thể đặt hạn chót và xem tiến độ việc dự án.
- **Thời gian tự học:** bấm giờ, tạm dừng/tiếp tục, lưu study log và xem heatmap theo tuần.
- **Cá nhân:** cập nhật hồ sơ và đổi mật khẩu.
- **Trải nghiệm giao diện:** chuyển chế độ sáng/tối, hỗ trợ menu ở màn hình di động.

## 4. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19, TypeScript, Vite, CSS, Lucide React |
| Backend/API | Node.js, Express 5, TypeScript, Zod |
| Truy cập dữ liệu | Kysely |
| Cơ sở dữ liệu | PostgreSQL 17 |
| Kiểm thử tự động | Playwright Test, Chromium |
| Đóng gói/chạy dịch vụ | Docker Compose, Nginx |

Backend dùng bearer token cho phiên đăng nhập; mật khẩu được băm bằng scrypt và token phiên chỉ được lưu dưới dạng SHA-256 hash.

## 5. Kiến trúc

Frontend gọi REST API bằng JSON. API xử lý xác thực và kiểm tra dữ liệu ở route, chuyển quy tắc nghiệp vụ tới các service, rồi truy cập PostgreSQL qua repository và Kysely.

```mermaid
flowchart LR
    Browser[React / Vite] -->|HTTP JSON, bearer token| API[Express REST API]
    API --> Routes[Routes và validation]
    Routes --> Services[Application services]
    Services --> Repositories[Repository ports]
    Repositories --> Kysely[Kysely repository]
    Kysely --> DB[(PostgreSQL)]
```

Migration database nằm trong `backend/src/database/migrations/`. Với Docker Compose, API chạy migration trước khi khởi động server.

## 6. Cấu trúc thư mục

```text
lifeOS-main/
├── backend/
│   └── src/
│       ├── application/       # Services, model và repository ports
│       ├── database/          # Kết nối, migration và seed dữ liệu demo
│       ├── infrastructure/   # Repository dùng Kysely
│       ├── middleware/        # Xác thực và xử lý lỗi
│       └── routes/            # Các REST API
├── frontend/
│   └── src/                   # React pages, API client, styles
├── test/
│   ├── lifeos.spec.ts         # Kiểm thử Playwright giao diện và API
│   └── KICH-BAN-KIEM-THU.md   # Kịch bản kiểm thử thủ công
├── docker-compose.yml
├── render.yaml
└── README.md
```

## 7. Cài đặt và chạy dự án

### Yêu cầu

- Node.js 22 trở lên và npm.
- Docker Desktop với Docker Compose.

### Chạy toàn bộ ứng dụng bằng Docker

Từ thư mục gốc dự án:

```powershell
docker compose up --build -d
```

- Frontend: <http://localhost:5173>
- API health check: <http://localhost:4000/health>
- PostgreSQL: `localhost:5432` (chỉ dùng cho phát triển cục bộ)

Kiểm tra dịch vụ:

```powershell
docker compose ps
```

### Chạy chế độ phát triển

Khởi động PostgreSQL:

```powershell
docker compose up -d db
```

Trong terminal backend:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

Trong terminal frontend:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend chạy ở `http://localhost:5173` và Vite proxy `/api` tới backend ở cổng `4000`.

### Tài khoản demo

Sau khi migration database, có thể tạo dữ liệu demo:

```powershell
cd backend
npm run db:seed:demo
```

- Email: `uet-demo@lifeos.local`
- Mật khẩu: `UETLifeOS123!`

## 8. Kiểm thử và kết quả

Bộ test Playwright nằm tại `test/lifeos.spec.ts` và `test/manual-scenarios.spec.ts`. Bộ test bao gồm kiểm thử giao diện, điều hướng mobile, API, phân tích GPA, giờ trống, phản hồi gợi ý và thời điểm hoàn thành công việc. Sau khi ứng dụng và PostgreSQL hoạt động, từ thư mục gốc chạy:

```powershell
npm.cmd install
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'lifeos-playwright-browsers'
npm.cmd exec -- playwright test test/lifeos.spec.ts test/manual-scenarios.spec.ts --reporter=list
```

Nếu Chromium chưa được cài trong thư mục trên, cài bằng:

```powershell
npm.cmd exec -- playwright install chromium
```
