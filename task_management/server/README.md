# Task Management Server

Node.js + Express 5 + TypeScript + MongoDB (Mongoose) API, structured after
[Node-Starter-Template](https://github.com/adwaithrrajesh/Node-Starter-Template).

## Quick start

```bash
npm install
cp .env.example .env      # then edit secrets / Mongo URI
npm run dev               # nodemon + ts-node, http://localhost:8080
```

| Script               | What it does                               |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Dev server with reload (`src/server.ts`)    |
| `npm run build`      | Compile to `dist/` and rewrite path aliases |
| `npm start`          | Run the compiled build (production)         |
| `npm run typecheck`  | Type-check without emitting                 |

- Health check: `GET /ping`
- Swagger UI (non-production): `http://localhost:8080/api-docs`

## Folder structure

```
src/
├── server.ts                      # process entry: connect DB, listen, graceful shutdown
├── app.ts                         # builds the Express app: security → parsers → docs → /api → errors
├── (modules/index.ts)             # root module registry: the ONLY list of modules
├── config/
│   ├── env.ts                     # loads + validates every env variable (use `env`, not process.env)
│   ├── db.ts                      # mongoose connect / disconnect
│   └── swagger.ts                 # OpenAPI spec (reads @openapi comments in routes)
├── middleware/
│   ├── auth.middleware.ts         # JWT guard → req.user
│   ├── bruteforce.middleware.ts   # login attempt limiter
│   ├── rate-limit.middleware.ts   # global rate limiter
│   ├── response.middleware.ts     # res.success() / res.error()
│   └── error.middleware.ts        # not-found + central error handler
├── utils/
│   ├── base.route.ts              # BaseRoute, asyncHandler, ApiRoute type
│   ├── errors.ts, status-code.ts  # error classes + status codes
│   └── logger.ts, validator.ts, jwt.ts, password.ts
└── modules/
    ├── user/                      # auth module
    └── task/                      # task module
        ├── index.ts               # public surface: exports `taskRoutes: ApiRoute[]`
        ├── ajv-schema/            # request validation schemas
        ├── controllers/           # HTTP in/out only
        ├── entities/              # TS interfaces / DTOs
        ├── models/                # mongoose schema + model
        ├── repositories/          # all DB access
        ├── routes/                # router class + swagger docs
        └── services/              # business logic + validation
```

Request flow: **route → controller → service (validate + rules) → repository → model**.
Throw an error class from `@utils/errors` anywhere; the error middleware turns it into
`{ success: false, message, data: null }` with the right status code.

Path aliases: `@config/*`, `@middleware/*`, `@modules/*`, `@utils/*`.

## API

All responses have the shape `{ success, message, data }`.

### Auth: `/api/user/auth`

| Method | Path             | Auth   | Body                          |
| ------ | ---------------- | ------ | ----------------------------- |
| POST   | `/register`      | none   | `name, email, password`       |
| POST   | `/login`         | none   | `email, password`             |
| POST   | `/refresh-token` | none   | `refreshToken` (or cookie)    |
| POST   | `/logout`        | none   | none                          |
| GET    | `/me`            | Bearer | none                          |

### Tasks: `/api/tasks` (all require `Authorization: Bearer <accessToken>`)

| Method | Path     | Description                                                                     |
| ------ | -------- | ------------------------------------------------------------------------------- |
| POST   | `/`      | Create. `title` required; `description, status, priority, dueDate, tags` optional |
| GET    | `/`      | List. Query: `status, priority, search, page, limit, sortBy, order`              |
| GET    | `/stats` | Counts by status                                                                |
| GET    | `/:id`   | Get one                                                                         |
| PATCH  | `/:id`   | Partial update                                                                  |
| DELETE | `/:id`   | Delete                                                                          |

`status`: `todo | in_progress | done`, `priority`: `low | medium | high`.
Users only ever see and change their own tasks.

## Adding a new module

1. Copy `src/modules/task/` to `src/modules/<name>/` and rename the files.
2. Export its routes from `src/modules/<name>/index.ts`:
   `export const <name>Routes: ApiRoute[] = [{ path: "/<name>", router: new <Name>Router().router }];`
3. Add `...<name>Routes` to the list in `src/modules/index.ts`. `app.ts` does not change.
