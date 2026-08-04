import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { Meeting, Task } from '../../src/types';
import { useAuth } from '../../src/context/AuthContext';
import { TaskCard } from '../../src/components/TaskCard';
import { ZeroInput } from '../../src/components/ZeroInput';
import { ZeroButton } from '../../src/components/ZeroButton';

export default function MeetingDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session, profile } = useAuth();
  
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [actionItems, setActionItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New action item state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  const fetchMeetingData = async () => {
    try {
      setLoading(true);
      if (!id) return;

      // Fetch meeting details
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .single();

      if (meetingError) throw meetingError;
      
      let projectData = null;
      if (meetingData.project_id) {
        const { data: proj } = await supabase
          .from('projects')
          .select('id, name')
          .eq('id', meetingData.project_id)
          .single();
        projectData = proj;
      }

      setMeeting({ ...meetingData, project: projectData } as unknown as Meeting);

      // Fetch Action Items (tasks linked to this meeting)
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('meeting_id', id)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;
      setActionItems(tasksData as Task[]);

    } catch (error) {
      console.error('Error fetching meeting details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetingData();
  }, [id]);

  const handleDeleteMeeting = () => {
    Alert.alert(
      "Mark as Done",
      "Are you sure you want to mark this meeting as done? This will remove it from the calendar.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Done", 
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase.from('meetings').delete().eq('id', id);
              if (error) throw error;
              router.back();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to mark meeting as done.");
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCreateActionItem = async () => {
    if (!newTaskTitle.trim() || !session?.user || !meeting) return;

    try {
      setIsAddingTask(true);
      
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: newTaskTitle.trim(),
          description: `Action item from meeting: ${meeting.title}`,
          status: 'To Do',
          priority: 'Medium',
          user_id: session.user.id,
          project_id: meeting.project_id || null,
          meeting_id: meeting.id,
          due_date: new Date().toISOString().split('T')[0] // default to today
        })
        .select()
        .single();

      if (error) throw error;
      
      setNewTaskTitle('');
      setActionItems(prev => [data as Task, ...prev]);

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create action item');
    } finally {
      setIsAddingTask(false);
    }
  };

  if (loading && !meeting) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f7f6f2]">
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  if (!meeting) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f7f6f2]">
        <Text className="text-gray-500 text-lg">Meeting not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 p-2 bg-[#0f141a] rounded">
          <Text className="text-[#e1c37a]">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f7f6f2]">
      {/* Header Section */}
      <View className="bg-blue-600 pt-12 pb-6 px-4 rounded-b-3xl shadow-sm">
        <View className="flex-row justify-between items-center mb-4">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          {profile?.role !== 'Employee' && (
            <TouchableOpacity 
              onPress={handleDeleteMeeting}
              className="bg-white/20 px-3 py-1.5 rounded-full flex-row items-center"
            >
              <Ionicons name="checkmark-done" size={16} color="#ffffff" />
              <Text className="text-white font-bold ml-1 text-sm">Done</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View className="flex-row items-center mb-2">
          <View className="bg-white/20 p-2 rounded-xl mr-3">
            <Ionicons name="videocam" size={24} color="#ffffff" />
          </View>
          <Text className="text-2xl font-bold text-white flex-1">{meeting.title}</Text>
        </View>
        
        <View className="flex-row items-center mt-3">
          <Ionicons name="time-outline" size={16} color="#e0e7ff" className="mr-2" />
          <Text className="text-blue-100 text-sm font-medium">
            {new Date(meeting.start_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - 
            {new Date(meeting.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        
        {meeting.project && (
          <View className="flex-row items-center mt-2">
            <Ionicons name="folder-outline" size={16} color="#e0e7ff" className="mr-2" />
            <Text className="text-blue-100 text-sm font-medium">{meeting.project.name}</Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        {/* Agenda Section */}
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6">
          <Text className="text-lg font-bold text-[#0f141a] mb-2">Agenda / Notes</Text>
          <Text className="text-gray-600 leading-6">
            {meeting.agenda || 'No agenda provided for this meeting.'}
          </Text>
        </View>

        {/* Action Items Section */}
        <View className="mb-8">
          <Text className="text-xl font-bold text-[#0f141a] mb-3">Action Items</Text>
          
          <View className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 mb-4 flex-row items-center">
            <View className="flex-1 pr-2">
              <ZeroInput
                placeholder="New action item..."
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                className="mb-0"
                style={{ paddingVertical: 8, height: 44 }}
              />
            </View>
            <TouchableOpacity 
              className={`bg-[#0f141a] h-11 px-4 rounded-xl justify-center items-center ${!newTaskTitle.trim() || isAddingTask ? 'opacity-50' : ''}`}
              onPress={handleCreateActionItem}
              disabled={!newTaskTitle.trim() || isAddingTask}
            >
              {isAddingTask ? (
                <ActivityIndicator size="small" color="#e1c37a" />
              ) : (
                <Text className="text-[#e1c37a] font-bold">Add</Text>
              )}
            </TouchableOpacity>
          </View>

          {actionItems.length === 0 ? (
            <Text className="text-gray-500 text-center py-4">No action items yet.</Text>
          ) : (
            actionItems.map(task => (
              <TaskCard 
                key={task.id}
                task={task}
                onPress={() => router.push(`/task/${task.id}` as any)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
