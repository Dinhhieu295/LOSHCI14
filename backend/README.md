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

Compose builds the API image, applies database migrations before starting the server, and persists SQLite data in the `lifeos-data` volume. Check status with `docker compose ps` and stop the service with `docker compose down` (the named data volume remains intact).

## Database

SQLite is the default. `DATABASE_URL=file:./data/lifeos.sqlite` creates a local database under `backend/data/` with foreign keys and WAL enabled.

## Architecture

The request flow is `routes (API) â†’ application/services (business rules) â†’ application/ports â†’ infrastructure/repositories â†’ database`.

- `src/routes/` owns HTTP parsing, validation, status codes, and response shapes.
- `src/application/` contains business services, models, errors, and repository interfaces. It has no Express or database-library imports.
- `src/infrastructure/repositories/` implements the repository interfaces with Kysely and maps database rows to application models.
- `src/database/` configures the Kysely dialect and contains portable schema migrations.

The schema and migration use portable Kysely schema builders. To switch to PostgreSQL later:

1. Provision a PostgreSQL database and set `DATABASE_PROVIDER=postgres`.
2. Set `DATABASE_URL` to its connection string.
3. Run `npm run db:migrate` against that database.
4. Copy data from SQLite with a one-time export/import or a dedicated migration script.

The same schema migration is generated for either dialect. The data still needs to be copied between database files/servers; changing the connection string alone does not move it.

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

Copy `.env.example` to `.env`. For deployment, set a restrictive `CORS_ORIGIN`, use a PostgreSQL connection URL if needed, and keep `.env` and database files out of version control.

