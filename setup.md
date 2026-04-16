# SETUP.md — Project Setup

Run these in order. Each step assumes the previous succeeded. Stop and surface any error before continuing.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x LTS or newer | https://nodejs.org or `brew install node` |
| pnpm | 9.x | `npm i -g pnpm` |
| Git | any modern | already installed on macOS/Linux |
| PocketBase | latest stable | https://pocketbase.io/docs/ — single binary |
| Caddy (later) | 2.x | `brew install caddy` (only when deploying) |

---

## 1. Create the repo

```bash
mkdir trip-app && cd trip-app
git init
git branch -m main
```

---

## 2. Scaffold SvelteKit

```bash
pnpm create svelte@latest .
```

Choices:
- Skeleton project
- TypeScript: Yes
- ESLint: Yes
- Prettier: Yes
- Playwright: Yes
- Vitest: Yes
- Svelte 5 (latest): Yes

```bash
pnpm install
```

---

## 3. Add Tailwind

```bash
pnpm dlx svelte-add@latest tailwindcss
pnpm install
```

---

## 4. Add core deps

```bash
pnpm add pocketbase
pnpm add -D @types/node
```

Component primitives — pick one, install later when starting M1 UI:
- `pnpm add bits-ui` (recommended, shadcn-svelte's primitives)
- or `pnpm add @melt-ui/svelte`

---

## 5. Set up PocketBase

```bash
mkdir -p backend && cd backend
# Download the binary for your platform from https://github.com/pocketbase/pocketbase/releases
# Example for macOS arm64:
curl -L -o pocketbase.zip https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_*_darwin_arm64.zip
unzip pocketbase.zip
rm pocketbase.zip
cd ..
```

First run:
```bash
cd backend
./pocketbase serve
```

Open http://127.0.0.1:8090/_/ — create the admin account. Stop the server (Ctrl-C). Initial collections will be created via migrations.

---

## 6. Project structure

```
trip-app/
├── src/
│   ├── lib/
│   │   ├── components/    # shared components
│   │   ├── stores/        # svelte stores
│   │   ├── pb.ts          # PocketBase client singleton
│   │   ├── types.ts       # shared TS types
│   │   └── utils/
│   ├── routes/            # SvelteKit routes
│   └── app.html
├── backend/
│   ├── pocketbase         # binary
│   ├── pb_data/           # gitignored
│   ├── pb_migrations/     # JS migrations, checked in
│   └── pb_hooks/          # JS hooks, checked in
├── deploy/                # Caddyfile, systemd unit, backup script (later)
├── static/
│   ├── manifest.webmanifest
│   └── icons/
├── SPEC.md
├── CLAUDE.md
├── SETUP.md
├── README.md
├── .env.example
└── .gitignore
```

---

## 7. .gitignore essentials

```
node_modules
.svelte-kit
build
dist
.env
.env.local
backend/pb_data
backend/pocketbase
*.log
.DS_Store
```

---

## 8. .env.example

```
PUBLIC_PB_URL=http://127.0.0.1:8090
GOOGLE_MAPS_API_KEY=
AERODATABOX_API_KEY=
RESEND_API_KEY=
```

Real values go in `.env.local`. Never commit them.

---

## 9. Run dev environment

Two terminals:

**Terminal 1 — backend:**
```bash
cd backend && ./pocketbase serve
```

**Terminal 2 — frontend:**
```bash
pnpm dev
```

Open http://localhost:5173.

---

## 10. First commit

```bash
git add .
git commit -m "scaffold: sveltekit + tailwind + pocketbase"
```

Set up a remote (GitHub, your choice public/private) and push.

---

## 11. M1 starting points

- Create first migration in `backend/pb_migrations/` for the `users`, `trips`, `trip_members`, `phases`, `days`, `items` collections per SPEC.md §4
- Build PocketBase client wrapper at `src/lib/pb.ts`
- Build auth flow (`/login` route + email/code form)
- Build trips list (`/` route)
- Build trip detail (`/trips/[slug]` route)

Refer to `SPEC.md` §6 M1 for the full feature checklist and acceptance criteria.

---

## Production deployment (deferred to M4)

When you're ready:
1. Provision server (home box or Hetzner CX22)
2. Install Caddy + systemd unit for PocketBase
3. Point DNS for `trips.scottvandenwarsen.com` to server IP
4. Caddyfile reverse-proxies `/` to SvelteKit (Node adapter), `/api/` to PocketBase
5. Set up nightly backup cron
6. Deploy via `git pull && pnpm build && systemctl restart`

Full deployment docs go in `deploy/README.md` when you get there.
