# Architecture

GoDeeper is a spatial thinking canvas: users create notes, questions, sources and results on a graph, then run AI on a selected branch.

## Stack

- Frontend: Next.js 16, React 19, React Flow, Zustand, TanStack Query
- Backend: Hono, Zod, Drizzle ORM, Postgres (Supabase)
- AI: Vercel AI SDK with BYOK providers

## Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/` | Next.js app: canvas, panels, search, export, admin |
| `backend/` | Hono API: auth, canvas, nodes, tasks, AI, import, share, comments, admin |
| `packages/pro-contract/` | Public types and capability IDs for the Pro plugin |
| `packages/pro-stub/` | Empty Pro implementation used by the community edition |
| `supabase/` | Local Supabase config and database migrations |
| `docs/` | Public architecture, self-hosting and edition docs |

## Request flow

1. The frontend authenticates with Supabase and sends the access token to the API.
2. `authMiddleware` resolves the user and membership.
3. Capability checks decide whether a route runs, degrades to a free preview, or returns `403 CAPABILITY_REQUIRED`.
4. AI routes reserve credits, call the model layer, then complete or refund the reservation.
5. Canvas and node writes are scoped by user and canvas ownership checks.

## Capability layer

`backend/src/lib/capabilities.ts` is the single source for the plan matrix. The free plan has `canvas.cloud`. Pro adds multi-canvas, restore, cross-canvas search and mentions, concept cards, Socratic questioning, guided exploration, AI-organized reports and PDF export. Team adds collaboration.

The frontend reads the server-provided capability list from `/auth/me` and uses `hasCapability()` instead of scattered membership checks.

## Pro plugin boundary

The community edition ships `packages/pro-stub`, which keeps the Pro route shapes but returns `403`. A commercial build replaces the same package name with a private implementation and fills two public UI slots (trash and cross-canvas search results).

Rules:

- Core must not import private Pro code.
- Private Pro code depends on the public contract, not the other way around.
- Shared behavior (ownership checks, mention truncation, trash retention) lives in the public core so a fix does not need to be repeated in two repositories.

## Data model

The core tables are `users`, `canvases`, `nodes`, `task_runs`, `plans`, `credit_transactions`, `canvas_shares`, `comments` and `prompt_templates`. Canvases use soft deletion (`deleted_at`); the free plan allows one active cloud canvas.

## AI and keys

Users can bring their own provider key. Keys are encrypted before storage and are never returned to the browser. The optional hosted AI path is configured by the operator and consumes credits; BYOK calls do not consume GoDeeper credits.
