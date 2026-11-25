# Self-hosting GoDeeper

The community edition can run independently. You need Node.js 20+, npm and a Postgres database with Supabase Auth.

## 1. Database and Auth

### Option A: local Supabase

```bash
npx supabase start
```

Use the printed API URL, publishable key and service-role key. The local database port is `54322` by default.

### Option B: hosted Supabase

Create a project, then use the project's Postgres connection string, API URL, publishable key and service-role key.

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_SECRET_KEY` | Service-role key, server-only |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting user API keys |
| `ADMIN_EMAILS` | Comma-separated admin emails |
| `CORS_ORIGINS` | Frontend origin(s), comma-separated |

Optional: `HOSTED_AI_*` for hosted AI, `JEV_*` for question-depth evaluation, `OXR_*` for note OCR.

Run migrations and seed the plan rows:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

`GET /health` should return `edition: "stub"` for the community edition.

## 3. Frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local
```

Fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |
| `NEXT_PUBLIC_ADMIN_EMAILS` | Optional admin email list |

```bash
npm run dev
```

Open `http://localhost:3000`.

## 4. Production build

```bash
cd backend
npm run build
npm start

cd ../frontend
npm run build
npm start
```

Put both services behind HTTPS. Set `CORS_ORIGINS` to the public frontend origin. Do not expose the backend service-role key or `ENCRYPTION_KEY` to the browser.

## 5. Security checklist

- `.env` and `.env.local` are never committed.
- `SUPABASE_SECRET_KEY` only exists on the server.
- `ENCRYPTION_KEY` is backed up; losing it makes stored user API keys unreadable.
- Database backups are enabled and tested.
- Admin emails are explicitly listed; there is no default admin password.
- Run a secret scan before every deployment.

## 6. Known limitations

- Payments and subscriptions are not implemented in the community edition.
- The admin settings page is intentionally minimal; some operational settings are read-only.
- Multi-canvas, trash restore, cross-canvas search, concept cards, Socratic questioning, guided exploration, AI-organized reports, PDF export and team collaboration are Pro features and are not included here.

## Updating

Pull the latest `main`, run `npm install` in both apps, apply new migrations with `npm run db:migrate`, then rebuild. Review `CHANGELOG.md` for user-visible changes.
