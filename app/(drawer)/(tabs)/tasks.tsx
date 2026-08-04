import React, { useRef, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, Alert, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TaskCard } from '../../../src/components/TaskCard';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useTasks } from '../../../src/hooks/useCoreEngine';
import { CreateTaskModal, CreateTaskModalRef } from '../../../src/components/CreateTaskModal';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Task, TaskStatus } from '../../../src/types';
import { OfflineManager } from '../../../src/lib/OfflineManager';
import { TaskSkeleton } from '../../../src/components/Skeleton';
import * as Haptics from 'expo-haptics';

export default function TaskDashboard() {
  const router = useRouter();
  const { tasks, loading, setTasks } = useTasks();
  const { profile } = useAuth();
  const modalRef = useRef<CreateTaskModalRef>(null);
  
  const [filter, setFilter] = useState<'All' | TaskStatus>('All');

  const filteredTasks = tasks.filter(t => filter === 'All' ? true : t.status === filter);

  const handleMarkDone = async (task: Task) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Optimistic UI Update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'Done' } : t));

    try {
      const { error } = await supabase.from('tasks').update({ status: 'Done' }).eq('id', task.id);
      if (error) throw error;
    } catch (err: any) {
      if (err.message === 'Failed to fetch' || err.message.includes('network')) {
        // Enqueue for offline sync
        OfflineManager.enqueueMutation({
          table: 'tasks',
          action: 'UPDATE',
          payload: { status: 'Done' },
          matchKey: 'id',
          matchValue: task.id
        });
      } else {
        // Revert on other errors
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
        Alert.alert('Error', err.message);
      }
    }
  };

  const handleDelete = async (task: Task) => {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.from('tasks').delete().eq('id', task.id);
          if (error) throw error;
        } catch (err: any) {
          Alert.alert('Error', err.message);
        }
      }}
    ]);
  };

  const renderRightActions = (progress: any, dragX: any, task: Task) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity onPress={() => handleDelete(task)} style={[styles.rightAction, { backgroundColor: '#ef4444' }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash" size={24} color="white" />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderLeftActions = (progress: any, dragX: any, task: Task) => {
    const scale = dragX.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity onPress={() => handleMarkDone(task)} style={[styles.leftAction, { backgroundColor: '#10b981' }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="checkmark" size={24} color="white" />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  if (loading && tasks.length === 0) {
    return (
      <View className="flex-1 bg-[#f7f6f2] p-4">
        <TaskSkeleton />
        <TaskSkeleton />
        <TaskSkeleton />
        <TaskSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f7f6f2] p-4">
      <View className="flex-row mb-4 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
        {['All', 'To Do', 'In Progress', 'Done'].map(f => (
          <TouchableOpacity
            key={f}
            className={`flex-1 py-2 rounded-lg items-center ${filter === f ? 'bg-[#0f141a]' : 'bg-transparent'}`}
            onPress={() => setFilter(f as any)}
          >
            <Text className={`font-bold text-xs ${filter === f ? 'text-[#e1c37a]' : 'text-gray-500'}`}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1, minHeight: 200, width: '100%' }}>
        <FlashList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          estimatedItemSize={120}
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={(p, d) => renderRightActions(p, d, item)}
            renderLeftActions={(p, d) => renderLeftActions(p, d, item)}
            friction={2}
          >
            <TaskCard 
              task={item} 
              onPress={() => router.push(`/task/${item.id}` as any)} 
            />
          </Swipeable>
        )}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center py-10">
            <Text className="text-gray-500 text-base">No tasks found.</Text>
          </View>
        }
        />
      </View>

      {profile?.role !== 'Employee' && (
        <TouchableOpacity
          className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-[#0f141a] items-center justify-center shadow-lg"
          onPress={() => modalRef.current?.present()}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={30} color="#e1c37a" />
        </TouchableOpacity>
      )}

      <CreateTaskModal 
        ref={modalRef} 
        onSuccess={(newTask) => {
          if (newTask) {
            setTasks(prev => [newTask, ...prev]);
          }
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  leftAction: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    marginBottom: 16,
    borderRadius: 12,
    flex: 1,
  },
  rightAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    marginBottom: 16,
    borderRadius: 12,
    flex: 1,
  },
});
