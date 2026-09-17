# ZeroTask - Enterprise Multi-Tenant Workforce & Execution Operating System

<div align="center">
  <img src="assets/images/icon.png" width="100" height="100" alt="ZeroTask Logo" style="border-radius: 20px;"/>
  <br/><br/>
  <p><strong>A mission-critical, hierarchical workforce orchestration and multi-tenant task execution platform designed for modern enterprises.</strong></p>
</div>

---

## 📌 Overview

**ZeroTask** is an enterprise-grade mobile and web workforce execution platform built to streamline multi-company governance, task delegation, hierarchical approvals, real-time communication, and executive oversight.

The system is powered by a high-performance **Self-Hosted FastAPI (Python 3.12) + PostgreSQL + MinIO** backend paired with a cross-platform **React Native / Expo** frontend. Featuring strict multi-tenant company data isolation, upward meeting hierarchy rules, reschedule/prepone/postpone workflows, and forensic audit trails, ZeroTask eliminates operational bottlenecks across organizations.

---

## 🏛 Multi-Tenant Role & Authority Architecture

ZeroTask enforces strict Role-Based Access Control (RBAC) and company boundaries across five operational tiers:

```
                          ┌───────────────────────────┐
                          │        SUPER ADMIN        │
                          │ Global Multi-Org Control  │
                          └─────────────┬─────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │          FOUNDER          │
                          │ Universal Company Command │
                          └─────────────┬─────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │      DEPARTMENT HEAD      │
                          │ Department Governance     │
                          └─────────────┬─────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │          MANAGER          │
                          │ Direct Team Supervision   │
                          └─────────────┬─────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │         EMPLOYEE          │
                          │ Task Execution & Subtasks │
                          └───────────────────────────┘
```

- **Super Admin**: Global cross-company governance, organization provisioning, founder account administration, global user directory, performance aggregation, and direct executive messaging.
- **Founder**: Full operational command over their organization, team provisioning, departmental structure, company metrics, audit trails, and final escalation approvals.
- **Department Head**: Cross-team management within their department, workload distribution, meeting approvals, and supervisory task delegation.
- **Manager**: Day-to-day task assignment, task segregation, subordinate deadline modification, employee progress tracking, and direct approval reviews.
- **Employee**: Focused task execution, subtask delegation, status management, voice notes, personal scratchpad, and peer collaboration.

---

## 🚀 Core Features & Modules

### 1. 🏢 Multi-Company & Multi-Tenant Governance
- **Company Lifecycle Management**: Super Admin provisioning of organizations with automatic Founder account binding.
- **Strict Multi-Tenant Isolation**: Database-level tenant constraints ensuring users from one company cannot view, access, or schedule meetings with users of other companies.
- **Dynamic Department Filtering**: Executive task views with instant department-level filtering and status segregation.

### 2. 📅 Upward Meeting Hierarchy & 4-Action Approval Engine
- **Role-Based Meeting Workflows**:
  - **Employee ↔ Employee**: Requires **NO approval**. Meetings are immediately scheduled.
  - **Strict Privacy**: Peer employee meetings remain strictly private between participants—Founders, Department Heads, and Managers cannot see them unless explicitly invited.
  - **Employee → Manager**: Requires approval from the invited Manager.
  - **Employee / Manager → Department Head**: Requires approval from the Department Head.
  - **Employee / Manager / Department Head → Founder**: Requires approval from the Founder.
- **4-Action Decision Center**:
  - **Approve**: Instantly confirms and schedules the meeting, setting participant statuses to accepted.
  - **Decline**: Rejects the meeting request with required justification notes.
  - **Prepone**: Prompts the approver to pick an earlier date/time, updates the meeting schedule, and approves the meeting.
  - **Postpone**: Prompts the approver to pick a later date/time, updates the meeting schedule, and approves the meeting.

### 3. 🧩 Advanced Task Engine & Segregation
- **Parent-Child Decomposition**: Break complex parent tasks into structured subtasks with dedicated assignees and deadlines.
- **Multi-Assignee Support**: Assign tasks across multiple team members with individual status tracking.
- **Lifecycle State Machine**: Automated synchronization (`To Do` ➔ `In Progress` ➔ `Done` with `progress = 100%` and `completed_at` timestamps).
- **Universal File Attachments**: Attach and preview documents across formats (PDF, XLSX, DOCX, CSV, PPTX, PNG, JPG, ZIP) with robust URI caching fallbacks.
- **Task Voice Notes**: Integrated audio recording and playback on tasks for fast voice briefing.

### 4. 💬 Real-Time Team Communication
- **Scoped Channels**: General Chat, Management Channels, and Department-scoped real-time chat with auto-provisioning.
- **Executive Direct Channels**: Super Admin 1-to-1 secure direct messaging with Founders.
- **Realtime Delivery**: Fast WebSocket subscriptions with instant local cache and optimistic updates.

### 5. 📊 Executive Analytics & PDF Reports
- **Performance Metrics**: Real-time aggregation of task completion rates, departmental efficiency, and overdue metrics.
- **Automated PDF Generation**: Generate formatted PDF executive summaries for individual companies or global operations.

