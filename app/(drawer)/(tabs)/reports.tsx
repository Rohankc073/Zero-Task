import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { isFounder, isSuperAdmin, isExecutiveOrAdmin, isDepartmentHead, isManager } from '../../../src/utils/permissions';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Period, PeriodSelector } from '../../../src/components/ui/PeriodSelector';
import { useReports } from '../../../src/hooks/useReports';
import { ReportPDFGenerator } from '../../../src/services/reports/ReportPDFGenerator';
import { MetricDrillDownModal } from '../../../src/components/dashboards/MetricDrillDownModal';
import TaskPreviewModal from '../../../src/components/TaskPreviewModal';
import { Avatar } from '../../../src/components/ui/Avatar';
import { AnimatedPressable } from '../../../src/components/ui/AnimatedPressable';

export default function ReportsScreen() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<Period>('All Time');
  const [exporting, setExporting] = useState(false);

  // Drill-down state
  const [drillDownTitle, setDrillDownTitle] = useState<string | null>(null);
  const [drillDownTasks, setDrillDownTasks] = useState<any[]>([]);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  // Filter selection modal
  const [showFilterModal, setShowFilterModal] = useState(false);

  const {
    loading,
    error,
    filters,
    updateFilter,
    resetFilters,
    reportData,
    departments,
    refetch,
  } = useReports(period);

  const userRole = profile?.role || 'Employee';
  const isExecAdmin = isExecutiveOrAdmin(profile);
  const isFounder = userRole === 'Founder';
  const isDeptHead = userRole === 'Department Head';
  const isManager = userRole === 'Manager';

  // Handle PDF Export
  const handleExportPDF = async () => {
    if (exporting || loading) return;
    setExporting(true);
    try {
      await ReportPDFGenerator.exportPDF(reportData, userRole);
    } catch (err: any) {
      console.error('Error generating PDF report:', err);
      Alert.alert('Export Failed', err.message || 'Could not generate report PDF.');
    } finally {
      setExporting(false);
    }
  };

  // Open drill-down for a set of tasks
  const openDrillDown = (title: string, tasks: any[]) => {
    setDrillDownTitle(title);
    setDrillDownTasks(tasks);
  };

  const { summary, progressDistribution, overdueAnalysis, departmentPerformance, teamPerformance, individualPerformance, priorityAnalysis, scopeAnalysis, selfAssignedAnalysis, filteredTasks } = reportData;

  const hasActiveFilters = !!(filters.departmentId || filters.priority || filters.status || filters.scope);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />
        }
      >
        {/* ── Top Header Section ── */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View>
              <Text style={styles.title}>Reports & Analytics</Text>
              <Text style={styles.subtitle}>
                {isExecAdmin
                  ? 'Organization-wide executive metrics'
                  : isDeptHead
                  ? 'Department performance & execution'
                  : 'Team workflow & execution reports'}
              </Text>
            </View>

            <AnimatedPressable
              style={[styles.exportBtn, (exporting || loading) && styles.exportBtnDisabled]}
              onPress={handleExportPDF}
              disabled={exporting || loading}
              scaleTo={0.96}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={16} color={Colors.textInverse} />
                  <Text style={styles.exportBtnText}>Export PDF</Text>
                </>
              )}
            </AnimatedPressable>
          </View>

          {/* Period Selector */}
          <View style={styles.periodRow}>
            <PeriodSelector
              value={period}
              onChange={(p: Period) => setPeriod(p)}
            />
          </View>

          {/* Filter Bar */}
          <View style={styles.filterRow}>
            <AnimatedPressable
              style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
              onPress={() => setShowFilterModal(true)}
              scaleTo={0.95}
            >
              <Ionicons
                name="filter-outline"
                size={14}
                color={hasActiveFilters ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.filterButtonText, hasActiveFilters && styles.filterButtonTextActive]}>
                Filters {hasActiveFilters ? '(Active)' : ''}
              </Text>
            </AnimatedPressable>

            {hasActiveFilters && (
              <AnimatedPressable
                style={styles.clearFilterBtn}
                onPress={resetFilters}
                scaleTo={0.95}
              >
                <Text style={styles.clearFilterText}>Reset</Text>
              </AnimatedPressable>
            )}

            {/* Quick Active Filter Badges */}
            {filters.departmentId && (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>
                  Dept: {departments.find(d => d.id === filters.departmentId)?.name || 'General'}
                </Text>
              </View>
            )}
            {filters.priority && (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Priority: {filters.priority}</Text>
              </View>
            )}
            {filters.status && (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Status: {filters.status}</Text>
              </View>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Compiling report data...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
            <Text style={styles.errorTitle}>Failed to Load Reports</Text>
            <Text style={styles.errorSubtitle}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── 1. Executive Summary KPIs ── */}
            <Animated.View entering={FadeInDown.duration(280).delay(50)}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Executive Summary</Text>
                <Text style={styles.sectionSubtitle}>{summary.totalTasks} distinct tasks in scope</Text>
              </View>

              <View style={styles.kpiGrid}>
                <AnimatedPressable
                  style={styles.kpiCard}
                  onPress={() => openDrillDown('All Scoped Tasks', filteredTasks)}
                  scaleTo={0.96}
                >
                  <Text style={styles.kpiLabel}>Total Tasks</Text>
                  <Text style={styles.kpiValue}>{summary.totalTasks}</Text>
                  <Text style={styles.kpiSub}>100% of workload</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={styles.kpiCard}
                  onPress={() => openDrillDown('Active Tasks', filteredTasks.filter(t => t.status === 'In Progress' || t.status === 'To Do'))}
                  scaleTo={0.96}
                >
                  <Text style={styles.kpiLabel}>Active Workload</Text>
                  <Text style={[styles.kpiValue, { color: Colors.primary }]}>{summary.activeTasks}</Text>
                  <Text style={styles.kpiSub}>{summary.inProgressTasks} in progress · {summary.toDoTasks} to do</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={styles.kpiCard}
                  onPress={() => openDrillDown('Completed Tasks', filteredTasks.filter(t => t.status === 'Done' || t.status === 'Completed'))}
                  scaleTo={0.96}
                >
                  <Text style={styles.kpiLabel}>Completed</Text>
                  <Text style={[styles.kpiValue, { color: Colors.success }]}>{summary.completedTasks}</Text>
                  <Text style={styles.kpiSub}>{summary.completionRate}% completion rate</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={[styles.kpiCard, summary.overdueTasks > 0 && styles.kpiCardOverdue]}
                  onPress={() => openDrillDown('Overdue Tasks', filteredTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done' && t.status !== 'Completed'))}
                  scaleTo={0.96}
                >
                  <Text style={[styles.kpiLabel, summary.overdueTasks > 0 && { color: Colors.danger }]}>Overdue</Text>
                  <Text style={[styles.kpiValue, { color: summary.overdueTasks > 0 ? Colors.danger : Colors.textPrimary }]}>
                    {summary.overdueTasks}
                  </Text>
                  <Text style={styles.kpiSub}>Requires action</Text>
                </AnimatedPressable>
              </View>
            </Animated.View>

            {/* Secondary KPIs Row */}
            <View style={styles.secondaryKpiRow}>
              <View style={styles.secKpiCard}>
                <Text style={styles.secKpiLabel}>Average Progress</Text>
                <Text style={styles.secKpiValue}>{summary.avgProgress}%</Text>
                <View style={styles.miniProgressTrack}>
                  <View style={[styles.miniProgressFill, { width: `${summary.avgProgress}%` }]} />
                </View>
              </View>

              <View style={styles.secKpiCard}>
                <Text style={styles.secKpiLabel}>Deadline Adherence</Text>
                <Text style={[styles.secKpiValue, { color: summary.deadlineAdherenceRate >= 80 ? Colors.success : Colors.warning }]}>
                  {summary.deadlineAdherenceRate}%
                </Text>
                <Text style={styles.secKpiSub}>
                  {summary.onTimeCompletions} on time · {summary.lateCompletions} late
                </Text>
              </View>

              <View style={styles.secKpiCard}>
                <Text style={styles.secKpiLabel}>Remaining Backlog</Text>
                <Text style={styles.secKpiValue}>{summary.remainingTasks}</Text>
                <Text style={styles.secKpiSub}>Unresolved work</Text>
              </View>
            </View>

            {/* ── 2. Task Progress Distribution ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Task Progress Breakdown</Text>
                <Text style={styles.cardBadge}>{summary.totalTasks} tasks</Text>
              </View>

              <View style={styles.progressBrackets}>
                <View style={styles.bracketRow}>
                  <Text style={styles.bracketLabel}>0% (Not Started)</Text>
                  <View style={styles.bracketTrack}>
                    <View style={[styles.bracketFill, { width: `${summary.totalTasks > 0 ? (progressDistribution.zero / summary.totalTasks) * 100 : 0}%`, backgroundColor: Colors.borderStrong }]} />
                  </View>
                  <Text style={styles.bracketValue}>{progressDistribution.zero}</Text>
                </View>

                <View style={styles.bracketRow}>
                  <Text style={styles.bracketLabel}>1% – 25% (Initial)</Text>
                  <View style={styles.bracketTrack}>
                    <View style={[styles.bracketFill, { width: `${summary.totalTasks > 0 ? (progressDistribution.tier1 / summary.totalTasks) * 100 : 0}%`, backgroundColor: '#93c5fd' }]} />
                  </View>
                  <Text style={styles.bracketValue}>{progressDistribution.tier1}</Text>
                </View>

                <View style={styles.bracketRow}>
                  <Text style={styles.bracketLabel}>26% – 50% (Midway)</Text>
                  <View style={styles.bracketTrack}>
                    <View style={[styles.bracketFill, { width: `${summary.totalTasks > 0 ? (progressDistribution.tier2 / summary.totalTasks) * 100 : 0}%`, backgroundColor: '#60a5fa' }]} />
                  </View>
                  <Text style={styles.bracketValue}>{progressDistribution.tier2}</Text>
                </View>

                <View style={styles.bracketRow}>
                  <Text style={styles.bracketLabel}>51% – 75% (Advanced)</Text>
                  <View style={styles.bracketTrack}>
                    <View style={[styles.bracketFill, { width: `${summary.totalTasks > 0 ? (progressDistribution.tier3 / summary.totalTasks) * 100 : 0}%`, backgroundColor: '#3b82f6' }]} />
                  </View>
                  <Text style={styles.bracketValue}>{progressDistribution.tier3}</Text>
                </View>

                <View style={styles.bracketRow}>
                  <Text style={styles.bracketLabel}>76% – 99% (Final Phase)</Text>
                  <View style={styles.bracketTrack}>
                    <View style={[styles.bracketFill, { width: `${summary.totalTasks > 0 ? (progressDistribution.tier4 / summary.totalTasks) * 100 : 0}%`, backgroundColor: '#1d4ed8' }]} />
                  </View>
                  <Text style={styles.bracketValue}>{progressDistribution.tier4}</Text>
                </View>

                <View style={styles.bracketRow}>
                  <Text style={[styles.bracketLabel, { color: Colors.success, fontFamily: Typography.fontFamily.semiBold }]}>100% (Completed)</Text>
                  <View style={styles.bracketTrack}>
                    <View style={[styles.bracketFill, { width: `${summary.totalTasks > 0 ? (progressDistribution.complete / summary.totalTasks) * 100 : 0}%`, backgroundColor: Colors.success }]} />
                  </View>
                  <Text style={[styles.bracketValue, { color: Colors.success, fontFamily: Typography.fontFamily.bold }]}>{progressDistribution.complete}</Text>
                </View>
              </View>
            </View>

            {/* ── 3. Overdue Duration & Impact ── */}
            <View style={[styles.card, overdueAnalysis.totalOverdue > 0 && styles.cardOverdue]}>
              <View style={styles.cardHeader}>
                <View style={styles.overdueTitleRow}>
                  <Ionicons name="warning-outline" size={18} color={Colors.danger} />
                  <Text style={[styles.cardTitle, { color: Colors.danger, marginLeft: 6 }]}>Overdue Duration Analysis</Text>
                </View>
                <Text style={styles.overdueBadge}>{overdueAnalysis.totalOverdue} Total</Text>
              </View>

              <View style={styles.durationGrid}>
                <View style={styles.durationItem}>
                  <Text style={styles.durationNum}>{overdueAnalysis.oneDay}</Text>
                  <Text style={styles.durationLabel}>1 Day</Text>
                </View>
                <View style={styles.durationItem}>
                  <Text style={styles.durationNum}>{overdueAnalysis.twoToThreeDays}</Text>
                  <Text style={styles.durationLabel}>2–3 Days</Text>
                </View>
                <View style={styles.durationItem}>
                  <Text style={styles.durationNum}>{overdueAnalysis.fourToSevenDays}</Text>
                  <Text style={styles.durationLabel}>4–7 Days</Text>
                </View>
                <View style={styles.durationItem}>
                  <Text style={styles.durationNum}>{overdueAnalysis.eightToFourteenDays}</Text>
                  <Text style={styles.durationLabel}>8–14 Days</Text>
                </View>
                <View style={[styles.durationItem, { backgroundColor: '#fee2e2' }]}>
                  <Text style={[styles.durationNum, { color: '#991b1b' }]}>{overdueAnalysis.fifteenPlusDays}</Text>
                  <Text style={[styles.durationLabel, { color: '#991b1b', fontWeight: '700' }]}>15+ Days</Text>
                </View>
              </View>
            </View>

            {/* ── 4. Department Performance ── */}
            {departmentPerformance.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Department Performance</Text>
                  <Text style={styles.cardBadge}>{departmentPerformance.length} Departments</Text>
                </View>

                {departmentPerformance.map((dept) => (
                  <TouchableOpacity
                    key={dept.id}
                    style={styles.deptCard}
                    activeOpacity={0.75}
                    onPress={() => openDrillDown(`${dept.name} Tasks`, filteredTasks.filter(t => (t.department_id || 'general') === dept.id))}
                  >
                    <View style={styles.deptTopRow}>
                      <Text style={styles.deptName}>{dept.name}</Text>
                      <View style={styles.deptBadge}>
                        <Text style={styles.deptBadgeText}>{dept.completionRate}% Rate</Text>
                      </View>
                    </View>

                    <View style={styles.deptMetricsRow}>
                      <View style={styles.deptMetric}>
                        <Text style={styles.deptMetricLabel}>Tasks</Text>
                        <Text style={styles.deptMetricValue}>{dept.totalTasks}</Text>
                      </View>
                      <View style={styles.deptMetric}>
                        <Text style={styles.deptMetricLabel}>Active</Text>
                        <Text style={[styles.deptMetricValue, { color: Colors.primary }]}>{dept.activeTasks}</Text>
                      </View>
                      <View style={styles.deptMetric}>
                        <Text style={styles.deptMetricLabel}>Done</Text>
                        <Text style={[styles.deptMetricValue, { color: Colors.success }]}>{dept.completedTasks}</Text>
                      </View>
                      <View style={styles.deptMetric}>
                        <Text style={styles.deptMetricLabel}>Overdue</Text>
                        <Text style={[styles.deptMetricValue, { color: dept.overdueTasks > 0 ? Colors.danger : Colors.textPrimary }]}>
                          {dept.overdueTasks}
                        </Text>
                      </View>
                      <View style={styles.deptMetric}>
                        <Text style={styles.deptMetricLabel}>Avg Prog</Text>
                        <Text style={styles.deptMetricValue}>{dept.avgProgress}%</Text>
                      </View>
                    </View>

                    <View style={styles.miniProgressTrack}>
                      <View style={[styles.miniProgressFill, { width: `${dept.avgProgress}%`, backgroundColor: dept.completionRate >= 80 ? Colors.success : Colors.primary }]} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── 5. Team / Manager Performance ── */}
            {teamPerformance.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Team Leadership Execution</Text>
                  <Text style={styles.cardBadge}>{teamPerformance.length} Teams</Text>
                </View>

                {teamPerformance.map((team) => (
                  <View key={team.managerId} style={styles.teamRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teamManagerName}>{team.managerName}</Text>
                      <Text style={styles.teamDeptName}>{team.departmentName}</Text>
                    </View>
                    <View style={styles.teamStats}>
                      <Text style={styles.teamStatsText}>
                        {team.completedTasks}/{team.totalTasks} Done · {team.overdueTasks > 0 ? `${team.overdueTasks} Overdue · ` : ''}{team.completionRate}%
                      </Text>
                      <View style={[styles.miniProgressTrack, { width: 100, marginTop: 4 }]}>
                        <View style={[styles.miniProgressFill, { width: `${team.avgProgress}%` }]} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── 6. Priority Breakdown ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Priority Workload</Text>
                <Text style={styles.cardBadge}>All Priorities</Text>
              </View>

              <View style={styles.priorityTable}>
                <View style={styles.priorityTableHeader}>
                  <Text style={[styles.pCol, { flex: 2, fontWeight: '700' }]}>Priority</Text>
                  <Text style={[styles.pCol, { textAlign: 'center' }]}>Total</Text>
                  <Text style={[styles.pCol, { textAlign: 'center' }]}>Active</Text>
                  <Text style={[styles.pCol, { textAlign: 'center' }]}>Done</Text>
                  <Text style={[styles.pCol, { textAlign: 'center' }]}>Overdue</Text>
                </View>
                {priorityAnalysis.map((p) => (
                  <View key={p.priority} style={styles.priorityTableRow}>
                    <Text style={[styles.pCol, { flex: 2, fontFamily: Typography.fontFamily.semiBold }]}>{p.priority}</Text>
                    <Text style={[styles.pCol, { textAlign: 'center' }]}>{p.total}</Text>
                    <Text style={[styles.pCol, { textAlign: 'center', color: Colors.primary }]}>{p.inProgress}</Text>
                    <Text style={[styles.pCol, { textAlign: 'center', color: Colors.success }]}>{p.completed}</Text>
                    <Text style={[styles.pCol, { textAlign: 'center', color: p.overdue > 0 ? Colors.danger : Colors.textPrimary, fontWeight: p.overdue > 0 ? '700' : '400' }]}>{p.overdue}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── 7. Individual Execution Leaderboard ── */}
            {individualPerformance.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Individual Performance</Text>
                  <Text style={styles.cardBadge}>{individualPerformance.length} Members</Text>
                </View>

                {individualPerformance.slice(0, 10).map((ind) => (
                  <View key={ind.id} style={styles.individualRow}>
                    <Avatar name={ind.name} size={36} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.indName}>{ind.name}</Text>
                      <Text style={styles.indSub}>{ind.role} · {ind.departmentName}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.indStatsText}>{ind.completedTasks}/{ind.assignedTasks} Tasks ({ind.completionRate}%)</Text>
                      {ind.overdueTasks > 0 && (
                        <Text style={styles.indOverdueText}>{ind.overdueTasks} Overdue</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── 8. Self-Assigned Tasks Analytics ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Self-Assigned Tasks</Text>
                <Text style={styles.cardBadge}>{selfAssignedAnalysis.total} Total</Text>
              </View>
              <View style={styles.selfAssignedRow}>
                <View style={styles.selfCol}>
                  <Text style={styles.selfVal}>{selfAssignedAnalysis.total}</Text>
                  <Text style={styles.selfLbl}>Created</Text>
                </View>
                <View style={styles.selfCol}>
                  <Text style={[styles.selfVal, { color: Colors.primary }]}>{selfAssignedAnalysis.inProgress}</Text>
                  <Text style={styles.selfLbl}>In Progress</Text>
                </View>
                <View style={styles.selfCol}>
                  <Text style={[styles.selfVal, { color: Colors.success }]}>{selfAssignedAnalysis.completed}</Text>
                  <Text style={styles.selfLbl}>Done</Text>
                </View>
                <View style={styles.selfCol}>
                  <Text style={[styles.selfVal, { color: selfAssignedAnalysis.overdue > 0 ? Colors.danger : Colors.textPrimary }]}>{selfAssignedAnalysis.overdue}</Text>
                  <Text style={styles.selfLbl}>Overdue</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Filter Options Modal ── */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.filterModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Reports</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              {/* Department Filter (Executive Admins) */}
              {isExecAdmin && (
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionLabel}>Department</Text>
                  <View style={styles.filterChipsRow}>
                    <TouchableOpacity
                      style={[styles.chip, !filters.departmentId && styles.chipActive]}
                      onPress={() => updateFilter('departmentId', 'ALL')}
                    >
                      <Text style={[styles.chipText, !filters.departmentId && styles.chipTextActive]}>All</Text>
                    </TouchableOpacity>
                    {departments.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.chip, filters.departmentId === d.id && styles.chipActive]}
                        onPress={() => updateFilter('departmentId', d.id)}
                      >
                        <Text style={[styles.chipText, filters.departmentId === d.id && styles.chipTextActive]}>{d.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Priority Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Priority</Text>
                <View style={styles.filterChipsRow}>
                  {['ALL', 'Urgent', 'High', 'Medium', 'Low'].map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, (filters.priority || 'ALL') === p && styles.chipActive]}
                      onPress={() => updateFilter('priority', p)}
                    >
                      <Text style={[styles.chipText, (filters.priority || 'ALL') === p && styles.chipTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Status Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Status</Text>
                <View style={styles.filterChipsRow}>
                  {['ALL', 'To Do', 'In Progress', 'Done', 'Overdue'].map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, (filters.status || 'ALL') === s && styles.chipActive]}
                      onPress={() => updateFilter('status', s)}
                    >
                      <Text style={[styles.chipText, (filters.status || 'ALL') === s && styles.chipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Scope Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Task Scope</Text>
                <View style={styles.filterChipsRow}>
                  {['ALL', 'General', 'Department'].map(sc => (
                    <TouchableOpacity
                      key={sc}
                      style={[styles.chip, (filters.scope || 'ALL') === sc && styles.chipActive]}
                      onPress={() => updateFilter('scope', sc)}
                    >
                      <Text style={[styles.chipText, (filters.scope || 'ALL') === sc && styles.chipTextActive]}>{sc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalResetBtn}
                onPress={() => {
                  resetFilters();
                  setShowFilterModal(false);
                }}
              >
                <Text style={styles.modalResetText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.modalApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Interactive Drill-Down Modal ── */}
      <MetricDrillDownModal
        visible={!!drillDownTitle}
        onClose={() => setDrillDownTitle(null)}
        metricTitle={drillDownTitle || ''}
        period={period}
        tasks={drillDownTasks}
        onSelectTask={(id) => setPreviewTaskId(id)}
      />

      {/* ── Task Preview Modal ── */}
      <TaskPreviewModal
        visible={!!previewTaskId}
        onClose={() => {
          setPreviewTaskId(null);
          refetch();
        }}
        taskId={previewTaskId || ''}
        onTaskUpdated={() => refetch()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    paddingBottom: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
    gap: 6,
  },
  exportBtnDisabled: {
    opacity: 0.6,
  },
  exportBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  periodRow: {
    marginTop: Layout.spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Layout.spacing.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Layout.radius.full,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.background,
  },
  filterButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eff6ff',
  },
  filterButtonText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  filterButtonTextActive: {
    color: Colors.primary,
  },
  clearFilterBtn: {
    paddingHorizontal: 6,
  },
  clearFilterText: {
    fontSize: 11,
    color: Colors.danger,
    fontFamily: Typography.fontFamily.medium,
  },
  activePill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activePillText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
  },
  errorContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.danger,
  },
  errorSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
  },
  retryBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  sectionHeader: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.lg,
    paddingBottom: Layout.spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Layout.spacing.lg,
    gap: 10,
    marginTop: Layout.spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  kpiCardOverdue: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  kpiLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 24,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  secondaryKpiRow: {
    flexDirection: 'row',
    paddingHorizontal: Layout.spacing.lg,
    gap: 10,
    marginTop: 10,
  },
  secKpiCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  secKpiLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  secKpiValue: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginVertical: 2,
  },
  secKpiSub: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Layout.spacing.lg,
    marginTop: Layout.spacing.md,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardOverdue: {
    borderColor: '#fca5a5',
    backgroundColor: '#fffcfc',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.md,
  },
  cardTitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  cardBadge: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  progressBrackets: {
    gap: 10,
  },
  bracketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bracketLabel: {
    width: 130,
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  bracketTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bracketFill: {
    height: '100%',
    borderRadius: 4,
  },
  bracketValue: {
    width: 30,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  overdueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overdueBadge: {
    backgroundColor: '#fee2e2',
    color: Colors.danger,
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  durationItem: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  durationNum: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  durationLabel: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  deptCard: {
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: Layout.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  deptTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deptName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  deptBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deptBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: '#0369a1',
  },
  deptMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  deptMetric: {
    alignItems: 'center',
  },
  deptMetricLabel: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  deptMetricValue: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  miniProgressTrack: {
    height: 4,
    backgroundColor: Colors.borderSubtle,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  teamManagerName: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  teamDeptName: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  teamStats: {
    alignItems: 'flex-end',
  },
  teamStatsText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  priorityTable: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  priorityTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  priorityTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  pCol: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textPrimary,
  },
  individualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  indName: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  indSub: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  indStatsText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  indOverdueText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
  },
  selfAssignedRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  selfCol: {
    alignItems: 'center',
  },
  selfVal: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  selfLbl: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Layout.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.md,
  },
  modalTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  filterSection: {
    marginBottom: Layout.spacing.md,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Layout.radius.full,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.background,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eff6ff',
  },
  chipText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Layout.spacing.md,
    paddingTop: Layout.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  modalResetBtn: {
    padding: 10,
  },
  modalResetText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.danger,
  },
  modalApplyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
  },
  modalApplyText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13,
  },
});
