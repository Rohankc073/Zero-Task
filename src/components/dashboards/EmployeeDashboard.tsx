import React, { useCallback, useState } from 'react';
import { useEmployeeData } from '../../hooks/useDashboards';
import { useFocusEffect, useRouter } from 'expo-router';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Task } from '../../types';
import { UnifiedDashboard } from './UnifiedDashboard';
import { Period } from '../ui/PeriodSelector';

export function EmployeeDashboard() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('All Time');
  const { metrics, tasks, loading, markTaskDone, refetch } = useEmployeeData(period);
  const [showConfetti, setShowConfetti] = React.useState(false);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch, period])
  );

  const handleTaskDone = async (task: Task) => {
    await markTaskDone(task.id);
    if (task.priority === 'High') {
      if (!task.due_date || new Date(task.due_date) >= new Date()) {
        setShowConfetti(true);
      }
    }
  };

  return (
    <>
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
        period={period}
        onPeriodChange={setPeriod}
        onRefetch={refetch}
      />
      {showConfetti && (
        <ConfettiCannon
          count={100}
          origin={{ x: 0, y: 0 }}
          fadeOut
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}
    </>
  );
}
