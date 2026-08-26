# ZeroTask — Enterprise Execution & Workforce Operating System

<div align="center">
  <img src="assets/images/icon.png" width="100" height="100" alt="ZeroTask Logo" style="border-radius: 20px;"/>
  <br/><br/>
  <p><strong>A high-performance, hierarchical workforce orchestration and task execution engine designed for modern enterprises.</strong></p>
</div>

---

## 📌 Overview

**ZeroTask** is an enterprise-grade mobile and web execution platform built to streamline task delegation, hierarchical approvals, real-time communication, and executive oversight. With strict multi-tenant data isolation, forensic audit trails, and an entity-aware notification engine, ZeroTask eliminates operational bottlenecks between executive founders, department heads, managers, and frontline execution teams.

---

## 🏛 Hierarchical Role Architecture

ZeroTask enforces strict Role-Based Access Control (RBAC) and Row Level Security (RLS) across four distinct organizational tiers:

```
                          ┌───────────────────────────┐
                          │          FOUNDER          │
                          │ Universal Org Oversight   │
                          └─────────────┬─────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │      DEPARTMENT HEAD      │
                          │ Department-Wide Governance│
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

* **Founder**: Complete cross-departmental visibility, organizational audit logs, company-wide metrics, and final escalation approvals.
* **Department Head**: Cross-team management within their department, workload distribution, meeting governance, and supervisory approvals.
* **Manager**: Day-to-day task assignment, task segregation, employee progress tracking, and direct approval requests.
* **Employee**: Focused task execution, subtask delegation, status management, notes, and activity feeds.

---

## 🚀 Key Features & Modules

### 1. 🔔 Entity-Aware & State-Aware Notification Engine
* **Live In-Place State Mutation**: When an entity's status changes (e.g., *Created* ➔ *In Progress* ➔ *Deadline Updated* ➔ *Completed* ➔ *Deleted*), the notification updates in-place for every recipient rather than flooding feeds with stale duplicates.
* **Fast Action Handling**: If a task is created and immediately completed or deleted before a manager opens the app, the notification feed displays the final authoritative state.
* **Safe Deleted Task Handling**: Tapping a notification for a deleted task opens a graceful snapshot modal (Task Title, Deleted By, Deletion Time, Department) instead of triggering technical error screens.

### 2. 🛡 Hierarchical Approvals Hub
* **User Onboarding Approvals**: Secure verification before granting organizational access.
* **Password Resets**: Multi-tier forgot password verification (Employee ➔ Manager ➔ Department Head ➔ Founder).
* **Phone Number Change Requests**: Structured verification routing with requester metadata and department tags.
* **Task Review Approvals**: Formal submission and approval workflows for high-stakes deliverables.

### 3. 🧩 Task Decomposition & Segregation
* Break complex parent tasks into subtasks assigned across teams or supervisors.
* Real-time upward delegation alerts and founder oversight notifications.

### 4. 📅 Meeting Management & Scheduling
* Integrated meeting scheduler with attendee role assignment and agenda tracking.
* Universal document attachments (PDF, DOCX, XLSX, images).

### 5. 💬 Scoped Team Chat & Activity Feed
* Department-scoped channels and real-time team collaboration.
* Immutable audit logging and activity timelines for regulatory compliance.

### 6. 📝 Personal Notes & Scratchpad
* Safe, auto-saving personal notes feed with inline editor and clipboard integration.

---

## 🛠 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Mobile & Web Framework** | [React Native](https://reactnative.dev/), [Expo (SDK 52)](https://expo.dev/), [Expo Router (v4)](https://docs.expo.dev/router/introduction/) |
| **Language & Typing** | [TypeScript (Strict Mode)](https://www.typescriptlang.org/) |
| **Backend & Database** | [Supabase](https://supabase.com/) (PostgreSQL 15, Auth, Storage, Edge Functions, Realtime) |
| **Styling & Design System** | [TailwindCSS / NativeWind](https://www.nativewind.dev/), Custom Cream & Slate Theme Tokens |
| **Typography** | `@expo-google-fonts/roboto` |
| **Performance Lists** | `@shopify/flash-list` |
| **Animations** | `react-native-reanimated`, `react-native-gesture-handler` |

---

## 📁 Repository Structure

```
zerotask/
├── app/                        # Expo Router file-based navigation
│   ├── (auth)/                 # Authentication, Login, Register, Onboarding
│   ├── (drawer)/               # Navigation drawer & main tabs
│   │   └── (tabs)/             # Home, Tasks, Approvals, Chat, Notes, Notifications, Profile
│   ├── meeting/                # Dedicated meeting screens
│   ├── project/                # Project overview screens
│   └── task/                   # Task detail & state modals
├── src/
│   ├── components/             # Reusable enterprise UI components
│   │   ├── dashboards/         # Role-specific dashboard views (Founder, Manager, etc.)
│   │   ├── activity/           # Activity feed cards & timelines
│   │   ├── ui/                 # Atomic design elements (Buttons, Inputs, Badges)
│   │   └── TaskPreviewModal.tsx# Task detail & subtask management modal
│   ├── context/                # AuthContext & Application State
│   ├── hooks/                  # Custom hooks (useInAppNotifications, useReports, useChat, etc.)
│   ├── services/               # API & business logic services
│   ├── theme/                  # Design tokens, colors, typography
│   └── types/                  # TypeScript interface definitions
└── supabase/
    ├── functions/              # Supabase Edge Functions (push alerts, escalation)
    └── migrations/             # Versioned SQL migrations & RLS policies
```

---

## ⚙️ Setup & Local Development

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [Expo CLI](https://docs.expo.dev/get-started/installation/)
* [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for migrations)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Rohankc073/Zero-Task.git
cd Zero-Task

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Database Migrations (Optional)
To push the versioned migrations to your Supabase instance:
```bash
npx supabase db push --include-all
```

### 5. Running the App
```bash
# Start the Expo development server
npx expo start -c
```
* Scan the QR code using Expo Go on Android / iOS, or press `a` for Android Emulator, `w` for Web.

---

## 📱 Building with EAS

To generate production APKs or iOS builds using Expo Application Services (EAS):

```bash
# Preview build for Android (APK)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform all
```

---

## 🔒 Security & Data Privacy

* All credentials (`.env*`, keystores, private keys, service accounts) are strictly omitted from version control.
* Every database query is protected with PostgreSQL Row Level Security (RLS) guaranteeing tenant and departmental data isolation.

---

## 📄 License & Ownership

Developed for **ZeroTask Enterprise**. All rights reserved.
