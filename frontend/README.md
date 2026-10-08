# LifeOS Frontend

React and Vite client for the LifeOS API. Authentication, projects, study data, and personal state are loaded from the backend; the browser only keeps the current bearer token.

## Local development

Start the backend first on port `4000`, then run:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/health` to `VITE_API_PROXY` (default `http://127.0.0.1:4000`).

## Production build

```powershell
npm run build
```

The Docker image serves the built static files through Nginx and proxies API requests to the `api` service in Docker Compose.
