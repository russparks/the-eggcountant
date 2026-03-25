# The Eggcountant

A lightweight React + PHP flock tracker built for cheap-and-cheerful shared hosting.

## Stack

- Frontend: Vite + React + TypeScript
- Backend: plain PHP endpoints under `api/`
- Auth: PHP sessions + `password_hash()` / `password_verify()`
- Primary storage: MySQL / MariaDB
- Dev fallback: optional legacy JSON storage when DB config is missing or disabled

No Firebase. No framework soup. Minimal shared-hosting drama.

## Backend storage mapping

The frontend API contract stays the same, but the PHP layer now maps collections onto Hostinger MySQL tables:

- `locations` → `coops`
- `hens` → `birds`
- `eggLogs` → `egg_logs`
- `feedLogs` → `feed_logs`
- `medicationLogs` → `feed_logs` (stored as medication-shaped rows when possible)
- `saleLogs` → `sales`
- `chickBatches` → `incubation_batches`
- auth/session users → `users`

The storage layer is intentionally defensive:

- it inspects table columns at runtime
- it supports common column-name variants
- when a JSON/payload column exists, it stores the full frontend record there too

That makes it more forgiving if the phpMyAdmin schema differs slightly from local assumptions.

## Config

Copy the example config and fill in the real DB password locally/on the server:

```bash
cp api/config.php.example api/config.php
```

`api/config.php` is git-ignored.

Example shape:

```php
return [
    'allowed_origins' => [
        'http://localhost:3000',
        'https://your-domain.example',
    ],
    'legacy_json_fallback' => true,
    'db' => [
        'host' => 'localhost',
        'name' => 'u726116940_PeopleProjects',
        'user' => 'u726116940_axislabs',
        'password' => 'your-real-password-here',
        'charset' => 'utf8mb4',
    ],
];
```

## Local development

### Frontend

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`.

### PHP API

In another terminal:

```bash
php -S localhost:8000
```

That serves the repo root so the API is available at `http://localhost:8000/api/...`.

If `api/config.php` is not present, the backend can fall back to the old JSON files for local/dev work.

## Legacy importer

If you already have JSON-based data, there is a lightweight importer:

```bash
php api/import_legacy_json.php
```

Notes:

- CLI only, on purpose
- it copies users and per-user collection data from `data/users/` into MySQL
- if a user already exists by email, their records are merged/upserted by record id

## Hostinger deploy steps

1. Build the frontend locally:
   ```bash
   npm install
   npm run build
   ```
2. Create `api/config.php` from `api/config.php.example` and set the real DB password.
3. In Hostinger hPanel, open **File Manager** for the target domain.
4. Upload these into `public_html/`:
   - everything from `dist/`
   - `api/`
   - `.htaccess`
5. Make sure the MySQL tables already exist:
   - `users`
   - `coops`
   - `birds`
   - `egg_logs`
   - `incubation_batches`
   - `sales`
   - `feed_logs`
6. If you are importing legacy JSON data, temporarily upload `data/` too and run the importer from CLI if available.
7. Visit the site, register or log in, and confirm records are saving to MySQL.

## Important Hostinger note

The root `.htaccess` rewrites unknown routes back to `index.html` for the React app while leaving `/api/` alone.

## Security / caveats

- This is intentionally simple session auth for small private use, not a full multi-tenant SaaS stack.
- Uploaded images are still stored inline as base64 data URLs inside records.
- `api/config.php` should never be committed.
- The DB layer is designed to handle minor schema-name differences, but it still assumes the listed tables are present and writable.
