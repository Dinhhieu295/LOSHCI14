# LifeOS

LifeOS gồm frontend React/Vite trong `frontend/` và API TypeScript trong `backend/`.

Chạy toàn bộ ứng dụng bằng Docker Compose:

```powershell
docker compose up --build -d
```

Frontend mở tại `http://localhost:5173`; API ở `http://localhost:4000`. Dữ liệu SQLite được lưu trong volume `lifeos-data`.

## Chạy phát triển

Mở hai terminal:

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
