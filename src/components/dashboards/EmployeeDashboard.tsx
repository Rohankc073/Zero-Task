import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEmployeeData } from '../../hooks/useDashboards';
import { useNativeAutomation } from '../../hooks/useNativeAutomation';
import { useRouter } from 'expo-router';
import { TaskCard } from '../TaskCard';
import TaskPreviewModal from '../TaskPreviewModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Task } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export function EmployeeDashboard() {
  const router = useRouter();
  const { profile } = useAuth();
  const { upcomingTasks, activeTasks, doneTasks, loading, markTaskDone } = useEmployeeData();
  const { activeAlert, logMilestone } = useNativeAutomation();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  React.useEffect(() => {
    // Kept for any other initialization if needed
  }, [profile?.id, activeAlert]);

  const handleTaskDone = async (task: Task) => {
    await markTaskDone(task.id);
    if (task.priority === 'Urgent') {
      if (!task.due_date || new Date(task.due_date) >= new Date()) {
        setShowConfetti(true);
        await logMilestone('Early Completion', 50);
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="leaf-outline" size={48} color="#cccccc" style={styles.emptyIcon} />
      <Text style={styles.emptyText}>No tasks assigned. You're all caught up.</Text>
    </View>
  );

  const totalTasks = upcomingTasks.length + activeTasks.length + doneTasks.length;

  const allIncomplete = [...activeTasks, ...upcomingTasks];
  const currentFocus = allIncomplete.find(t => t.priority === 'Urgent') || allIncomplete[0];

  return (
    <View style={styles.container}>
      {activeAlert && (
        <View style={styles.alertBanner}>
          <Ionicons name="notifications" size={16} color="#0f141a" style={{ marginRight: 8 }} />
          <Text style={styles.alertText}>{activeAlert.message}</Text>
        </View>
      )}
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>Focus Mode</Text>

        {/* Current Focus Widget */}
        {currentFocus ? (
          <View style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <Ionicons name="flash" size={20} color="#e1c37a" />
              <Text style={styles.focusTitle}>Current Focus</Text>
            </View>
            <TaskCard 
              task={currentFocus} 
              onPress={() => setSelectedTaskId(currentFocus.id)} 
              onMarkDone={() => handleTaskDone(currentFocus)}
            />
          </View>
        ) : (
          <View style={styles.focusEmptyCard}>
            <Ionicons name="checkmark-done-circle" size={48} color="#e1c37a" style={styles.emptyIcon} />
            <Text style={styles.emptyText}>You are caught up. Awaiting deployment.</Text>
          </View>
        )}

      {totalTasks === 0 ? null : (
        <>
          {activeTasks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>To-Do / In Progress</Text>
              {activeTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onPress={() => setSelectedTaskId(task.id)} 
                  onMarkDone={() => handleTaskDone(task)}
                />
              ))}
            </View>
          )}

          {upcomingTasks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              {upcomingTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onPress={() => setSelectedTaskId(task.id)} 
                />
              ))}
            </View>
          )}

          {doneTasks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recently Done</Text>
              {doneTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onPress={() => setSelectedTaskId(task.id)} 
                />
              ))}
            </View>
          )}
        </>
      )}

      <TaskPreviewModal 
        taskId={selectedTaskId}
        visible={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
      </ScrollView>
      {showConfetti && (
        <ConfettiCannon
          count={100}
          origin={{ x: 0, y: 0 }}
          fadeOut={true}
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  alertBanner: {
    backgroundColor: '#e1c37a',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: {
    color: '#0f141a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  focusCard: {
    backgroundColor: '#0f141a',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  focusTitle: {
    color: '#e1c37a',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  focusEmptyCard: {
    backgroundColor: '#ffffff',
    padding: 40,
    borderRadius: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
});
