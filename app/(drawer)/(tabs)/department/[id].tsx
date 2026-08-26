import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../src/lib/supabase';
import { Colors, Typography, Layout } from '../../../../src/theme/tokens';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { TaskCard } from '../../../../src/components/tasks/TaskCard';

export default function DepartmentDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const [department, setDepartment] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    
    const fetchDepartmentDetails = async () => {
      setLoading(true);
      
      // Fetch department info
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .single();
        
      setDepartment(deptData);

      // Fetch users in this department
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, role, email')
        .eq('department_id', id);
        
      setUsers(usersData || []);

      // Fetch tasks for this department
      const { data: tasksData } = await supabase
        .from('tasks')
        .select(`
          *,
          task_assignees(users(id, full_name, avatar_url)),
          creator:users!created_by(id, full_name, avatar_url)
        `)
        .eq('department_id', id)
        .order('created_at', { ascending: false });

      setTasks(tasksData || []);
      setLoading(false);
    };
    
    fetchDepartmentDetails();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!department) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Department not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeTasks = tasks.filter(t => t.status === 'To Do' || t.status === 'In Progress').length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{department.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <View style={styles.metricStrip}>
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: Colors.semanticBlue }]}>{activeTasks}</Text>
              <Text style={styles.metricLabel}>Active</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, overdueTasks > 0 ? { color: Colors.semanticPeach } : { color: Colors.textMuted }]}>{overdueTasks}</Text>
              <Text style={styles.metricLabel}>Overdue</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: Colors.semanticSage }]}>{completedTasks}</Text>
              <Text style={styles.metricLabel}>Completed</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{users.length}</Text>
              <Text style={styles.metricLabel}>Members</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>Tasks</Text>
          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>No tasks in this department.</Text>
          ) : (
            tasks.map(task => (
              <TaskCard 
                key={task.id}
                task={task}
                onPress={() => router.push(`/task/${task.id}` as any)}
                onToggleComplete={async () => {
                  const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
                  await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
                  setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
                }}
              />
            ))
          )}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {users.length === 0 ? (
            <Text style={styles.emptyText}>No members in this department.</Text>
          ) : (
            <View style={styles.listContainer}>
              {users.map((user, index) => (
                <View key={user.id} style={[styles.listRow, index !== users.length - 1 && styles.borderBottom]}>
                  <View>
                    <Text style={styles.listName}>{user.full_name}</Text>
                    <Text style={styles.listRole}>{user.role}</Text>
                  </View>
                  <Text style={styles.listEmail}>{user.email}</Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Layout.spacing.xl,
    paddingHorizontal: Layout.spacing.xl,
    paddingBottom: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backButton: {
    marginRight: Layout.spacing.md,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  scrollContent: {
    padding: Layout.spacing.xl,
    paddingBottom: 40,
  },
  section: {
    marginTop: Layout.spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
    fontStyle: 'italic',
  },
  metricStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: '80%',
    backgroundColor: Colors.borderSubtle,
  },
  metricValue: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  listContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Layout.spacing.lg,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  listName: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  listRole: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listEmail: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  }
});
