
// ─────────────────────────────────────────────
//  ZeroTask Design System - Central Token Store
//  Restored Clean White / Light Blue Enterprise SaaS Theme
// ─────────────────────────────────────────────

export const Colors = {
  // ── Backgrounds ──
  background: "#F8F9FA", // Clean white-gray
  canvas: "#F8F9FA", // Alias for background
  surface: "#FFFFFF", // Pure white card/panel
  surfaceSecondary: "#F1F3F5",
  surfaceSubtle: "#F8F9FA",
  surfaceRaised: "#FFFFFF",

  // ── Borders ──
  borderSubtle: "#E5E7EB", // Light border
  borderDefault: "#E5E7EB", // Default input border
  borderStrong: "#D1D5DB", // Focus / active border

  // ── Typography ──
  textPrimary: "#111827", // Dark navy - headings, body
  textSecondary: "#6B7280", // Secondary - labels, subtitles
  textMuted: "#9CA3AF", // Placeholders, disabled text
  textInverse: "#FFFFFF", // White text on dark bg

  // ── Primary (Blue) ──
  primary: "#3B82F6", // Clean business blue
  primaryLight: "#EFF6FF", // Tinted blue bg for active items
  primaryDark: "#1D4ED8", // Darker blue
  primaryText: "#3B82F6",

  // ── Status / Semantic ──
  success: "#10B981", // Green - Completed
  successLight: "#ECFDF5",
  successText: "#047857",

  warning: "#F59E0B", // Amber/Orange - In Progress / Pending
  warningLight: "#FFFBEB",
  warningText: "#B45309",

  danger: "#EF4444", // Red - Overdue
  dangerLight: "#FEF2F2",
  dangerText: "#B91C1C",

  info: "#6366F1", // Indigo/Purple - Informational
  infoLight: "#EEF2FF",
  infoText: "#4338CA",

  // ── Priority Chips ──
  priorityHighBg: "#FEF2F2",
  priorityHighText: "#EF4444",
  priorityHighBorder: "#FEE2E2",

  priorityMedBg: "#EFF6FF",
  priorityMedText: "#3B82F6",
  priorityMedBorder: "#DBEAFE",

  priorityLowBg: "#ECFDF5",
  priorityLowText: "#10B981",
  priorityLowBorder: "#D1FAE5",

  priorityUrgentBg: "#FEF2F2",
  priorityUrgentText: "#EF4444",
  priorityUrgentBorder: "#FEE2E2",

  // ── Status Tags ──
  statusTodoBg: "#F3F4F6",
  statusTodoText: "#4B5563",
  statusProgressBg: "#EFF6FF",
  statusProgressText: "#1D4ED8",
  statusDoneBg: "#ECFDF5",
  statusDoneText: "#047857",
  statusBlockedBg: "#FEF2F2",
  statusBlockedText: "#B91C1C",

  // ── Chart Colors ──
  chartCompleted: "#10B981",
  chartInProgress: "#3B82F6",
  chartPending: "#9CA3AF",
  chartOverdue: "#EF4444",

  // ── Sidebar (Dark Navy Sidebar) ──
  sidebarBg: "#1E293B",
  sidebarActive: "#3B82F6",
  sidebarActiveBg: "rgba(59,130,246,0.08)",
  sidebarText: "#94A3B8",
  sidebarTextActive: "#F8FAFC",
  sidebarMuted: "#475569",

  // ── Backward compatibility aliases ──
  surfaceMuted: "#F3F4F6",
  accentBlue: "#3B82F6",
  semanticSage: "#10B981",
  semanticBlue: "#3B82F6",
  semanticPeach: "#EF4444",
  semanticYellow: "#F59E0B",
  semanticCoral: "#3B82F6",
  semanticBeige: "#F3F4F6",
  semanticTerracotta: "#3B82F6",
};

export const Typography = {
  fontFamily: {
    regular: "Roboto_400Regular",
    medium: "Roboto_500Medium",
    semiBold: "Roboto_500Medium",
    bold: "Roboto_700Bold",
    serif: "Roboto_700Bold",
    mono: "Roboto_500Medium",
  },
  fontSize: {
    xs: 9,
    sm: 10,
    base: 11,
    md: 12,
    lg: 14,
    xl: 16,
    xxl: 20,
    display: 26,
    metric: 28,
  },
  letterSpacing: {
    tight: -0.4,
    normal: 0,
    wide: 0.3,
  },
  lineHeight: {
    xs: 14,
    sm: 16,
    base: 20,
    md: 22,
    lg: 24,
    xl: 28,
    xxl: 32,
    display: 38,
  },
};

export const Layout = {
  radius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 20,
    full: 9999,
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    section: 28,
  },
  shadow: {
    card: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    modal: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 6,
    },
    none: {
      shadowColor: "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
};
