import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { LineChart, PieChart } from "react-native-gifted-charts";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useAuth } from "../../context/AuthContext";
import { Colors, Layout, Typography } from "../../theme/tokens";
import TaskPreviewModal from "../TaskPreviewModal";
import { ZeroTaskHeader } from "../ZeroTaskHeader";
import { MetricCard } from "../ui/MetricCard";
import { Period, PeriodSelector } from "../ui/PeriodSelector";
import { MetricDrillDownModal } from "./MetricDrillDownModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ── Priority text color helper ───────────────────────────────────
function priorityColor(priority: string): string {
  switch (priority?.toUpperCase()) {
    case "HIGH":
    case "URGENT":
      return Colors.danger;
    case "MEDIUM":
      return Colors.warning;
    default:
      return Colors.success;
  }
}

// ── Due date label helper ────────────────────────────────────────
function dueDateLabel(dateStr?: string | null): {
  label: string;
  color: string;
} {
  if (!dateStr) return { label: "-", color: Colors.textMuted };
  const now = new Date();
  const due = new Date(dateStr);
  const diff = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return { label: "Overdue", color: Colors.danger };
  if (diff === 0) return { label: "Today", color: Colors.danger };
  if (diff <= 3) return { label: `${diff}d left`, color: Colors.warning };
  return {
    label: due.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    color: Colors.textSecondary,
  };
}

