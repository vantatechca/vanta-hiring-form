# Hiring Form

Internal candidate intake form. Node.js + Express + PostgreSQL.

## Stack
- **Frontend** — Vanilla HTML/CSS/JS (no framework, no build step)
- **Backend** — Express.js
- **Database** — PostgreSQL (via `pg`)
- **File storage** — ID images stored as base64 in the DB (no external storage needed)

## Local Development

```bash
cp .env.example .env
# Edit .env with your local Postgres credentials

npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Render

### Option A — Render Blueprint (one click)
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your repo — Render reads `render.yaml` and creates:
   - A **Web Service** running the Node app
   - A **PostgreSQL database** (free tier)
4. Done. `DATABASE_URL` is wired automatically.

### Option B — Manual
1. Create a **PostgreSQL** database on Render, copy the connection string
2. Create a **Web Service** → connect your repo
   - Build: `npm install`
   - Start: `npm start`
3. Add env var: `DATABASE_URL` = your Postgres connection string
4. Add env var: `NODE_ENV` = `production`

The `initDB()` call in `server.js` creates the table on first boot automatically.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/apply` | Submit application (multipart/form-data) |
| `GET`  | `/api/applicants` | List all applicants (no images) |
| `GET`  | `/api/applicants/:id` | Get single applicant with ID image |
| `PATCH`| `/api/applicants/:id/status` | Update status (new/reviewed/hired/rejected) |

## Database Schema

```sql
id               SERIAL PRIMARY KEY
submitted_at     TIMESTAMPTZ
full_name        TEXT
phone            TEXT
date_of_birth    DATE
marital_status   TEXT
id_image_data    TEXT  -- base64 encoded
id_image_type    TEXT  -- MIME type
nda_agreed       BOOLEAN
avail_weekends   BOOLEAN
avail_evenings   BOOLEAN
on_call          BOOLEAN
has_license      BOOLEAN
startup_ok       BOOLEAN
has_second_job   BOOLEAN
second_job_details TEXT
other_commitments  TEXT
status           TEXT  -- new / reviewed / hired / rejected
```