### 6. 📝 Personal Notes & Scratchpad
- Safe, auto-saving personal notes feed with inline editor, search, and clipboard integration.

---

## 🛠 Tech Stack

| Domain                        | Technologies                                                                                                                                 |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobile & Web Framework**    | [React Native](https://reactnative.dev/), [Expo (SDK 52)](https://expo.dev/), [Expo Router (v4)](https://docs.expo.dev/router/introduction/) |
| **Language & Typing**         | [TypeScript (Strict Mode)](https://www.typescriptlang.org/), [Python 3.12](https://www.python.org/)                                          |
| **Backend & APIs**            | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [Pydantic v2](https://docs.pydantic.dev/)                      |
| **Database & ORM**            | [PostgreSQL 15](https://www.postgresql.org/), [SQLAlchemy 2.0 (Async)](https://www.sqlalchemy.org/), [Alembic](https://alembic.sqlalchemy.org/) |
| **Object Storage**            | [MinIO (S3-Compatible)](https://min.io/)                                                                                                     |
| **Styling & Design System**   | Custom Slate & Cream Design Tokens, TailwindCSS / NativeWind                                                                                 |
| **Audio Engine**              | `expo-av`                                                                                                                                    |
| **Document & PDF Generation** | `expo-print`, `expo-sharing`, `expo-document-picker`                                                                                         |
| **Performance Lists**         | `@shopify/flash-list`                                                                                                                        |
| **Animations**                | `react-native-reanimated`, `react-native-gesture-handler`                                                                                    |

---

## 📁 Repository Structure

```
zerotask/
├── app/                        # Expo Router file-based navigation
│   ├── (auth)/                 # Authentication, Login, Registration
│   ├── (drawer)/               # Navigation drawer & main dashboard tabs
│   │   ├── (superadmin)/       # Super Admin Governance (Companies, Founders, Users, Analytics)
│   │   └── (tabs)/             # Tasks, Approvals, Calendar, Chat, Notes, Notifications, Reports, Profile
│   ├── meeting/                # Meeting detail, actions (Approve/Decline/Prepone/Postpone), and files
│   ├── project/                # Project overview screens
│   └── task/                   # Task detail & state modals
├── backend/                    # Self-Hosted FastAPI Backend
│   ├── app/
│   │   ├── api/v1/             # REST API routers (meetings, tasks, users, chat, approvals, etc.)
│   │   ├── core/               # Database config, auth dependencies, security tokens
│   │   ├── models/             # SQLAlchemy ORM data models
│   │   ├── schemas/            # Pydantic schemas and request/response models
│   │   └── services/           # Business logic services (meetings, tasks, notifications, storage)
│   ├── Dockerfile              # Production Docker build for FastAPI
│   └── docker-compose.yml      # Local stack orchestration (FastAPI + PostgreSQL + MinIO + NGINX)
├── src/
│   ├── adapter/                # FastAPI client adapter, query builder, and HTTP client
│   ├── components/             # Reusable enterprise UI components
│   │   ├── admin/              # Super Admin management widgets & modals
│   │   ├── approvals/          # Unified Approval Center components
│   │   ├── chat/               # Channel & 1-to-1 chat messaging components
│   │   ├── dashboards/         # Role-specific dashboard views
│   │   ├── tasks/              # Task cards, preview modal, segregation modal
│   │   └── ui/                 # Atomic design elements (Buttons, Inputs, Badges, Headers)
│   ├── context/                # AuthContext, NotificationContext & Global State
│   ├── hooks/                  # Custom hooks (useChat, useDashboards, useReports, etc.)
│   ├── services/               # Frontend API, meeting service, and business logic
│   ├── theme/                  # Design tokens, colors, typography
│   ├── types/                  # TypeScript interface definitions
│   └── utils/                  # Permission helpers, attachment pipeline
```

---

## ⚙️ Setup & Local Development

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Python](https://www.python.org/) (v3.11 or higher)
- [Docker & Docker Compose](https://www.docker.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

### 2. Frontend Installation

```bash
# Clone the repository
git clone https://github.com/Rohankc073/Zero-Task.git
cd Zero-Task

# Install mobile/web dependencies
npm install
```

### 3. Backend Stack Setup (Docker)

```bash
# Navigate to the backend directory
cd backend

# Start the full stack (FastAPI, PostgreSQL, MinIO, NGINX)
docker compose up -d --build
```

### 4. Running the Mobile App

```bash
# From the project root
npx expo start -c
```

- Press `a` for Android Emulator / connected device.
- Press `w` for Web browser.
- Scan the QR code using the Expo Go mobile app.

---

## 🔒 Security & Data Privacy

- **Zero Environment Leakage**: All `.env*` files, keystores, service accounts, and local credentials are strictly excluded from version control.
- **Tenant Privacy Boundary**: Cross-company queries and actions are blocked at the service and database layers.
- **Hardened User Deletion**: Complete cascade purging across all entity tables with zero orphaned records.

---

## 📄 License & Ownership

Developed for **ZeroTask Enterprise**. All rights reserved.
