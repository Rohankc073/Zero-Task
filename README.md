# ZeroTask

**ZeroTask** is a premium, enterprise-grade execution engine designed to help high-performing tech teams scale operations and track ROI seamlessly. Built with strict data isolation and role-based access, it provides an exclusive, frictionless environment for internal task management and team collaboration.

---

## 🚀 Core Features

*   **Enterprise Architecture:** Complete Role-Based Access Control (RBAC) separating Founders, Managers, and Employees using strict Supabase Row Level Security (RLS).
*   **Executive ROI Dashboards:** Dedicated milestone tracking with gamified over-achievement triggers to visually prove value and team performance.
*   **Global Chat Hub:** Real-time, company-wide communication silo with a strict 30-day retention policy.
*   **Frictionless Onboarding:** Multi-step organizational setup with a built-in enterprise paywall gateway.
*   **Immutable Audit Trail:** Comprehensive action logging for ultimate accountability.

## 🛠 Tech Stack

*   **Frontend:** React Native, Expo Router, TypeScript
*   **Backend & Database:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
*   **UI/UX:** `@gorhom/bottom-sheet`, `react-native-reanimated`, custom premium design system (Cream, Dark, Gold)

---

## ⚙️ Local Development

**1. Clone the repository:**
```bash
git clone https://github.com/Rohankc073/Zero-Task.git
cd Zero-Task
```

**2. Install dependencies:**
```bash
npm install
```

**3. Environment Setup:**
Create a `.env` file in the root directory and securely add your Supabase connection keys:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

**4. Run the application:**
```bash
npx expo start
```
