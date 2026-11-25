# Contributing to GoDeeper

Thanks for taking the time to contribute. This repository is the community edition (the open core). The commercial Pro edition lives in a separate private repository and is not part of this codebase.

## Before you start

- For bugs and feature ideas, open an issue first.
- For security issues, do **not** open a public issue. Follow [SECURITY.md](./SECURITY.md).
- By contributing, you agree that your contribution is licensed under the MIT license.

## Development setup

Requirements: Node.js 20+ and npm. A local Supabase instance or a Postgres/Supabase project is needed for the full backend test suite.

```bash
# backend
cd backend
npm install
cp .env.example .env
# fill DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, ENCRYPTION_KEY
npm run db:migrate
npm run dev

# frontend (another terminal)
cd frontend
npm install
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

On Windows you can also run:

```powershell
powershell -File scripts\dev.ps1
```

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

The CI workflow runs the backend unit and contract tests that do not need a database, plus the frontend typecheck, tests and production build. Integration tests and `prompt-resolver` need a real database and should be run locally.

## Pull requests

- Keep changes focused. One topic per pull request.
- Add or update tests when behavior changes.
- Do not commit `.env`, API keys, database passwords, service-role keys or personal data.
- Update documentation when you change setup, configuration or user-facing behavior.
- Describe **why** the change is needed, not only what files changed.

## Code style

- TypeScript and React; keep existing patterns and naming.
- No parallel implementations of existing helpers, hooks or API clients.
- Keep the core free of dependencies on the private Pro repository.

## The community / Pro boundary

This repository must stay independently buildable and runnable. It may define interfaces in `packages/pro-contract` and an empty implementation in `packages/pro-stub`, but it must not import private Pro code or ship Pro prompts, billing logic or Pro-only UI.

## License

MIT. See [LICENSE](./LICENSE).
