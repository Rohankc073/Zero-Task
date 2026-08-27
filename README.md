# ZeroTask - Enterprise Multi-Tenant Workforce & Execution Operating System

<div align="center">
  <img src="assets/images/icon.png" width="100" height="100" alt="ZeroTask Logo" style="border-radius: 20px;"/>
  <br/><br/>
  <p><strong>A mission-critical, hierarchical workforce orchestration and multi-tenant task execution platform designed for modern enterprises.</strong></p>
</div>

---

## 📌 Overview

**ZeroTask** is an enterprise-grade mobile and web execution platform built to streamline multi-company governance, task delegation, hierarchical approvals, real-time communication, and executive oversight. Featuring strict multi-tenant data isolation, forensic audit trails, voice notes, and an entity-aware notification engine, ZeroTask eliminates operational bottlenecks across global organizations.

---

## 🏛 Multi-Tenant Role & Authority Architecture

ZeroTask enforces strict Role-Based Access Control (RBAC) and Row-Level Security (RLS) across five distinct operational tiers:

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

* **Super Admin**: Global cross-company governance, company provisioning, founder account administration, global user directory, performance aggregation, and direct executive communication.
* **Founder**: Full operational command over their organization, team provisioning, departmental structure, organizational metrics, company-wide audit trails, and final escalation approvals.
* **Department Head**: Cross-team management within their department, workload distribution, meeting approvals, and supervisory task delegation.
* **Manager**: Day-to-day task assignment, task segregation, subordinate deadline modification, employee progress tracking, and direct approval requests.
* **Employee**: Focused task execution, subtask delegation, status management, voice notes, personal scratchpad, and activity tracking.

---

## 🚀 Core Features & Modules

### 1. 🏢 Multi-Company & Multi-Tenant Governance
* **Company Lifecycle Management**: Super Admin provisioning of organizations with automatic Founder account binding.
* **Cross-Company Isolation**: Strict PostgreSQL Row Level Security (RLS) and database triggers preventing data access or write spoofing across company boundaries.
* **Global Directory & Filtering**: Super Admin aggregate views of all companies, active users, and global operational metrics.

### 2. 🧩 Advanced Task Engine & Segregation
* **Parent-Child Decomposition**: Break complex parent tasks into structured subtasks with dedicated assignees and deadlines.
* **Multi-Assignee Support**: Assign tasks to multiple team members with individual status tracking.
* **Lifecycle State Machine**: Automated synchronization (`To Do` ➔ `In Progress` ➔ `Done` with `progress = 100%` and `completed_at` timestamps).
* **Deadline Hierarchy Rules**: Superior deadline overrides and subordinate modification restrictions.
* **Universal File Attachments**: Attach and preview documents across formats (PDF, XLSX, DOCX, CSV, PPTX, PNG, JPG, ZIP).
* **Task Voice Notes**: Integrated audio recording and playback on tasks for fast voice briefing.

### 3. 🛡 Hierarchical Approvals Hub
* **4-Stage Meeting Approval Flow**: Sequential approval chain (`Employee ➔ Manager ➔ Department Head ➔ Founder`) with automatic status progression.
* **Rejection with Reason Capture**: Approvers can reject requests with mandatory justification captured and dispatched to the requester.
* **Phone Number Change Requests**: Controlled profile update workflow with multi-tier verification.
* **Password Resets**: Administrative password reset and delegation via secure RPCs.

### 4. 🔔 Entity-Aware & State-Aware Notification Engine
* **In-Place Live State Mutation**: When task or meeting status updates, notifications mutate in-place rather than spamming feeds.
* **Fast Action Reconciliation**: Rapid creation and deletion cycles resolve to the authoritative final state.
* **Graceful Snapshot Modals**: Notifications referencing deleted entities open informative snapshot modals instead of triggering navigation crashes.

### 5. 💬 Real-Time Team Communication
* **Scoped Channels**: General, Management, and Department-scoped real-time chat.
* **Executive Direct Channels**: Super Admin 1-to-1 secure direct messaging with Founders.
* **Realtime Delivery**: Backed by Supabase Realtime WebSocket subscriptions with offline caching.

