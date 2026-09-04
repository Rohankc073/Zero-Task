# ZeroTask Self-Hosted Migration — Phase 2: Backend Foundation Architecture

## 1. Executive Summary

Phase 2 establishes the self-hosted backend foundation for ZeroTask alongside the existing Supabase infrastructure. 

**Key Achievements**:
- Fully functional, standalone backend stack constructed in `backend/`.
- 100% data model parity: 37 tables reproduced plus dedicated native authentication tables.
- Defense-in-depth authorization: FastAPI middleware combined with PostgreSQL session context (`SET LOCAL app.current_*`).
- Presigned S3 uploads via MinIO replacing Supabase Storage, preserving 20MB limits and private voice notes.
- Realtime WebSocket gateway fanned out via PostgreSQL `LISTEN`/`NOTIFY`.
- Asynchronous job execution via `APScheduler` without Redis dependency.
- **The existing Expo/React Native mobile application remains 100% functional against Supabase with zero modifications.**

---

## 2. Infrastructure & Service Topology

```
                                [ Public Internet / Mobile Clients ]
                                                │
                                                ▼ (HTTP: 8088 / HTTPS: 8443)
┌─────────────────────────────────────── [ Nginx Reverse Proxy ] ────────────────────────────────────────┐
│  - Routes /health, /ready, /api/v1/*, and /ws/                                                         │
│  - WebSocket Upgrade Proxying                                                                         │
│  - Client body size: 50MB (Supports 20MB task attachments + overhead)                                 │
└───────────────────────────────┬───────────────────────────────────────┬────────────────────────────────┘
                                │ (Internal: 8000)                      │ (Internal: 9000)
                                ▼                                       ▼
┌──────────────────────────────── [ FastAPI Application Server ] ──┐ ┌────────────────── [ MinIO Storage ] ──┐
│  - Python 3.12, Uvicorn ASGI Server                             │ │  - S3 Object Storage API              │
│  - SQLAlchemy 2.0 Async + asyncpg                               │ │  - 5 Buckets (tasks, meetings,        │
│  - Native JWT Authentication + Token Rotation                   │ │    chat, avatars, task-audio)         │
│  - 5-Tier Role Hierarchy & Company Isolation                    │ │  - Presigned GET/PUT URLs             │
│  - ConnectionManager (WebSocket Gateway)                        │ └──────────────────┬────────────────────┘
│  - APScheduler Background Worker                                │                    │
│  - Expo Push Notification Dispatcher                            │                    │
│  - Google Calendar & WhatsApp Webhook Handlers                  │                    │
└───────────────────────────────┬─────────────────────────────────┘                    │
                                │ (Internal: 5432)                                     │ (Docker Volume)
                                ▼                                                      ▼
┌─────────────────────────────── [ PostgreSQL 16 Database ] ──────────────────┐ ┌───── [ VPS Volume Mounts ] ───────┐
│  - 37 Relational Tables + Auth Tables                                       │ │  - zerotask_postgres_data         │
│  - PL/pgSQL Atomic Procedures & Business Triggers                           │ │  - zerotask_minio_data            │
│  - Row Level Security (RLS) with Transaction-Local Session Context          │ └───────────────────────────────────┘
│  - Event Pipeline: NOTIFY channel 'app_events'                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Network Ports & Internal Isolation

| Service | Internal Port | External Port | Exposure Policy |
|---|:---:|:---:|---|
| **Nginx** | 80 / 443 | 8088 / 8443 (dev) / 80 / 443 (prod) | **Public Gateway** |
| **FastAPI** | 8000 | None | Internal Docker Network only (`zerotask_net`) |
| **PostgreSQL** | 5432 | None | Internal Docker Network only (`zerotask_net`) |
| **MinIO API** | 9000 | None | Internal Docker Network only (`zerotask_net`) |

---

## 4. Database Schema & Migration Architecture

### Alembic Migration Sequence:
1. `001_initial_schema`:
   - Core tables: `companies`, `departments`, `designations`, `users`, `projects`, `tasks`, `meetings`, `chat_channels`, `notifications`, `approvals`, `audit_logs`.
   - Authentication tables: `user_credentials` (bcrypt hashes), `user_refresh_tokens` (hashed token records with rotation/revocation tracking), `user_push_tokens` (Expo push devices), `user_integrations` (OAuth tokens), `user_notes`.
2. `002_indexes_constraints`:
   - Multi-column composite indexes on high-traffic queries (`tasks(company_id, department_id, status)`, `audit_logs(company_id, created_at)`).
   - Domain check constraints (`ck_tasks_progress_range`, `ck_users_role_valid`).
3. `003_functions`:
   - PL/pgSQL procedures: `create_company_and_founder`, `delete_company_and_users`, `get_or_create_direct_channel`, `cleanup_and_complete_meetings`, `segregate_task`, `can_assign_task`, `process_meeting_approval`, `process_phone_change_approval`, `get_employee_dashboard_metrics`, `get_manager_project_analytics`, `get_team_workload`.
4. `004_triggers`:
   - Automatic company ID assignment, assignee validation, auto-progress synchronization, completed task protection, forensic audit logging.
5. `005_authorization_rls`:
   - Enables RLS on all primary tables, asserting `current_setting('app.current_company_id', true)::uuid`.
6. `006_realtime_events`:
   - Trigger function `fn_notify_app_events()` dispatching event metadata payloads onto PostgreSQL channel `app_events`.

---

## 5. Security & Authorization Framework

### Authentication Subsystem
- **Bcrypt Password Hashes**: Full compatibility with existing `$2a$` / `$2b$` Supabase password hashes.
- **Short-Lived Access Tokens**: Signed HS256 JWTs with 15-minute expiration containing role, user ID, company ID, and department ID claims.
- **Rotated Refresh Tokens**: Cryptographically secure 256-bit random tokens with 30-day expiration, invalidated immediately upon token rotation to prevent replay attacks.

### Authorization Dependencies
Centralized in `app/core/dependencies.py`:
- `get_current_user`: Resolves caller identity, enforces active status, and sets PostgreSQL transaction-local session variables.
- `require_role(allowed_roles)`: Enforces role hierarchy permissions.
- `require_company_access(company_id)`: Prevents cross-company access violations.
- `require_department_access(dept_id)`: Enforces departmental boundaries.

---

## 6. Realtime Architecture

- **PostgreSQL LISTEN/NOTIFY**: Background listener (`PostgreSQLListener` in `app/events/pg_listener.py`) listens on `app_events`.
- **WebSocket Gateway**: Endpoint `/ws?token=<jwt>` handles connections in `ConnectionManager`.
- **Multi-Tenant Filtering**: Events are dispatched exclusively to sockets belonging to the record's `company_id`.

---

## 7. Storage Architecture

- **MinIO Object Store**:
  - `task-attachments` (20MB limit)
  - `meeting-attachments` (20MB limit)
  - `chat-attachments` (10MB limit)
  - `avatars` (5MB limit, public)
  - `task-audio` (20MB limit, **private**)
- **Presigned URLs**: Mobile client directly streams uploads and downloads to/from MinIO via presigned URLs generated by FastAPI, preventing file buffers in application server RAM.

---

## 8. Limitations in Phase 2 & Next Steps

### Current Phase 2 Scope:
- The backend runs independently in parallel with Supabase.
- Mobile client has NOT been re-pointed to FastAPI.
- Supabase production database has NOT been modified or migrated.

### Recommended Phase 3 Roadmap:
1. **Phase 3A: Database Synchronization Tool Run**:
   - Run dry-run migration script `scripts/migrate_from_supabase.py` against staging.
   - Extract user password hashes from `auth.users` into `user_credentials`.
2. **Phase 3B: Mobile API Client Adapter**:
   - Introduce an abstraction layer in React Native (`src/api/client.ts`) capable of toggling between Supabase and FastAPI via an environment flag (`EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND=true/false`).
3. **Phase 3C: End-to-End Staging Validation**:
   - Verify mobile app login, task creation, voice note recording, and real-time chat against the self-hosted backend.
