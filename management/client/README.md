# Task Management — client

React 19 + Vite + TypeScript + Tailwind CSS 4, TanStack Query, React Hook Form + Zod.

## Run

```bash
npm install
npm run dev        # real API at http://localhost:8080/api (app on http://localhost:5173)
npm run dev:mock   # demo mode on http://localhost:5174: in-browser mock data, nothing saved
npm run check      # lint + prettier + type check + build
```

`npm run dev` needs the server running (`npm run dev` in `server/`) and MongoDB. The browser
calls the server directly, so `http://localhost:5173` must be in the server's
`CORS_WHITELIST`. Set `VITE_API_URL` in `client/.env` if the server is not on port 8080.

Demo sign-in (`npm run dev:mock` only): `amal@lahara.dev` (org admin), `aisawarya@lahara.dev` (project manager) or
`shahanas@lahara.dev` (member), password `demo123`.

## Structure

Same layering as the LaharaHRMS client: `pages -> features -> shared`.

```
src/
  app/          router, providers, layout (sidebar, quick search), route guards
  pages/        one file per screen; composes features
  features/     a folder per domain, imported only through its index.ts
    auth/       login, current user, role abilities
    people/     members, teams, organisation settings
    projects/   projects, progress chart, sprints
    workItems/  list, board, pickers, detail, comments, create dialog
    ai/         AI command API, speech-to-text recorder
    notifications/  inbox
    dashboard/  role-based dashboard data and charts
  shared/       ui kit, hooks, api client, constants, types (no feature imports)
  mocks/        demo API (axios adapter) with the same paths and shapes as the server
```

Each feature has `api/` (HTTP calls), `queries/` (TanStack Query hooks), `components/` and an `index.ts`.

## API contract (base `/api`, responses `{ success, message, data }`)

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Organisation | `GET/PATCH /organization` |
| Users | `GET /users`, `POST /users/invite`, `PATCH /users/:id`, `PATCH /users/:id/status` |
| Teams | `GET /teams`, `POST /teams` |
| Projects | `GET/POST /projects`, `GET/PATCH /projects/:id`, `POST /projects/:id/favorite`, `GET /projects/:id/progress` |
| Sprints | `GET /sprints?projectId`, `POST /sprints`, `POST /sprints/:id/start`, `POST /sprints/:id/complete` |
| Work items | `GET/POST /work-items`, `GET/PATCH/DELETE /work-items/:id`, `POST /work-items/reorder`, `POST /work-items/:id/time-logs` |
| Collaboration | `GET/POST /work-items/:id/comments`, `PATCH/DELETE /comments/:id`, `GET /work-items/:id/activity`, `GET/POST /work-items/:id/attachments` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| Dashboard | `GET /dashboard` |
| AI | `POST /ai/commands` → preview, `POST /ai/suggestions/:id/approve` → creates the item, `POST /ai/suggestions/:id/reject` |

AI rule: the AI suggests, Node.js checks and saves, a person approves. `POST /ai/commands` never
creates anything; the item is created only on approve, with the user's edits.

When an endpoint changes, update its handler in `src/mocks/handlers`.

## Shortcuts

`C` new work item · `Ctrl+K` search · `Ctrl+Enter` continue in the AI dialog and comments.
