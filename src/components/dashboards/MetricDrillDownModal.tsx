import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { Period } from '../ui/PeriodSelector';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/permissions';
import { CompanyFilterSelector } from '../CompanyFilterSelector';
import { ZeroTaskHeader } from '../ZeroTaskHeader';
import { supabase } from '../../lib/supabase';
import { CompactTaskRow } from '../tasks/CompactTaskRow';

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

  const filteredTasks = useMemo(() => {
    const list = (!superAdmin || !selectedCompanyId || selectedCompanyId === 'all')
      ? tasks
      : tasks.filter((t) => t.company_id === selectedCompanyId);
    const seen = new Set<string>();
    return list.filter((t) => {
      if (!t?.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [tasks, selectedCompanyId, superAdmin]);

  const handleSelectCompany = (companyId: string | null) => {
    setSelectedCompanyId(companyId);
    onCompanyChange?.(companyId);
  };

  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: safeTop }]}>
        {/* ZeroTask App Header */}
        <ZeroTaskHeader showClose onClose={onClose} showDrawer={false} />

        {/* Modal Navigation & Metric Title Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.primary} />
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

        {/* Task Cards Feed */}
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
            filteredTasks.map((task, idx) => (
              <CompactTaskRow
                key={task?.id ? `${task.id}-${idx}` : `drill-${idx}`}
                task={task}
                onPress={(id) => onSelectTask(id)}
              />
            ))
          )}
        </ScrollView>
      </View>
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
});
