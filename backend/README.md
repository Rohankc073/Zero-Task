# ZeroTask Self-Hosted Backend

A high-performance, enterprise-grade, multi-tenant backend foundation designed for ZeroTask on client-owned VPS infrastructure.

Built with:
- **FastAPI** (Python 3.12, Uvicorn, ASGI)
- **PostgreSQL 16** (SQLAlchemy 2.x async + asyncpg)
- **Alembic** (Database migrations)
- **MinIO** (S3-compatible Object Storage for task attachments & private voice notes)
- **Nginx** (Reverse Proxy, SSL Termination, WebSocket upgrade)
- **WebSockets + PostgreSQL LISTEN/NOTIFY** (Realtime pub/sub event pipeline)
- **APScheduler** (Async background scheduler without Redis overhead)
- **Docker Compose** (Production container orchestration)

---

## 1. Prerequisites

- **Docker** 24.0+ & **Docker Compose** v2+
- **Python** 3.12+ (if running locally without Docker)
- **Git**

---

## 2. Docker Compose Quickstart

### Step 1: Prepare Environment
```bash
cd backend
cp .env.example .env
# Edit .env with your secrets and secure passwords
```

### Step 2: Build & Start Containers
```bash
docker compose up -d --build
```

This spins up:
- `zerotask_postgres` (PostgreSQL 16 on internal network: 5432)
- `zerotask_minio` (MinIO Object Store on internal network: 9000)
- `zerotask_backend` (FastAPI Application on internal network: 8000)
- `zerotask_nginx` (Nginx Reverse Proxy exposing ports 8088 / 8443)

Check container health:
```bash
docker compose ps
```

---

## 3. Database Migrations (Alembic)

Run all migrations from zero to the latest schema:
```bash
# Inside docker container:
docker compose exec fastapi alembic upgrade head

# Or locally with activated virtualenv:
alembic upgrade head
```

Rollback last migration:
```bash
alembic downgrade -1
```

Migration Chain:
1. `001_initial_schema`: Core 37 tables + authentication credentials/tokens.
2. `002_indexes_constraints`: Composite performance indexes and data checks.
3. `003_functions`: PL/pgSQL atomic procedures (task segregation, meetings cleanup, analytics).
4. `004_triggers`: Company assignment, assignee check, progress sync, audit logging.
5. `005_authorization_rls`: PostgreSQL Row Level Security defense-in-depth policies.
6. `006_realtime_events`: Database event triggers emitting `NOTIFY app_events`.

---

## 4. Development Database Seeding

To populate two isolated companies (Acme Corp and Beta Global) with full role hierarchies:
```bash
# Inside docker:
docker compose exec fastapi python scripts/seed_dev_data.py

# Or locally:
python scripts/seed_dev_data.py
```

Test Credentials Seeded:
- **Super Admin**: `superadmin@zerotask.internal` / `Test@123`
- **Acme Founder**: `founder.a@acme.com` / `Test@123`
- **Acme Manager**: `manager.a@acme.com` / `Test@123`
- **Acme Employee**: `employee.a@acme.com` / `Test@123`
- **Beta Founder**: `founder.b@beta.com` / `Test@123`
- **Beta Employee**: `employee.b@beta.com` / `Test@123`

---

## 5. MinIO Object Storage Setup

Buckets automatically created on application startup:
- `task-attachments` (Protected, max 20MB)
- `meeting-attachments` (Protected, max 20MB)
- `chat-attachments` (Protected, max 10MB)
- `avatars` (Public CDN, max 5MB)
- `task-audio` (**Private**, max 20MB, accessible only via signed URLs)

MinIO Console (if enabled on local port 9001):
- URL: `http://localhost:9001`
- Credentials configured in `.env` (`MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`).

---

## 6. Realtime WebSockets

Connect via WebSocket:
```
ws://localhost:8088/ws?token=<jwt_access_token>
```
Supported Client Actions:
- `{"action": "join_channel", "channel_id": "<channel-uuid>"}`
- `{"action": "leave_channel", "channel_id": "<channel-uuid>"}`
- `{"action": "ping"}`

Realtime events received:
`TASK_UPDATE`, `MEETING_UPDATE`, `NEW_MESSAGE`, `NEW_NOTIFICATION`, `APPROVAL_UPDATE`, `AUDIT_LOG_INSERT`.

---

## 7. Running Automated Tests

Run the test suite:
```bash
# Locally:
pytest backend/tests/ -v

# Inside docker:
docker compose exec fastapi pytest tests/ -v
```

---

## 8. Production VPS Hardware Profile

Recommended minimum specification:
- **CPU**: 4 vCPUs
- **RAM**: 8 GB
- **Disk**: 100 GB NVMe SSD
- **OS**: Ubuntu 22.04 or 24.04 LTS
- **Network**: 1 Gbps port, static public IPv4
