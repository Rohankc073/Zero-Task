import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { CompanyFilterSelector } from '../../../src/components/CompanyFilterSelector';
import { MetricDrillDownModal } from '../../../src/components/dashboards/MetricDrillDownModal';
import TaskPreviewModal from '../../../src/components/TaskPreviewModal';
import { Task, Company } from '../../../src/types';

export default function SuperAdminDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [drillDownMetric, setDrillDownMetric] = useState<string | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch active companies
      const { data: compData } = await supabase.from('companies').select('*').order('name');
      if (compData) {
        const cMap = (compData as Company[]).reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {} as Record<string, Company>);
        setCompanies(cMap);
      }

      // 2. Fetch tasks across all companies (excluding Founder private tasks)
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;
      setTasks((tasksData as Task[]) || []);

      // 3. Fetch recent audit logs / activities
      const { data: logData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      setActivities(logData || []);
    } catch (err: any) {
      console.error('Error fetching Super Admin dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Filter tasks by selected company
  const scopedTasks = useMemo(() => {
    if (!selectedCompanyId) return tasks;
    return tasks.filter((t) => t.company_id === selectedCompanyId);
  }, [tasks, selectedCompanyId]);

  // Calculate Metrics
  const metrics = useMemo(() => {
    const now = new Date();
    let assigned = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    scopedTasks.forEach((t) => {
      if (t.status === 'Done') {
        completed++;
      } else {
        assigned++;
        if (t.status === 'In Progress') inProgress++;
        if (t.due_date && new Date(t.due_date) < now) {
          overdue++;
        }
      }
    });

    const total = scopedTasks.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, assigned, inProgress, completed, overdue, completionRate };
  }, [scopedTasks]);

  // Priority Breakdown
  const priorityStats = useMemo(() => {
    const counts = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
    scopedTasks.forEach((t) => {
      const p = (t.priority || 'Medium') as keyof typeof counts;
      if (counts[p] !== undefined) counts[p]++;
    });
    return counts;
  }, [scopedTasks]);

  // Tasks for Metric Drill Down Modal (uses full tasks set so internal company filter can operate freely)
  const drillDownTasks = useMemo(() => {
    if (!drillDownMetric) return [];
    const base = tasks;
    const now = new Date();
    switch (drillDownMetric) {
      case 'Assigned':
      case 'Active Assigned':
        return base.filter((t) => t.status !== 'Done');
      case 'In Progress':
        return base.filter((t) => t.status === 'In Progress');
      case 'Completed':
        return base.filter((t) => t.status === 'Done');
      case 'Overdue':
        return base.filter((t) => t.due_date && new Date(t.due_date) < now && t.status !== 'Done');
      default:
        return base;
    }
  }, [tasks, drillDownMetric]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.title}>Global Operations Dashboard</Text>
          <Text style={styles.subtitle}>Super Admin Platform & Organization Overview</Text>
        </View>
      </View>

      {/* Company Selector */}
      <View style={styles.selectorSection}>
        <CompanyFilterSelector
          selectedCompanyId={selectedCompanyId}
          onSelectCompany={(cId) => setSelectedCompanyId(cId)}
          showAllOption
          allOptionLabel="All Companies"
          label="Scope Operations"
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading operational metrics...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Metric Tiles (Grid 2x2) */}
          <View style={styles.tilesGrid}>
            {/* Total / Assigned */}
            <TouchableOpacity
              style={styles.tile}
              onPress={() => setDrillDownMetric('Assigned')}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="layers" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.tileNumber}>{metrics.assigned}</Text>
              <Text style={styles.tileLabel}>Active Assigned</Text>
            </TouchableOpacity>

            {/* In Progress */}
            <TouchableOpacity
              style={styles.tile}
              onPress={() => setDrillDownMetric('In Progress')}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="time" size={20} color="#0284C7" />
              </View>
              <Text style={styles.tileNumber}>{metrics.inProgress}</Text>
              <Text style={styles.tileLabel}>In Progress</Text>
            </TouchableOpacity>

            {/* Completed */}
            <TouchableOpacity
              style={styles.tile}
              onPress={() => setDrillDownMetric('Completed')}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="checkmark-done" size={20} color={Colors.success} />
              </View>
              <Text style={styles.tileNumber}>{metrics.completed}</Text>
              <Text style={styles.tileLabel}>Completed</Text>
            </TouchableOpacity>

            {/* Overdue */}
            <TouchableOpacity
              style={styles.tile}
              onPress={() => setDrillDownMetric('Overdue')}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="alert-circle" size={20} color={Colors.danger} />
              </View>
              <Text style={[styles.tileNumber, { color: Colors.danger }]}>{metrics.overdue}</Text>
              <Text style={styles.tileLabel}>Overdue</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Platform Completion Rate</Text>
              <Text style={styles.cardRate}>{metrics.completionRate}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${metrics.completionRate}%` }]} />
            </View>
            <Text style={styles.progressSubtext}>
              {metrics.completed} of {metrics.total} total tasks resolved
            </Text>
          </View>

          {/* Priority Breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Priority Breakdown</Text>
            <View style={styles.priorityRow}>
              <View style={styles.priorityItem}>
                <View style={[styles.priorityDot, { backgroundColor: Colors.danger }]} />
                <Text style={styles.priorityLabel}>Urgent</Text>
                <Text style={styles.priorityValue}>{priorityStats.Urgent}</Text>
              </View>
              <View style={styles.priorityItem}>
                <View style={[styles.priorityDot, { backgroundColor: '#F97316' }]} />
                <Text style={styles.priorityLabel}>High</Text>
                <Text style={styles.priorityValue}>{priorityStats.High}</Text>
              </View>
              <View style={styles.priorityItem}>
                <View style={[styles.priorityDot, { backgroundColor: '#EAB308' }]} />
                <Text style={styles.priorityLabel}>Medium</Text>
                <Text style={styles.priorityValue}>{priorityStats.Medium}</Text>
              </View>
              <View style={styles.priorityItem}>
                <View style={[styles.priorityDot, { backgroundColor: Colors.textMuted }]} />
                <Text style={styles.priorityLabel}>Low</Text>
                <Text style={styles.priorityValue}>{priorityStats.Low}</Text>
              </View>
            </View>
          </View>

          {/* Quick Operations Actions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Quick Operational Management</Text>
            <View style={styles.quickActionsGrid}>
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => router.push('/(drawer)/(tabs)/create' as any)}
              >
                <Ionicons name="add-circle" size={24} color={Colors.primary} />
                <Text style={styles.quickActionText}>Create Task</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => router.push('/(drawer)/(tabs)/calendar' as any)}
              >
                <Ionicons name="calendar" size={24} color={Colors.primary} />
                <Text style={styles.quickActionText}>Schedule Meeting</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => router.push('/(drawer)/(superadmin)/current-users' as any)}
              >
                <Ionicons name="people" size={24} color={Colors.primary} />
                <Text style={styles.quickActionText}>Current Users</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => router.push('/(drawer)/(tabs)/reports' as any)}
              >
                <Ionicons name="bar-chart" size={24} color={Colors.primary} />
                <Text style={styles.quickActionText}>Reports</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Drill-down Modal */}
      <MetricDrillDownModal
        visible={!!drillDownMetric}
        onClose={() => setDrillDownMetric(null)}
        metricTitle={drillDownMetric ? `${drillDownMetric} Tasks` : 'Tasks'}
        tasks={drillDownTasks}
        period="All Time"
        initialCompanyId={selectedCompanyId}
        onCompanyChange={(cId) => setSelectedCompanyId(cId)}
        onSelectTask={(id) => setPreviewTaskId(id)}
      />

      {/* Task Preview Modal */}
      <TaskPreviewModal
        visible={!!previewTaskId}
        onClose={() => {
          setPreviewTaskId(null);
          fetchDashboardData();
        }}
        taskId={previewTaskId || ''}
        onTaskUpdated={() => fetchDashboardData()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  headerBar: {
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  selectorSection: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.spacing.lg,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  tile: {
    width: (Dimensions.get('window').width - 32 - 12) / 2,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tileNumber: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 22,
    color: Colors.textPrimary,
  },
  tileLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  cardRate: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.primary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressSubtext: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
  },
  priorityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  priorityItem: {
    alignItems: 'center',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  priorityLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 11,
    color: Colors.textMuted,
  },
  priorityValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 14,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  quickActionBtn: {
    alignItems: 'center',
    padding: 8,
  },
  quickActionText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textPrimary,
    marginTop: 6,
  },
});
