# DELIO.md — The Eggcountant — Project Handover
_Last updated: 2026-03-26 by Delio_

---

## What It Is

**The Eggcountant** is a mobile-first PWA-style web app for backyard chicken keepers to track egg collection, chick hatching, sales, feed costs, and medications. It has a distinctive violet + amber design system with egg-themed UI (rounded cards, custom icons, playful copy).

Think: "Hostinger-native, React frontend, PHP backend, JSON-file storage." No database required — it's dead simple to host.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Charts | Recharts |
| Animation | Framer Motion / Motion |
| Icons | Lucide React |
| Dates | date-fns |
| Backend | Plain PHP (no framework) |
| Storage | JSON files in `data/` directory |
| Auth | PHP sessions + simple email/password |
| Deployment | Hostinger shared hosting |

---

## Directory Structure

```
the-eggcountant/
├── src/
│   ├── App.tsx          # Entire frontend — single-file React app
│   ├── api.ts           # Typed fetch wrapper for all PHP endpoints
│   ├── types.ts         # All TypeScript types (Location, EggLog, Hen, etc.)
│   ├── constants.ts     # CHICKEN_FACTS + CHICKEN_WIKI content arrays
│   ├── index.css        # Global CSS (egg-fab shape, app-shell layout)
│   └── main.tsx         # React entry point
├── api/
│   ├── bootstrap.php    # Shared session/config init
│   ├── config.php       # DB/storage config (gitignored — see config.php.example)
│   ├── config.php.example
│   ├── data.php         # CRUD: GET/POST/DELETE for all collections
│   ├── login.php        # POST → starts PHP session
│   ├── logout.php       # POST → destroys session
│   ├── register.php     # POST → creates user JSON file
│   ├── session.php      # GET → returns current user or null
│   └── import_legacy_json.php  # One-off migration helper
├── data/
│   ├── .htaccess        # Blocks direct web access
│   └── .gitignore       # Keeps user data out of git
├── media/               # All image assets (logo, egg icons, hen avatars)
│   ├── eggcountant-logo.png
│   ├── 1-egg.png, 2-eggs.png, 3-eggs.png
│   ├── 1-egg-cup.png, 1-fried.png, 1-hatching.png
│   └── Layer 2–9.png    # Demo hen avatars
├── dist/                # Built frontend (committed for easy Hostinger deploy)
├── public/              # favicon.png
├── .htaccess            # SPA routing + API passthrough
├── index.html           # Vite entry
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Data Model (types.ts)

All data is persisted per-user as JSON files in `data/users/<user-id>/<collection>.json`.

| Type | Key fields |
|---|---|
| `Location` | id, name, type (Garden/Allotment/Other), photoUrl? |
| `EggLog` | id, date, count, locationId, mode (produce/breed), coopTemperature?, notes? |
| `Hen` | id, name, locationId, status (HenAppearance), photoUrl?, notes? |
| `FeedLog` | id, date, amount, cost?, weight?, feedType?, locationId, notes? |
| `MedicationLog` | id, date, henId?, locationId, medicationName, dosage, notes? |
| `SaleLog` | id, date, quantity, price, itemType (eggs/chicks/chickens), notes? |
| `ChickBatch` | id, dateStarted, expectedHatchDate, count, status, locationId, hatchedCount?, perishedCount?, temperature?, notes? |

---

## API (api.ts)

Base URL: `./api` in production, `http://localhost:8000/api` in dev.

| Endpoint | Method | Purpose |
|---|---|---|
| `/session.php` | GET | Returns `{ user }` or `{ user: null }` |
| `/register.php` | POST | `{ email, password, nickname }` → creates user |
| `/login.php` | POST | `{ email, password }` → PHP session |
| `/logout.php` | POST | Destroys session |
| `/data.php?collection=X` | GET | Returns `{ items: [...] }` for collection |
| `/data.php?collection=X` | POST | `{ item }` → upsert by id |
| `/data.php?collection=X&id=Y` | DELETE | Removes item from collection |

