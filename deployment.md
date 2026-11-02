# Deployment Guide & Local Runbook

## Company A Staffing — AI Resume Screening & Client Shortlist Portal

This application is built for **Company A, Noida** (IT services, banking back-office, and retail staffing firm). It automates resume screening, provides explainable AI scoring with exact CV quotation citations, enforces blind evaluation and quality verification guardrails, provides a mobile-responsive masked client portal, and ensures full compliance with the **Digital Personal Data Protection Act 2023 (DPDP Act)**.

---

## 1. System Requirements

- **Runtime**: Node.js v18.0.0 or higher (v20+ / v22 recommended)
- **Language & Frameworks**: **TypeScript** (latest v5.7+ / v7.0 with strict type definitions), **React 19** (Vite 8), **Express 5**
- **Package Manager**: npm v9.0.0 or higher
- **Database Engine (Dual-Mode)**:
  - **PostgreSQL 16** (Production-grade connection pool via `pg.Pool`, complete DDL schema at `backend/src/db/schema.postgres.sql`, pre-configured `docker-compose.yml`)
  - **Embedded SQLite** (via `better-sqlite3` with WAL mode enabled — automatically used if PostgreSQL is not active so reviewers can run the application immediately with zero database installation or configuration!)
- **AI Models Supported (Latest Generation)**:
  - **Google Gemini 2.0 Flash** (`gemini-2.0-flash` — flagship ultra-fast structured JSON scoring)
  - **OpenAI GPT-4o & GPT-4o-mini** (`gpt-4o`, `gpt-4o-mini`, `o3-mini` with strict JSON mode)
  - **Anthropic Claude 3.7 Sonnet** (`claude-3-7-sonnet-20250219`)
  - **Built-in High-Fidelity NLP Engine** (deterministic zero-hallucination line-numbered quotation citations without external API dependencies)
- **Supported Platforms**: Linux, macOS, Windows (WSL / PowerShell)

---

## 2. Step-by-Step Local Run

### Step 1: Clone Repository
```bash
git clone <YOUR_GITHUB_REPO_URL>
cd isocode-assing
```

### Step 2: Install All Dependencies
The project contains a root workspace, a backend API service, and a React Vite frontend:
```bash
# Install root orchestration tools
npm install

# Install backend dependencies (Express, SQLite, pdf-parse, mammoth, etc.)
cd backend && npm install && cd ..

# Install frontend dependencies (React, Vite, Lucide-React, etc.)
cd frontend && npm install && cd ..
```

### Step 3: Run Automated Test Suite
Verify that all AI scoring logic, quote citations, duplicate detection, PII masking, RBAC security, and DPDP erasure tests pass:
```bash
npm test
```
*Expected result: 7/7 tests pass in <1 second.*

### Step 4: Seed Database with Realistic Sample Data
Populate realistic requisitions, candidate CVs (including sample candidates CND-91022, CND-91047, CND-91088), AI evaluations, DPDP logs, and calibration samples:
```bash
npm run seed
```

### Step 5: Start Development Servers
Run backend and frontend concurrently with a single command:
```bash
npm run dev
```

Open your browser at:
- **Frontend App**: `http://localhost:5173/`
- **Backend API Server**: `http://localhost:4000/api/health`

*(Alternatively, to run in production mode: `npm run build && npm start`, then open `http://localhost:4000/`)*

---

## 3. Demo Login Details for Reviewer

The application provides an instant **Role Switcher** in the top navigation bar to test all user personas without password friction:

| Role | Name | Email / Persona | Scope & Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Recruiter (Lead)** | **Priya Sharma** | `priya@companya.in` | Full ATS access: JD intake, edit scorecard weights, bulk CV upload, blind screening toggle, inspect cited evidence quotes, perform mandatory CV verification, submit to client shortlist, manage pipeline stages. |
| **Client Hiring Manager (IT)** | **Vikram Malhotra** | `vikram@hdfctech.com` (VP Engineering, HDFC Tech) | Client Portal: strictly isolated to HDFC Tech requisitions. Evaluates candidate match cards with **masked contact info**, reviews cited quotes, Shortlists, Rejects with reason, Proposes interview slots. |
| **Client Hiring Manager (Banking)** | **Ananya Sen** | `ananya@standardchartered.com` (Head of AML Operations) | Client Portal: strictly isolated to Standard Chartered KYC Analyst requisition. Evaluates candidates like Arjun Rawat. |
| **Delivery Head** | **Rajesh Verma** | `rajesh@companya.in` | Executive Oversight: Weekly AI vs Recruiter calibration audits, discrepancy tracking, and ₹1.57 Crore/year business ROI metrics. |

