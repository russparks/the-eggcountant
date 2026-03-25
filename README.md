# The Eggcountant

A lightweight React + PHP flock tracker rebuilt for cheap-and-cheerful shared hosting.

## Stack

- Frontend: Vite + React + TypeScript
- Backend: plain PHP endpoints under `api/`
- Auth: PHP sessions + `password_hash()` / `password_verify()`
- Storage: JSON files in `data/` with file locking

No Firebase. No database server. No drama.

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

## Data layout

```text
data/
  users/
    users.json
    <user-id>/
      locations.json
      eggLogs.json
      hens.json
      feedLogs.json
      medicationLogs.json
      saleLogs.json
      chickBatches.json
```

This is designed to be easy to back up or move.

## Hostinger deploy steps

1. Build the frontend locally:
   ```bash
   npm install
   npm run build
   ```
2. In Hostinger hPanel, open **File Manager** for the target domain.
3. Upload these into `public_html/`:
   - everything from `dist/`
   - `api/`
   - `.htaccess`
4. Create a writable `data/` folder alongside `api/` inside `public_html/`.
5. Inside `data/`, keep the included `.htaccess` so the raw JSON files are not web-accessible.
6. If needed, set permissions so PHP can write to `data/` and `data/users/`.
   - Typical shared-hosting safe default: directories `755`, files `644`
   - If Hostinger blocks writes, set `data/` and `data/users/` to writable in File Manager
7. Visit the site, register the first account, and start using it.

## Important Hostinger note

The root `.htaccess` rewrites unknown routes back to `index.html` for the React app while leaving `/api/` alone.

## Manual setup still required

- Upload the built frontend and PHP files to Hostinger
- Ensure the `data/` directory is writable by PHP
- Register your real user accounts after deploy

## Security / caveats

- This is intentionally simple session auth for small private use, not a full multi-tenant SaaS stack.
- Uploaded images are stored inline as base64 inside JSON records. Fine for a lightweight app, not ideal for huge image-heavy usage.
- There is no password reset email flow anymore because Firebase is gone and the brief asked for simple email/password auth only.
