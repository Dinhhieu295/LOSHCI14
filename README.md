# LifeOS

LifeOS gồm frontend React/Vite trong `frontend/` và API TypeScript trong `backend/`.

Chạy toàn bộ ứng dụng bằng Docker Compose:

```powershell
docker compose up --build -d
```

Frontend mở tại `http://localhost:5173`; API ở `http://localhost:4000`. PostgreSQL chạy trong Docker và dữ liệu được giữ trong volume `lifeos-postgres-data`.

## Chạy phát triển

Khởi động PostgreSQL cục bộ bằng Docker Compose:

```powershell
docker compose up -d db
```

Sau đó mở hai terminal:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend chạy ở `http://localhost:5173` và proxy `/api` tới backend trên cổng `4000`.

## Triển khai database trên Render

Ứng dụng chỉ dùng PostgreSQL. File `render.yaml` tạo Render PostgreSQL và API, nối API bằng connection string nội bộ, rồi chạy migration trước khi khởi động API.

1. Đẩy repository lên GitHub/GitLab rồi tạo **Blueprint** mới trong Render từ repository đó.
2. Blueprint sẽ tạo PostgreSQL, API và frontend; các URL API/CORS được nối tự động.
3. Mở URL API `/health`; phản hồi cần có `"status":"ok"` và `"database":"postgres"`.

Blueprint chọn gói miễn phí để tránh phát sinh phí. Render PostgreSQL miễn phí hết hạn sau 30 ngày và có thể bị xóa sau thời gian gia hạn; nâng cấp database nếu cần giữ dữ liệu lâu dài. Database mới bắt đầu trống; dữ liệu cũ không được chuyển sang Render.
