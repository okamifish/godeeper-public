# Community edition vs Pro

This repository is the **community edition**: the open core, licensed under MIT. It is independently buildable and runnable.

## What is included

- Canvas engine, nodes, edges, groups and comments
- Tasks, context and BYOK AI (task reasoning, source analysis, expand, inspire, critique)
- Markdown and HTML structured reports
- Publishing and comments
- One active cloud canvas
- Account, plan and basic admin surfaces

## What is not included

These are Pro features, implemented in a separate private plugin:

- Multiple cloud canvases and version history
- Trash restore
- Cross-canvas search and mentions
- Concept cards
- Socratic questioning
- Guided exploration
- AI-organized reports
- PDF export
- Team collaboration
- Subscription, billing and hosted AI quota

## Boundary

The public contract lives in `packages/pro-contract`. The community edition ships `packages/pro-stub`, which keeps the Pro route shapes but returns `403 CAPABILITY_REQUIRED`.

A commercial build replaces the same backend package and fills two public UI slots. The core never imports private Pro code. Shared behavior stays in the core so a fix does not need to be repeated in two repositories.

## Free plan

The free plan has one capability: `canvas.cloud`. Pro adds the features listed above; Team adds collaboration. The server is the source of truth for capabilities, exposed through `/auth/me` and `/auth/me/capabilities`.