### 6. 📊 Executive Analytics & PDF Reports
* **Performance Metrics**: Real-time aggregation of task completion rates, departmental efficiency, and overdue metrics.
* **Automated PDF Generation**: Generate formatted PDF executive summaries for individual companies or global operations.

### 7. 📝 Personal Notes & Scratchpad
* Safe, auto-saving personal notes feed with inline editor, search, and clipboard integration.

---

## 🛠 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Mobile & Web Framework** | [React Native](https://reactnative.dev/), [Expo (SDK 52)](https://expo.dev/), [Expo Router (v4)](https://docs.expo.dev/router/introduction/) |
| **Language & Typing** | [TypeScript (Strict Mode)](https://www.typescriptlang.org/) |
| **Backend & Database** | [Supabase](https://supabase.com/) (PostgreSQL 15, GoTrue Auth, Storage, Edge Functions, Realtime) |
| **Styling & Design System** | [TailwindCSS / NativeWind](https://www.nativewind.dev/), Custom Slate & Cream Design Tokens |
| **Audio Engine** | `expo-av` |
| **Document & PDF Generation**| `expo-print`, `expo-sharing`, `expo-document-picker` |
| **Typography** | `@expo-google-fonts/roboto` |
| **Performance Lists** | `@shopify/flash-list` |
| **Animations** | `react-native-reanimated`, `react-native-gesture-handler` |

---

## 📁 Repository Structure

```
zerotask/
├── app/                        # Expo Router file-based navigation
│   ├── (auth)/                 # Authentication, Login, Pending Approval
│   ├── (drawer)/               # Navigation drawer & main screens
│   │   ├── (superadmin)/       # Super Admin Governance (Companies, Founders, Users, Analytics)
│   │   └── (tabs)/             # Tasks, Approvals, Calendar, Chat, Notes, Notifications, Reports, Profile
│   ├── meeting/                # Meeting detail & management screens
│   ├── project/                # Project overview screens
│   └── task/                   # Task detail & state modals
├── src/
│   ├── components/             # Reusable enterprise UI components
│   │   ├── admin/              # Super Admin management widgets & modals
│   │   ├── approvals/          # Unified Approval Center components
│   │   ├── chat/               # Channel & 1-to-1 chat messaging components
│   │   ├── dashboards/         # Role-specific dashboard views
│   │   ├── tasks/              # Task cards, preview modal, segregation modal
│   │   └── ui/                 # Atomic design elements (Buttons, Inputs, Badges, Headers)
│   ├── context/                # AuthContext, NotificationContext & Global State
│   ├── hooks/                  # Custom hooks (useChat, useDashboards, useReports, etc.)
│   ├── services/               # API, RPC, and business logic services
│   ├── theme/                  # Design tokens, colors, typography
│   ├── types/                  # TypeScript interface definitions
│   └── utils/                  # Permission helpers, attachment pipeline
└── supabase/
    ├── functions/              # Supabase Edge Functions
    └── migrations/             # Versioned SQL migrations & RLS policies
```

---

## ⚙️ Setup & Local Development

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [Expo CLI](https://docs.expo.dev/get-started/installation/)
* [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local migrations)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Rohankc073/Zero-Task.git
cd Zero-Task

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (do not commit this file):
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Database Setup & Migrations
Apply versioned migrations located in `supabase/migrations/` to your Supabase PostgreSQL database.

### 5. Running the App
```bash
# Start the Expo development server
npx expo start -c
```
* Press `a` for Android Emulator / connected device.
* Press `w` for Web browser.
* Scan the QR code using the Expo Go mobile app.

---

## 📱 Building with EAS

To generate standalone APKs or iOS builds using Expo Application Services (EAS):

```bash
# Preview build for Android (APK)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform all
```

---

## 🔒 Security & Data Privacy

* **Zero Environment Leakage**: All `.env*` files, keystores, service accounts, and local credentials are strictly excluded from version control.
* **Row-Level Security (RLS)**: Enforced across 100% of database tables with company-isolated policies and security-definer helper functions.
* **Hardened Deletion**: Complete cascade purging from `public.users`, `auth.users`, `auth.identities`, and `auth.sessions` with zero orphaned records.

---

## 📄 License & Ownership

Developed for **ZeroTask Enterprise**. All rights reserved.
