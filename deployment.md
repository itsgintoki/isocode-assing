# Deployment and local runbook

## Shortlist — AI-assisted resume screening and client shortlist portal

This runbook covers the implementation in this repository: local development, tests, a production build, Docker, and the operational details a reviewer or pilot team needs. It does not claim a live deployment. Use the steps below to run the application yourself.

All seeded candidates, clients, CVs and contact details are fictional.

---

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| Node.js 22+ | The backend is TypeScript compiled with `tsc`, uses `better-sqlite3`, and the PDF generator uses Node 22's built-in WebSocket client. |
| npm 9+ | Tested with npm 9. |
| Google Chrome or Chromium | Only needed to rebuild `docs/TDD.pdf` and `submission.zip`. Set `CHROME_BIN` if it is not on `PATH`. |
| Linux, macOS or Windows | Docker is the simplest path on Windows. |

SQLite is embedded through `better-sqlite3`; no database server is required. There is no PostgreSQL branch in this version.

---

## 2. Local development

### 2.1 Clone and install

```bash
git clone <public-repository-url>
cd isocode-assing

npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2.2 Optional configuration

The application runs with defaults and no `.env` file. To override defaults:

```bash
cp .env.example .env
```

Edit `.env` at the repository root. The backend loads it on startup. Relative `DATABASE_PATH` values are resolved from the `backend/` directory, so the default `./data/screening.db` becomes `backend/data/screening.db`.

### 2.3 Test

```bash
npm test
```

Expected result: **26 tests, 26 passing**. The suite creates and removes `backend/data/test-screening.db`; it never writes to the demo database.

### 2.4 Start

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API health check: `http://localhost:4000/api/health`

The database is created, migrated and seeded automatically the first time the API starts. Stop the process with `Ctrl+C`.

Vite proxies `/api` to `http://localhost:4000` in development. If you change `PORT`, update the proxy target in `frontend/vite.config.js` as well.

### 2.5 Reset the demo data

From the UI, sign in as the delivery head (`rajesh@companya.in`) and use **Reset demo data** on the Insights screen. From the shell:

```bash
npm run seed
```

Both are destructive: they replace requisitions, candidates, evaluations, users, sessions and audit rows with the seed dataset. Stop other writers first.

---

## 3. Demo accounts

All seeded accounts use the password **`demo1234`**. The API returns account metadata but never password hashes.

| Role | Name | Email | Scope |
| --- | --- | --- | --- |
| Recruiter | Priya Sharma | `priya@companya.in` | Company A internal workspace |
| Client hiring manager | Vikram Malhotra | `vikram@hdfctech.com` | HDFC Tech Platform only |
| Client hiring manager | Ananya Sen | `ananya@standardchartered.com` | Standard Chartered only |
| Delivery head | Rajesh Verma | `rajesh@companya.in` | Internal workspace, calibration, demo reset |

These accounts exist for review. Remove or replace them before using the application with real candidate data.

---

## 4. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API and production frontend port. |
| `NODE_ENV` | `development` | Set to `production` behind HTTPS. This makes the session cookie `Secure`. |
| `DATABASE_PATH` | `./data/screening.db` | SQLite file, resolved from `backend/`. Parent directories are created automatically. |
| `CORS_ORIGIN` | unset | Comma-separated browser origins allowed to call the API with cookies. Required in production only when the SPA and API use different origins. |
| `MAX_BULK_UPLOAD_FILES` | `500` | Maximum number of files accepted in one upload request. |
| `AI_PROVIDER` | unset | Optional JD-intake provider: `gemini`, `openai` or `anthropic`. |
| `AI_MODEL` | unset | Optional model name for the selected provider. |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | unset | Optional keys. Without them, JD intake uses the local deterministic extractor. CV scoring is always local. |
| `GEMINI_MODEL` / `OPENAI_MODEL` / `ANTHROPIC_MODEL` | unset | Optional provider-specific model overrides. |
| `CHROME_BIN` | unset | Path to Chrome or Chromium for PDF generation only. |

Do not commit `.env` or provider keys. `.gitignore` excludes `.env`; `.env.example` contains names and safe defaults only. The AI keys are used only by the optional JD-to-scorecard call; they are never needed for tests or CV scoring.

---

## 5. Production build

```bash
npm run build
NODE_ENV=production npm start
```

`npm run build` compiles the backend TypeScript to `backend/dist` and the frontend to `frontend/dist`. The Express server then serves the built SPA and the API on port `4000`.

