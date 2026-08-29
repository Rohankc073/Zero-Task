import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { Avatar } from '../ui/Avatar';
import { Period } from '../ui/PeriodSelector';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/permissions';
import { CompanyFilterSelector } from '../CompanyFilterSelector';
import { supabase } from '../../lib/supabase';

interface MetricDrillDownModalProps {
  visible: boolean;
  onClose: () => void;
  metricTitle: string;
  tasks: any[];
  period: Period;
  onSelectTask: (taskId: string) => void;
  initialCompanyId?: string | null;
  onCompanyChange?: (companyId: string | null) => void;
}

function priorityColor(priority?: string): string {
  switch (priority?.toUpperCase()) {
    case 'HIGH':
    case 'URGENT':
      return Colors.danger;
    case 'MEDIUM':
      return Colors.warning;
    default:
      return Colors.success;
  }
}

function statusColor(status?: string): { bg: string; text: string } {
  switch (status?.toUpperCase()) {
    case 'DONE':
    case 'COMPLETED':
      return { bg: Colors.successLight, text: Colors.success };
    case 'IN PROGRESS':
      return { bg: Colors.infoLight, text: Colors.info };
    default:
      return { bg: Colors.surfaceSecondary, text: Colors.textSecondary };
  }
}

export const MetricDrillDownModal: React.FC<MetricDrillDownModalProps> = ({
  visible,
  onClose,
  metricTitle,
  tasks,
  period,
  onSelectTask,
  initialCompanyId,
  onCompanyChange,
}) => {
  const { profile } = useAuth();
  const superAdmin = isSuperAdmin(profile);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(initialCompanyId ?? null);
  const [companiesMap, setCompaniesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialCompanyId !== undefined) {
      setSelectedCompanyId(initialCompanyId);
    }
  }, [initialCompanyId, visible]);

  useEffect(() => {
    if (!superAdmin) return;
    let isMounted = true;
    const fetchCompanies = async () => {
      try {
        const { data } = await supabase.from('companies').select('id, name');
        if (data && isMounted) {
          const map: Record<string, string> = {};
          data.forEach((c: any) => {
            map[c.id] = c.name;
          });
          setCompaniesMap(map);
        }
      } catch (err) {
        console.error('Error loading companies map for drill down:', err);
      }
    };
    fetchCompanies();
    return () => {
      isMounted = false;
    };
  }, [superAdmin]);

  const now = new Date();

  const filteredTasks = useMemo(() => {
    if (!superAdmin || !selectedCompanyId || selectedCompanyId === 'all') {
      return tasks;
    }
    return tasks.filter((t) => t.company_id === selectedCompanyId);
  }, [tasks, selectedCompanyId, superAdmin]);

  const handleSelectCompany = (companyId: string | null) => {
    setSelectedCompanyId(companyId);
    onCompanyChange?.(companyId);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Modal Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
            <Text style={styles.backText}>Dashboard</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{metricTitle}</Text>
            <Text style={styles.headerSubtitle}>
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'} · {period}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Super Admin Company Filter */}
        {superAdmin && (
          <View style={styles.companyFilterContainer}>
            <CompanyFilterSelector
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={handleSelectCompany}
              showAllOption
              allOptionLabel="All Companies"
            />
          </View>
        )}

        {/* Task Tiles Feed */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="clipboard-outline" size={36} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No {metricTitle.toLowerCase()}</Text>
              <Text style={styles.emptySubtitle}>
                No tasks match this filter in the "{period}" timeframe.
              </Text>
            </View>
          ) : (
            filteredTasks.map((task) => {
              const isDone = task.status === 'Done' || task.status === 'Completed';
              const dueDate = task.due_date ? new Date(task.due_date) : null;
              const isOverdue = !!(dueDate && dueDate < now && !isDone);
              const daysOverdue = dueDate && isOverdue
                ? Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
                : 0;

              const sColor = statusColor(task.status);
              const pColor = priorityColor(task.priority);
              const deptName = task.departments?.name || 'General';
              const compName = companiesMap[task.company_id] || task.companies?.name || null;

              const progressPct = task.progress !== null && task.progress !== undefined && !isNaN(Number(task.progress))
                ? Number(task.progress)
                : (isDone ? 100 : (task.status === 'In Progress' ? 50 : 0));

              // Format assignees
              const assignees = task.task_assignees || [];

              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.tileCard, isOverdue && styles.tileCardOverdue]}
                  activeOpacity={0.75}
                  onPress={() => onSelectTask(task.id)}
                >
                  {/* Top Metadata Row */}
                  <View style={styles.tileTopRow}>
                    <View style={styles.badgesLeft}>
                      {superAdmin && compName ? (
                        <View style={styles.companyBadge}>
                          <Ionicons name="business-outline" size={11} color={Colors.primary} />
                          <Text style={styles.companyBadgeText} numberOfLines={1}>
                            {compName}
                          </Text>
                        </View>
                      ) : null}

                      <View style={styles.deptBadge}>
                        <Text style={styles.deptBadgeText}>{deptName}</Text>
                      </View>
                    </View>

                    <View style={styles.tagsRight}>
                      <View style={[styles.priorityBadge, { borderColor: pColor }]}>
                        <Text style={[styles.priorityBadgeText, { color: pColor }]}>
                          {task.priority || 'Medium'}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: sColor.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: sColor.text }]}>
                          {task.status}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Task Title */}
                  <Text style={[styles.tileTitle, isDone && styles.tileTitleDone]} numberOfLines={2}>
                    {task.title}
                  </Text>

                  {/* Overdue Banner */}
                  {isOverdue && (
                    <View style={styles.overdueRow}>
                      <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                      <Text style={styles.overdueText}>
                        {daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
                        {dueDate ? ` · Due ${dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Progress Bar */}
                  <View style={styles.progressRow}>
                    <View style={styles.progressBarTrack}>
                      <View style={[styles.progressBarFill, { width: `${progressPct}%`, backgroundColor: isDone ? Colors.success : Colors.primary }]} />
                    </View>
                    <Text style={styles.progressText}>{progressPct}%</Text>
                  </View>

                  {/* Footer Row: Assignees & Deadline */}
                  <View style={styles.tileFooter}>
                    {/* Assignees */}
                    <View style={styles.assigneesRow}>
                      {assignees.length > 0 ? (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {assignees.slice(0, 3).map((a: any, i: number) => (
                              <Avatar
                                key={a.user_id || i}
                                name={a.users?.full_name || 'User'}
                                size={20}
                                style={{ ...styles.avatarOverlap, zIndex: 10 - i, marginLeft: i > 0 ? -6 : 0 }}
                              />
                            ))}
                          </View>
                          <Text style={styles.assigneeNameText} numberOfLines={1}>
                            {assignees.map((a: any) => a.users?.full_name?.split(' ')[0] || 'User').join(', ')}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.unassignedText}>Unassigned</Text>
                      )}
                    </View>

                    {/* Deadline */}
                    {dueDate && !isOverdue && (
                      <View style={styles.deadlineBadge}>
                        <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                        <Text style={styles.deadlineText}>
                          {dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
  },
  companyFilterContainer: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.spacing.lg,
    gap: Layout.spacing.md,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: Layout.spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Layout.spacing.md,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  tileCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.md,
    ...Layout.shadow.card,
    gap: 10,
  },
  tileCardOverdue: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FED7D7',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.radius.sm,
    maxWidth: 130,
  },
  companyBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    color: Colors.primary,
  },
  deptBadge: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.radius.sm,
  },
  deptBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  tagsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  priorityBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 11,
  },
  tileTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  tileTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  overdueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  overdueText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 11,
    color: Colors.danger,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textMuted,
    minWidth: 30,
    textAlign: 'right',
  },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  assigneesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  avatarOverlap: {
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  assigneeNameText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  unassignedText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textMuted,
  },
});
