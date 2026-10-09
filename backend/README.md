# LifeOS Backend

An independent TypeScript API for the LifeOS React/Vite frontend. It owns authentication, user data, and persistence.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

The API listens on `http://127.0.0.1:4000`. `GET /health` reports service and database status.

## Run with Docker

From the repository root:

```powershell
docker compose up --build -d
```

Compose starts PostgreSQL and the API, applies database migrations before starting the server, and persists PostgreSQL data in the `lifeos-postgres-data` volume. Check status with `docker compose ps` and stop the service with `docker compose down` (the named data volume remains intact).

## Database

The backend requires PostgreSQL. For local development, `DATABASE_URL` in `.env.example` connects to `127.0.0.1:5432`; start the database from the repository root with `docker compose up -d db`. Set `DATABASE_URL` to the PostgreSQL connection string in the deployment environment.

For Render, the repository-root `render.yaml` provisions PostgreSQL, the API, and the frontend; it wires their URLs and runs `npm run db:migrate:prod` before starting the API. The Blueprint uses Render's free Postgres plan, which expires after 30 days. A newly provisioned database starts empty.

## Demo data

To create a local demo account with two projects and ten tasks, run after migrations:

```powershell
npm run db:seed:demo
```

Sign in with `demo@lifeos.local` / `LifeOS123!`. The script is safe to run again: it adds only missing demo projects and tasks. Task records are available from `GET /api/projects/:projectId/tasks` with the demo account's bearer token.

## Architecture

The request flow is `routes (API) â†’ application/services (business rules) â†’ application/ports â†’ infrastructure/repositories â†’ database`.

- `src/routes/` owns HTTP parsing, validation, status codes, and response shapes.
- `src/application/` contains business services, models, errors, and repository interfaces. It has no Express or database-library imports.
- `src/infrastructure/repositories/` implements the repository interfaces with Kysely and maps database rows to application models.
- `src/database/` configures the Kysely dialect and contains portable schema migrations.

The schema and migrations use Kysely with the PostgreSQL dialect.

## Authentication

Register and login return a random bearer token. Only a SHA-256 hash of the token is stored in the database. Passwords are hashed with Node's scrypt implementation. Send `Authorization: Bearer <token>` to protected routes; logout revokes the current session.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET/PATCH /api/profile`, `PUT /api/profile/password`
- `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:projectId`
- `GET/POST /api/projects/:projectId/tasks`, `PATCH/DELETE /api/projects/:projectId/tasks/:taskId`
- `GET /api/study/summary?semester=...`
- CRUD at `/api/study/courses`, `/assignments`, `/exams`, `/notes`, and `/schedule`
- `GET/PUT /api/personal/state`, `POST /api/personal/coins/spend`

All user-owned routes filter records by the authenticated user. Study resources accept `courseId`; it must refer to a course owned by that same user.

## Environment

Copy `.env.example` to `.env`. Start local PostgreSQL with Docker Compose. For deployment, set a restrictive `CORS_ORIGIN` and the PostgreSQL connection URL, and keep `.env` out of version control.

