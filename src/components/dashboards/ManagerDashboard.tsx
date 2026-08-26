import React, { useCallback, useState } from 'react';
import { useManagerData } from '../../hooks/useDashboards';
import { useFocusEffect, useRouter } from 'expo-router';
import { UnifiedDashboard } from './UnifiedDashboard';
import { Period } from '../ui/PeriodSelector';

export function ManagerDashboard() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('All Time');

  const {
    metrics,
    tasks,
    pendingApprovals,
    loading,
    refetch,
  } = useManagerData(period);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch, period])
  );

  return (
    <UnifiedDashboard
      assigned={metrics.assigned}
      inProgress={metrics.inProgress}
      completed={metrics.completed}
      overdue={metrics.overdue}
      assignedTrend={metrics.assignedTrend}
      inProgressTrend={metrics.inProgressTrend}
      completedTrend={metrics.completedTrend}
      overdueTrend={metrics.overdueTrend}
      tasks={tasks}
      onViewAllTasks={() => router.push('/tasks' as any)}
      progressPercent={metrics.progressPercent}
      loading={loading}
      pendingApprovals={pendingApprovals}
      onApprovalsPress={() => router.push('/approvals' as any)}
      period={period}
      onPeriodChange={setPeriod}
      onRefetch={refetch}
    />
  );
}