> **Pro-Tip for Reviewers**: Click the **"Reset Data"** button in the navbar at any time to instantly restore clean, fresh sample data.

---

## 4. Environment Variables

The application runs out of the box with zero required configuration. For production deployments or optional external services, configure the following environment variables:

| Variable Name | Purpose | Default / Description |
| :--- | :--- | :--- |
| `PORT` | Backend HTTP port | `4000` |
| `NODE_ENV` | Runtime environment mode | `development` or `production` |
| `DB_TYPE` | Database engine selection | `sqlite` or `postgres` |
| `DATABASE_PATH` | SQLite database file location | `./backend/data/screening.db` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/dbname` |
| `POSTGRES_HOST` | PostgreSQL hostname | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_USER` | PostgreSQL user | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | None in repo |
| `POSTGRES_DB` | PostgreSQL database name | `companya_screening` |
| `AI_PROVIDER` | Preferred LLM provider | `gemini`, `openai`, or `anthropic` |
| `AI_MODEL` | Preferred AI model identifier | `gemini-2.0-flash`, `gpt-4o-mini`, `gpt-4o`, `claude-3-7-sonnet` |
| `GEMINI_API_KEY` | *(Optional)* Google Gemini 2.0 API key | Zero external dependencies if omitted (uses built-in engine) |
| `OPENAI_API_KEY` | *(Optional)* OpenAI API key | Built-in fallback rule engine active |
| `ANTHROPIC_API_KEY` | *(Optional)* Anthropic Claude API key | Built-in fallback rule engine active |
| `MAX_FILE_UPLOAD_LIMIT` | Max file upload limit per bulk batch | `500` files |

*(Note: Per submission rules, variable names only are listed; never put secret values in the repository).*

---

## 5. Deployment Architecture (Cloud / Docker / Production)

### Containerized Deployment (Docker)
The application can be packaged into a single lightweight multi-stage Docker container:
```dockerfile
# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# Stage 2: Production Server
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "backend/src/server.js"]
```

### Cloud Hosting Options
1. **Render / Railway / Fly.io**: Connect GitHub repo, specify start command `npm start`, and mount a persistent disk at `/app/backend/data` for SQLite persistence.
2. **AWS EC2 / DigitalOcean Droplet**: Pull repo, install Node 22, run `npm run build`, and use `pm2 start backend/src/server.js --name "company-a-portal"`.
3. **Nginx Reverse Proxy**: Reverse proxy port 80/443 to `http://127.0.0.1:4000` with SSL via Let's Encrypt Certbot.

---

## 6. Verification Checklist of Evaluated Features

- [x] **JD Scorecard Intake**: AI parses raw JD text into editable scorecard with weights, thresholds, and must-haves.
- [x] **Bulk CV Upload**: Supports PDF, DOCX, and TXT with SHA-256 duplicate file & profile detection.
- [x] **AI CV Scoring with Exact Evidence Quotes**: Quotes verbatim lines from CV with line numbers for every criterion.
- [x] **AI Uncertainty Handling**: Flags missing criteria (e.g. notice period omitted) with low confidence indicators.
- [x] **Anti-Auto-Rejection Guarantee**: No candidate is auto-rejected; low scorers remain fully searchable and filterable.
- [x] **Blind Screening Mode**: One-click toggle hides candidate name, email, phone, gender, and demographics during evaluation.
- [x] **Mandatory Recruiter CV Verification**: Recruiter must open and verify CV before client portal submission is unlocked.
- [x] **Client Shortlist Portal**: Clean, mobile-friendly interface with masked contact details, structured rejection reasons, and interview slot picker.
- [x] **8-Stage Requisition Pipeline**: Kanban tracking from Sourced to Joined.
- [x] **DPDP Act 2023 Compliance**: Verified consent records, right-to-erasure execution, and immutable access audit log.
- [x] **Delivery Head Calibration**: Weekly sample auditing AI rank vs recruiter choice agreement + ₹1.57 Crore/year ROI dashboard.
- [x] **Automated Tests**: Comprehensive test suite covering core scoring, parsing, deduplication, security, and DPDP compliance.