**HTTPS is required when `NODE_ENV=production`.** The session cookie is marked `Secure`, so it will not be stored over plain HTTP. Put the app behind a TLS-terminating reverse proxy (for example Caddy, nginx with Let's Encrypt, or a platform load balancer). The app sets `trust proxy` so client IPs are read from the forwarded headers.

A minimal nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

In development, cross-origin requests are allowed for convenience. In production, set `CORS_ORIGIN` to the SPA's exact origin (for example `https://shortlist.example.com`) if the frontend and API are on different hosts. Same-origin deployments do not need it, and unlisted origins are rejected.

---

## 6. Docker

```bash
docker compose up --build -d
docker compose logs -f app
```

Open `http://localhost:4000`.

The compose file mounts the named volume `app_data` at `/app/backend/data`, so the SQLite database survives container restarts. To remove the database as well:

```bash
docker compose down -v
```

The container uses `NODE_ENV=production`, so put a TLS proxy in front of it for non-local use. The image compiles the TypeScript backend, builds the frontend, then prunes development dependencies; it is a single-container deployment, not a horizontally scaled service.

---

## 7. Hosted environments

SQLite works on a single instance with a persistent disk. For a small pilot:

1. Deploy the repository to a platform that supports a persistent volume or disk.
2. Mount the volume at `/app/backend/data`.
3. Set `NODE_ENV=production`, `PORT` as required by the platform, and `DATABASE_PATH=./data/screening.db`.
4. Terminate TLS at the platform or reverse proxy.
5. Replace the seeded database and demo accounts before collecting real data.
6. Back up the SQLite file and its `-wal`/`-shm` sidecars together.

This repository does **not** include a live URL. A deployment is only useful once the operator has completed the security and data-protection work below.

For more than one API instance, move to a managed relational database and shared rate limiting first. SQLite is a deliberate review and pilot choice, not a scale-out database.

---

## 8. Data operations

### 8.1 Backup

Stop the API or use SQLite's online backup API, then copy:

```text
backend/data/screening.db
backend/data/screening.db-wal
backend/data/screening.db-shm
```

Copying only the main file while the process is writing can lose recent transactions.

### 8.2 Erasure

An internal reviewer can erase a candidate from **Compliance** or by calling:

```http
POST /api/dpdp/erasure-request
Content-Type: application/json

{ "candidateId": "CND-91022", "reason": "Data subject request" }
```

Erasure clears direct identifiers, CV text and derived profile fields; clears evaluation evidence, notes and interview slots; marks the candidate deleted; and writes a `candidate_deletion` audit row. The API returns a purge receipt. Test this path against the demo data before relying on it in a pilot.

### 8.3 Logs and retention

The compliance screen exposes access logs and consent records. Audit rows survive candidate erasure by design. The prototype does not implement automated retention expiry; a production operator must define and enforce retention periods.

---

## 9. Rebuilding the submission files

The Technical Design Document source is `docs/TDD.md`. To regenerate the PDF:

```bash
npm run tdd:pdf
```

This renders the Markdown to styled HTML, starts headless Chrome, and prints an A4 PDF with a cover, contents page and page numbers. If Chrome is not on `PATH`, set `CHROME_BIN`:

```bash
CHROME_BIN=/path/to/google-chrome npm run tdd:pdf
```

To create the submission archive:

```bash
npm run package-zip
```

`submission.zip` contains exactly two files: `TDD.pdf` and `deployment.md`. The packaging script refuses to run without the PDF and reports the final archive size. The current document is well under the 25 MB submission limit.

---

## 10. Verification checklist

Run this before handing the build to a reviewer:

```bash
npm test
npm run typecheck
npm run build
npm run tdd:pdf
npm run package-zip
unzip -l submission.zip
```

Then, with the app running:

- [ ] Sign in as each of the four demo accounts.
- [ ] Confirm the client account sees only its own client company.
- [ ] Create or edit a scorecard and confirm candidates are re-scored.
- [ ] Upload the sample CVs and confirm the batch report.
- [ ] Open an AI-screened CV, verify it, and submit it to the client.
- [ ] Attempt to submit an unverified candidate and confirm it is blocked.
- [ ] Shortlist, pass and propose slots from the client portal.
- [ ] Confirm contact details are masked and no raw CV is exposed to the client.
- [ ] Erase a candidate and confirm the receipt and audit row.
- [ ] Run the reset-demo action and confirm the seed state returns.

---

## 11. Troubleshooting

**`better-sqlite3` fails to install**
Use Node 22 and a build toolchain (`python3`, `make`, `g++` on Debian/Ubuntu). The Dockerfile installs these for the native module build.

**Port 5173 or 4000 is already in use**
Stop the other process or change `PORT`. If you change the API port, update the Vite proxy target in `frontend/vite.config.js`.

**Sign-in appears to succeed but the session does not persist**
Check `NODE_ENV`. In production the cookie is `Secure`; use HTTPS (or a TLS-terminating proxy). Also check that the browser is not blocking cookies for the host.

**Upload rejects a scanned PDF**
Only text-layer PDFs are supported. Scanned/image-only PDFs are reported as unreadable rather than silently accepted.

**`npm run tdd:pdf` cannot find Chrome**
Install Chrome/Chromium or point `CHROME_BIN` at the executable.

**Client sees an empty shortlist**
The client portal only shows candidates that a recruiter has verified and submitted. Use the recruiter account to move a candidate to `submitted_to_client` first.

**Client sees another client's requisition**
That is a bug. The tenant guard should reject it with 403. Capture the request and check `client_company` scoping in `backend/src/middleware/auth.ts` and `backend/src/routes/client.ts`; do not rely on the UI to hide the record.

---

## 12. Known production gaps

Before using real candidate data, address these explicitly:

- Replace demo accounts and seeded data; remove the delivery-head demo reset or protect it operationally.
- Set `CORS_ORIGIN` to the real frontend origin for a split-origin deployment.
- Move login rate limiting to a shared store if more than one API instance is used.
- Add a candidate-facing consent and withdrawal journey.
- Add retention expiry, encryption at rest and a formal DPDP review.
- Add phishing/malware scanning and a document parser confidence report for uploads.
- Add automated browser tests for the critical sign-in, upload, verification and client-decision flows.
- Measure pilot outcomes before making any time-saving or ROI claim.

The Technical Design Document records the same limitations and the reasoning behind the scope.