---

## Frontend Architecture (App.tsx)

Single-file React app. All components live in `App.tsx`. Key structure:

- **`App()`** — root: handles auth state, loads all data, renders tabs
- **`Dashboard`** — stat cards, 14-day chart, calendar, coop leaderboard, wiki entry
- **`CalendarCard`** — filterable calendar (eggs/chicks/sales/feed), 7/14/month ranges
- **`ChicksPage`** — lists ChickBatch cards with hatch progress bars
- **`SettingsPage`** — tabbed (Birds / Coops / Feed+Meds), plus logout
- **`SalesTracker`** — log and list sales
- **`ChickenWiki`** — facts, puns, wiki article links
- **`LogSheet`** — bottom sheet: log eggs (produce or breed mode)
- **`LogSplash`** — fullscreen success splash after logging

### Notable UI patterns
- **Egg FAB** — fixed bottom-centre egg-shaped button (CSS clip-path: `egg-fab`)
- **NoteModal** — 100-word-limit note modal used across forms
- **Stepper** — slider + ±1 buttons for numeric inputs
- **InlineSuccessSplash** — overlays the parent card briefly after save
- **Demo mode** — when hens list is empty, shows 8 fake hens with pun names
- **DateButton** — native date picker hidden behind a styled button

### State
- All app data in single `AppState` object, loaded on login via `Promise.all`
- `upsert` / `remove` helpers update both API and local state atomically
- `saveMessage` toast, `splash` fullscreen animation, `logSheetOpen` bottom sheet

---

## Deployment (Hostinger)

**What goes on the server:**
- `dist/` contents → web root
- `api/` → web root `/api/`
- `data/` → web root `/data/`
- `.htaccess` → web root
- `config.php` → `api/config.php` (not in git — copy from `.example` and fill in)

**Dev:**
```bash
cd projects/web/the-eggcountant
npm run dev           # Vite on :3000
# Separately run PHP dev server on :8000 for api/ endpoints
npm run build         # Output to dist/
```

---

## Git Status (as of 2026-03-26)

Recent commits:
- `28f75cc` Raise floating egg action button
- `bec4797` Add hatch outcome icons
- `4d4b8d3` fix: ensure temp columns persist and raise egg FAB
- `65a7926` Tidy wiki header and coop totals card
- `42e34e9` fix: map remaining MySQL fields and add note modal

Backup also exists at: `projects/web/the-eggcountant-backup-20260325-214118`

---

## Where Things Were Left (2026-03-25)

The last session involved heavy UI polish. Completed work:
- Media-driven logo/header (image, not text)
- Redesigned home tiles matching provided mockup
- Nav/FAB positioning tweaks (egg button raised)
- Chick batch progress bars with hatch icons
- Coop totals card ("It's not a competition")
- Sales/settings flow polish
- Success splash screens (LogSplash + InlineSuccessSplash)
- NoteModal (100-word limit, word counter)
- FeedAndMedTracker fully connected

**Known state:** App was in a working state with the latest visual pass committed and pushed. No outstanding bugs were noted, though the wiki header and coop card had been tidied as a final pass.

---

## Potential Next Steps

- [ ] Live Hostinger deployment / test on real PHP host
- [ ] Photo upload via camera on mobile (currently stores base64 in JSON — may hit file size limits)
- [ ] Egg collection reminders / streak tracking
- [ ] Export data (CSV download of logs)
- [ ] Multi-user support beyond simple per-user JSON files
- [ ] Push notifications for hatch countdown
- [ ] Dark mode

---

## Notes for Next Session

- Read this file first, then `src/App.tsx` (it's one big file — Ctrl+F your way around)
- `api/config.php` is gitignored — check it exists on the server before testing auth
- `data/` directory must be writable by PHP on the server
- The `.htaccess` in root handles SPA routing; the one in `data/` blocks direct access
- All egg icons are in `media/` and imported directly in `App.tsx`
- `constants.ts` holds all wiki articles and chicken facts/puns — easy to extend
