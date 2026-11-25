# GoDeeper

GoDeeper is an AI-assisted spatial thinking canvas. You build a graph of notes, questions, sources and results, and use AI to deepen one branch at a time instead of generating a wall of text.

This repository is the **community edition**: the open core. It contains the canvas engine, tasks and context, BYOK AI, Markdown/HTML reports, publishing and comments, one cloud canvas, and the basic admin surface.

The commercial Pro edition is assembled from this core plus a private plugin. Pro-only features (multi-canvas, trash restore, cross-canvas search and mentions, concept cards, Socratic questioning, guided exploration, AI-organized reports, PDF export, team collaboration) are **not** part of this repository. The public `packages/pro-contract` and `packages/pro-stub` define the interface and the empty implementation.

## Stack

- Frontend: Next.js 16, React 19, React Flow, Zustand, TanStack Query
- Backend: Hono, Zod, Drizzle ORM, Postgres (Supabase)
- AI: Vercel AI SDK with BYOK providers

## Quick start

### 1. Prerequisites

- Node.js 20+
- npm
- Docker (for local Supabase) or a hosted Postgres/Supabase project

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# fill DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, ENCRYPTION_KEY
npm run db:migrate
npm run dev
```

The API runs on `http://localhost:3001`. `GET /health` returns `edition: "stub"` for the community edition.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Open `http://localhost:3000`.

### 4. Local Supabase (optional)

```bash
npx supabase start
```

Use the printed local URL and keys in the two env files. The local database port is `54322` by default.

## Tests

```bash
cd backend
npx tsc --noEmit
npm test

cd ../frontend
npx tsc --noEmit
npm run test:run
npx next build
```

## Security

- Never commit `.env`, `.env.local`, API keys, database passwords or service-role keys.
- AI keys are stored encrypted per user; BYOK means the provider bills the user directly.
- If you find a security issue, please open a private advisory instead of a public issue.

## License

MIT. See [LICENSE](./LICENSE).