// ── Quick Action Button ───────────────────────────────────────────
function QuickAction({
  icon,
  label,
  bg,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.quickAction}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={Colors.textInverse} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Props ─────────────────────────────────────────────────────────
export interface UnifiedDashboardProps {
  // Metrics
  assigned: number;
  inProgress: number;
  completed: number;
  overdue: number;

  // Real Trends (Optional)
  assignedTrend?: number;
  inProgressTrend?: number;
  completedTrend?: number;
  overdueTrend?: number;

  // Task list
  tasks: any[]; // canonical scoped tasks for "My Tasks" and "Task Overview"
  onViewAllTasks?: () => void;

  // Progress
  progressPercent: number; // 0-100

  // Loading
  loading: boolean;

  // Optional: pending approvals alert
  pendingApprovals?: number;
  onApprovalsPress?: () => void;

  // Role label shown in greeting area context
  roleContext?: string;

  // Period synchronization
  period?: Period;
  onPeriodChange?: (period: Period) => void;
  onRefetch?: () => void;
}

// ── Main Unified Dashboard ────────────────────────────────────────
export function UnifiedDashboard({
  assigned,
  inProgress,
  completed,
  overdue,
  assignedTrend,
  inProgressTrend,
  completedTrend,
  overdueTrend,
  tasks,
  onViewAllTasks,
  progressPercent,
  loading,
  pendingApprovals = 0,
  onApprovalsPress,
  roleContext,
  period: controlledPeriod,
  onPeriodChange,
  onRefetch,
}: UnifiedDashboardProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [internalPeriod, setInternalPeriod] = useState<Period>("All Time");
  const [drillDownMetric, setDrillDownMetric] = useState<string | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState<any[]>(tasks);

  React.useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const handleTaskUpdated = (updated: any) => {
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
    );
    onRefetch?.();
  };

  const period =
    controlledPeriod !== undefined ? controlledPeriod : internalPeriod;
  const setPeriod = onPeriodChange || setInternalPeriod;

  const firstName =
    profile?.full_name?.split(" ")[0] ||
    profile?.email?.split("@")[0] ||
    "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  const total = assigned;

  // Filter tasks for drill-down modal
  const getDrillDownTasks = () => {
    if (!drillDownMetric) return [];
    const sourceTasks = localTasks;
    switch (drillDownMetric) {
      case "In Progress":
        return sourceTasks.filter((t) => t.status === "In Progress");
      case "Completed":
        return sourceTasks.filter(
          (t) => t.status === "Done" || t.status === "Completed",
        );
      case "Overdue":
        return sourceTasks
          .filter(
            (t) =>
              t.due_date &&
              new Date(t.due_date) < new Date() &&
              t.status !== "Done" &&
              t.status !== "Completed",
          )
          .sort(
            (a, b) =>
              (a.due_date ? new Date(a.due_date).getTime() : 0) -
              (b.due_date ? new Date(b.due_date).getTime() : 0),
          );
      case "Pending":
        return sourceTasks.filter(
          (t) => t.status === "To Do" || t.status === "Pending",
        );
      case "Assigned":
      default:
        return sourceTasks;
    }
  };
  const drillDownTasks = getDrillDownTasks();

  // Donut chart data
  const donutData = [
    { value: completed, color: Colors.chartCompleted, text: "" },
    { value: inProgress, color: Colors.chartInProgress, text: "" },
    {
      value: Math.max(0, assigned - inProgress - completed),
      color: Colors.chartPending,
      text: "",
    },
    { value: overdue, color: Colors.chartOverdue, text: "" },
  ].filter((d) => d.value > 0);

  if (donutData.length === 0) {
    donutData.push({ value: 1, color: Colors.borderSubtle, text: "" });
  }

  // Progress sparkline
  const sparkData = [
    { value: Math.max(0, progressPercent - 20) },
    { value: Math.max(0, progressPercent - 15) },
    { value: Math.max(0, progressPercent - 8) },
    { value: progressPercent - 3 },
    { value: progressPercent - 5 },
    { value: progressPercent - 2 },
    { value: progressPercent },
    { value: progressPercent + 2 },
    { value: progressPercent + 5 },
  ].map((d) => ({ value: Math.min(100, Math.max(0, d.value)) }));

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const tabItems = [
    { key: "All", label: "All", count: tasks.length },
    {
      key: "In Progress",
      label: "In Progress",
      count: tasks.filter((t) => t.status === "In Progress").length,
    },
    {
      key: "Pending",
      label: "Pending",
      count: tasks.filter((t) => t.status === "To Do" || t.status === "Pending")
        .length,
    },
    {
      key: "Completed",
      label: "Completed",
      count: tasks.filter(
        (t) => t.status === "Done" || t.status === "Completed",
      ).length,
    },
    {
      key: "Overdue",
      label: "Overdue",
      count: tasks.filter(
        (t) =>
          t.due_date &&
          new Date(t.due_date) < new Date() &&
          t.status !== "Done" &&
          t.status !== "Completed",
      ).length,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <ZeroTaskHeader />

      {/* Pending Approvals Banner */}
      {pendingApprovals > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={onApprovalsPress}>
          <Ionicons
            name="warning-outline"
            size={16}
            color={Colors.warningText}
          />
          <Text style={styles.alertText}>
            {pendingApprovals} pending approval
            {pendingApprovals !== 1 ? "s" : ""} need your attention
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={Colors.warningText}
          />
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting ── */}
        <Animated.View
          entering={FadeInUp.delay(50).duration(300)}
          style={styles.greetingRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {greeting}, {firstName}! 👋
            </Text>
            <Text style={styles.greetingSubtitle}>
              Let's get things done today.
            </Text>
          </View>
          <PeriodSelector value={period} onChange={setPeriod} />
        </Animated.View>

        {/* ── Metric Cards ── */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricsRow}
          >
            <MetricCard
              icon="clipboard-outline"
              iconColor={Colors.primary}
              iconBg={Colors.primaryLight}
              value={assigned}
              label="Assigned"
              trend={assignedTrend}
              onPress={() => setDrillDownMetric("Assigned")}
            />
            <MetricCard
              icon="trending-up-outline"
              iconColor={Colors.info}
              iconBg={Colors.infoLight}
              value={inProgress}
              label="In Progress"
              trend={inProgressTrend}
              onPress={() => setDrillDownMetric("In Progress")}
            />
            <MetricCard
              icon="checkmark-circle-outline"
              iconColor={Colors.success}
              iconBg={Colors.successLight}
              value={completed}
              label="Completed"
              trend={completedTrend}
              onPress={() => setDrillDownMetric("Completed")}
            />
            <MetricCard
              icon="alert-circle-outline"
              iconColor={Colors.danger}
              iconBg={Colors.dangerLight}
              value={overdue}
              label="Overdue"
              trend={overdueTrend}
              onPress={() => setDrillDownMetric("Overdue")}
            />
          </ScrollView>
        </Animated.View>

        {/* ── Task Overview Card ── */}
        <Animated.View
          entering={FadeInUp.delay(150).duration(300)}
          style={styles.card}
        >
          {/* Card header */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Task Overview</Text>
            <PeriodSelector value={period} onChange={setPeriod} />
          </View>

          {total === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="clipboard-outline"
                size={32}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>No tasks yet</Text>
            </View>
          ) : (
            <View style={styles.overviewContent}>
              {/* Donut Chart */}
              <View style={styles.donutWrapper}>
                <PieChart
                  data={donutData}
                  donut
                  radius={64}
                  innerRadius={44}
                  centerLabelComponent={() => (
                    <View style={styles.donutCenter}>
                      <Text style={styles.donutNumber}>{total}</Text>
                      <Text style={styles.donutLabel}>Total Tasks</Text>
                    </View>
                  )}
                  focusOnPress={false}
                />
              </View>

              {/* Legend */}
              <View style={styles.legend}>
                {[
                  {
                    label: "Completed",
                    metric: "Completed",
                    count: completed,
                    color: Colors.chartCompleted,
                  },
                  {
                    label: "In Progress",
                    metric: "In Progress",
                    count: inProgress,
                    color: Colors.chartInProgress,
                  },
                  {
                    label: "Pending",
                    metric: "Pending",
                    count: Math.max(
                      0,
                      assigned - inProgress - completed - overdue,
                    ),
                    color: Colors.chartPending,
                  },
                  {
                    label: "Overdue",
                    metric: "Overdue",
                    count: overdue,
                    color: Colors.chartOverdue,
                  },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.legendRow}
                    activeOpacity={0.7}
                    onPress={() => setDrillDownMetric(item.metric)}
                  >
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={styles.legendLabel}>{item.label}</Text>
                    <Text style={styles.legendValue}>
                      {item.count} (
                      {total > 0 ? Math.round((item.count / total) * 100) : 0}%)
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── Progress Overview ── */}
        <Animated.View
          entering={FadeInUp.delay(250).duration(300)}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Progress Overview</Text>
            <PeriodSelector value={period} onChange={setPeriod} />
          </View>

          <Text style={styles.progressPercent}>{progressPercent}%</Text>
          <Text style={styles.progressLabel}>Overall Progress</Text>
          {completedTrend !== undefined && (
            <View style={styles.progressTrendRow}>
              <Ionicons
                name={completedTrend >= 0 ? "arrow-up" : "arrow-down"}
                size={12}
                color={completedTrend >= 0 ? Colors.success : Colors.danger}
              />
              <Text
                style={[
                  styles.progressTrend,
                  {
                    color: completedTrend >= 0 ? Colors.success : Colors.danger,
                  },
                ]}
              >
                {` ${Math.abs(completedTrend)}% vs previous period`}
              </Text>
            </View>
          )}

          <View style={{ marginTop: Layout.spacing.md, marginHorizontal: -4 }}>
            <LineChart
              data={sparkData}
              width={SCREEN_WIDTH - 72}
              height={80}
              hideDataPoints={false}
              dataPointsColor={Colors.primary}
              color={Colors.primary}
              thickness={2}
              startFillColor={Colors.primaryLight}
              endFillColor="transparent"
              areaChart
              curved
              hideYAxisText
              hideAxesAndRules
              adjustToWidth
              initialSpacing={0}
              endSpacing={0}
              backgroundColor="transparent"
            />
          </View>
        </Animated.View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Drill-down Modal */}
      <MetricDrillDownModal
        visible={!!drillDownMetric}
        onClose={() => setDrillDownMetric(null)}
        metricTitle={drillDownMetric ? `${drillDownMetric} Tasks` : "Tasks"}
        tasks={drillDownTasks}
        period={period}
        onSelectTask={(id) => setPreviewTaskId(id)}
      />

      {/* Task Preview Modal */}
      <TaskPreviewModal
        visible={!!previewTaskId}
        onClose={() => {
          setPreviewTaskId(null);
          onRefetch?.();
        }}
        taskId={previewTaskId || ""}
        onTaskUpdated={handleTaskUpdated}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.spacing.lg,
    paddingBottom: 32,
    gap: Layout.spacing.lg,
  },

  // Greeting
  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Layout.spacing.sm,
  },
  greeting: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  greetingSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Metrics
  metricsRow: {
    flexDirection: "row",
    gap: Layout.spacing.sm,
    paddingRight: Layout.spacing.lg,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.lg,
    ...Layout.shadow.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Layout.spacing.md,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },

  // Task Overview
  overviewContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.spacing.lg,
  },
  donutWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: {
    alignItems: "center",
  },
  donutNumber: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 22,
    color: Colors.textPrimary,
  },
  donutLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 9,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  legend: {
    flex: 1,
    gap: Layout.spacing.xs,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  legendValue: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
  },

  // Tasks
  section: {
    gap: 0,
  },
  taskList: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: "hidden",
    ...Layout.shadow.card,
    marginBottom: Layout.spacing.sm,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: Layout.spacing.sm,
  },
  taskIcon: {
    width: 30,
    height: 30,
    borderRadius: Layout.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    marginBottom: 1,
  },
  taskProject: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  taskPriority: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
  },
  taskDate: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    minWidth: 48,
    textAlign: "right",
  },
  addTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.spacing.xs,
    paddingVertical: Layout.spacing.sm,
    marginTop: 4,
  },
  addTaskText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },

  // Progress
  progressPercent: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 36,
    color: Colors.textPrimary,
    lineHeight: 40,
  },
  progressLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  progressTrendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  progressTrend: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    color: Colors.success,
  },

  // Quick Actions
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Layout.spacing.md,
    marginTop: Layout.spacing.sm,
  },
  quickAction: {
    alignItems: "center",
    gap: Layout.spacing.xs,
    width: (SCREEN_WIDTH - 2 * Layout.spacing.lg - 4 * Layout.spacing.md) / 5,
    minWidth: 56,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // Empty states
  emptyState: {
    alignItems: "center",
    paddingVertical: Layout.spacing.xl,
    gap: Layout.spacing.sm,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
  },

  // Alert banner
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.warningLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warning,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.sm,
    gap: Layout.spacing.sm,
  },
  alertText: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.warningText,
  },
});
