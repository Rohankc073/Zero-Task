import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Project, Task } from '../../src/types';
import { TaskCard } from '../../src/components/TaskCard';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (!id) return;

      // Fetch project details
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Fetch tasks for this project
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false });

      if (taskError) throw taskError;
      setTasks(taskData || []);

    } catch (error) {
      console.error('Error fetching project details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'TBD';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading && !project) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f7f6f2]">
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  if (!project) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f7f6f2]">
        <Text className="text-gray-500 text-lg">Project not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 p-2 bg-[#0f141a] rounded">
          <Text className="text-[#e1c37a]">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f7f6f2]">
      {/* Header Section */}
      <View className="bg-[#0f141a] pt-12 pb-6 px-4 rounded-b-3xl">
        <TouchableOpacity onPress={() => router.back()} className="mb-4">
          <Ionicons name="arrow-back" size={24} color="#e1c37a" />
        </TouchableOpacity>
        
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-2xl font-bold text-white flex-1 mr-2">{project.name}</Text>
          <View className="bg-[#e1c37a] px-3 py-1 rounded-full">
            <Text className="text-[#0f141a] text-xs font-bold">{project.status}</Text>
          </View>
        </View>
        
        {project.description ? (
          <Text className="text-gray-300 mb-4">{project.description}</Text>
        ) : null}

        <View className="flex-row items-center mt-2">
          <Ionicons name="calendar-outline" size={16} color="#e1c37a" className="mr-2" />
          <Text className="text-gray-300 ml-2 text-sm">
            {formatDate(project.start_date)} - {formatDate(project.end_date)}
          </Text>
        </View>
      </View>

      {/* Tasks List */}
      <View className="flex-1 p-4">
        <Text className="text-xl font-bold text-[#0f141a] mb-4">Project Tasks ({tasks.length})</Text>
        <FlashList estimatedItemSize={100}
          data={tasks}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <TaskCard 
              task={item} 
              onPress={() => router.push(`/task/${item.id}` as any)} 
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshing={loading}
          onRefresh={fetchData}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center py-10 mt-10">
              <Ionicons name="clipboard-outline" size={48} color="#ccc" />
              <Text className="text-gray-500 text-base mt-4 text-center">No tasks assigned to this project yet.</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}
