# AI Model Hub & Device Platform

A web platform to manage AI models and deploy them to edge devices (ESP32-S3 boards and a
Grove Vision AI V2 camera module).

**Author & maintainer:** Baligh Ghorbeli. This is an independently maintained personal portfolio repository; the project is not published on behalf of an employer or organization.

**Stack:** Next.js (TypeScript, Tailwind) · FastAPI · PostgreSQL 15 · Mosquitto MQTT · Docker Compose

## Architecture

```
Browser ──► Next.js (3000) ──► FastAPI backend (8000) ──► PostgreSQL (5432)
                │                      ▲
                │                      └── MQTT (1883) ◄── devices publish telemetry
                └──► Edge Agent on the user's PC (4040) ──► USB ──► Grove Vision AI V2
```

The Edge Agent runs on the user's own computer because browsers cannot access USB devices.
It downloads a model from the backend, verifies its SHA256, and writes it to the board.

## What is real, what is simulated

No Grove Vision AI V2 or ESP32 hardware was available during development.

| Part | Status |
|---|---|
| Accounts, JWT login, Bcrypt hashing, roles, per-organization data isolation | Real |
| Device registry and live Online/Offline status | Real |
| MQTT broker (Mosquitto) and backend telemetry listener | Real |
| Telemetry source (battery, RSSI, temperature) | **Simulated** by `backend/simulate_device.py` |
| Model upload: ZIP, `manifest.json`, size, SHA256, duplicate check | Real |
| Model download by the Edge Agent, with SHA256 verification | Real |
| USB detection and flashing the board | **Simulated** (`detect_device()` in `edge-agent/agent.py`) |
| Edge Agent states: `device_missing`, `wrong_device`, `transferring`, `success` | Real logic, simulated device |
| Live Preview camera image and detections | **Simulated** (`/detections` in the Edge Agent) |

The specification's final acceptance rule (a real model deployed on a real Grove board and
previewed) has **not** been met, because no hardware was available. Replacing
`detect_device()` and `/detections` with real implementations is the remaining work.

## Run it locally

Requirements: Python 3.10+, Node.js, Docker Desktop, Git.

### 1. Configuration

Create a file named `.env` in the project root (see `.env.example`):

```
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=your_db_name
DATABASE_URL=postgresql://your_db_user:your_db_password@localhost:5432/your_db_name
SECRET_KEY=<generate one>
MQTT_USERNAME=trinovatech_backend
MQTT_PASSWORD=<generate one>
```

Generate the secret key and the MQTT password with
`python -c "import secrets; print(secrets.token_hex(32))"` (use a shorter length for the MQTT
password, e.g. `token_hex(16)`, it just needs to be hard to guess). Never commit `.env`.

Create `frontend/.env.local` from `frontend/.env.local.example`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

### 2. MQTT password file

Mosquitto now requires a username and password (see Security notes below). Generate its
password file from the credentials in `.env`:

```
docker run --rm --env-file .env -v "${PWD}\mosquitto:/mosquitto/config" eclipse-mosquitto:2 sh -c 'mosquitto_passwd -b -c /mosquitto/config/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"'
```

This writes `mosquitto/passwd` (gitignored, re-run this command if you change the password).
It is only needed once per machine, or whenever `MQTT_PASSWORD` changes.

### 3. Database, MQTT broker, backend and website

```
docker compose up -d --build
```

This starts all four services: `db` (PostgreSQL), `mqtt` (Mosquitto, built from
`mosquitto/Dockerfile` so the password file ships with correct permissions), `backend`
(FastAPI, port 8000) and `frontend` (Next.js, port 3000). Tables are created automatically
at startup.

Working on the backend or frontend code directly? Run that one outside Docker instead, so you
get hot reload:

```
# Backend only (after `docker compose up -d db mqtt`)
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload

# Frontend only
cd frontend
npm install
npm run dev
```

Don't run both the Docker and the manual version of the same service at once — they'd fight
over the same port.

### 4. Edge Agent (port 4040)

```
cd edge-agent
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn agent:app --host 127.0.0.1 --port 4040
```

Open http://localhost:3000/register.

## Using the platform

1. **Register.** Create a new organization (you become its admin), or join an existing one
   with its invite code (you become a user). The admin sees the invite code in the sidebar.
2. **Devices.** Add a device, then run `python simulate_device.py` from `backend` to publish
   telemetry for `ESP32-TEST-001`. The device turns ONLINE and returns to OFFLINE after
   15 seconds without a message.
3. **Models.** Admins and formateurs upload a `.zip` containing a `manifest.json` with `version`
   and `target`. Invalid ZIPs, missing or invalid manifests, oversized files and duplicates
   are rejected.
4. **Deploy.** Click Deploy on a model. Use Plug in / Wrong device / Unplug to exercise every
   Edge Agent state, including unplugging in the middle of a transfer.
5. **Preview.** After a successful deploy, the Preview page draws simulated detections with
   labels and confidence scores. It only talks to the Edge Agent on localhost; nothing is
   uploaded.
6. **Academy.** Four short beginner modules on Edge AI and deployment. Progress is saved per
   account in the database, so it follows you across browsers.

## Running the tests

From `backend`, with its venv active (`pip install -r requirements.txt` already run, see step 3):

```
cd backend
venv\Scripts\activate
pytest tests/ -v
```

These are API tests, run against an isolated in-memory SQLite database — they
don't need Docker, Postgres or Mosquitto running.

## Roles

| Role | Can view | Can upload models |
|---|---|---|
| admin | yes | yes |
| formateur | yes | yes |
| user | yes | no |

New organization creators are admins. People who join with an invite code are users. An admin
can list their organization's members and promote one to formateur:

```
GET   /organization/members                   (admin only, lists your own organization)
PATCH /organization/members/{user_id}/role     body: {"role": "formateur"}  or  {"role": "user"}
```

This can't be used to grant `admin`, to change your own role, or to reach a member of another
organization. (Before this endpoint existed, the only way was a raw SQL update against the
running container; that still works if you prefer it, but is no longer necessary.)

## Security notes

- Passwords hashed with Bcrypt. API access requires a valid JWT.
- 5 failed login attempts from the same (IP, email) pair within 5 minutes locks that pair out
  with 429, even if a later attempt uses the correct password (`backend/rate_limit.py`).
- Secrets live in `.env`, excluded from Git.
- Every device and model query is filtered by the user's organization; `organization_id` is
  `NOT NULL` on `users`, `devices` and `models`.
- Uploaded file names are stripped of folder parts, and files are stored per organization.
- Model uploads are checked for file extension, content type, size, valid ZIP structure, a
  valid manifest with `version` and `target`, that `target` is a supported device, and
  duplicate hashes.
- MQTT requires a username and password (`mosquitto/passwd`, generated from `.env`); anonymous
  connections are refused.
- The Edge Agent only accepts requests from `http://localhost:3000` and only downloads from the
  configured backend.

## Known limitations

- MQTT runs without TLS, and the username/password is one shared credential for every
  publisher rather than one per device — a leaked credential could still impersonate any
  `device_id`. The specification asks for TLS in production; this is for local development.
- The login token is kept in the browser's `localStorage`.
- Passwords use Bcrypt (not Argon2); the specification allows either.
- The Academy content (the 4 lessons themselves) is static; there is no course management for
  formateurs. Completion progress is stored per account in the database.
- Automated tests cover the backend API (`backend/tests/`, run with `pytest`); the frontend and
  Edge Agent were tested manually.
