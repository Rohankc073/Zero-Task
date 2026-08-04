import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { ZeroInput } from '../../../src/components/ZeroInput';
import { ZeroButton } from '../../../src/components/ZeroButton';
import { TaskPriority } from '../../../src/types';

export default function CreateTask() {
  const router = useRouter();
  const { session, profile } = useAuth();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchProjects() {
      const { data } = await supabase.from('projects').select('id, name').order('created_at', { ascending: false });
      if (data) {
        setProjects(data);
        if (data.length > 0) {
          setSelectedProjectId(data[0].id);
        }
      }
    }
    fetchProjects();
  }, []);

  // If Employee somehow reaches this screen, prevent rendering
  if (profile?.role === 'Employee') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>You do not have permission to create tasks.</Text>
      </View>
    );
  }

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return;
    }
    
    if (!selectedProjectId && profile?.role !== 'Founder') {
      Alert.alert('Error', 'Please select a project');
      return;
    }

    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to create a task');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from('tasks').insert({
        title: title.trim(),
        description: description.trim() || null,
        status: 'To Do',
        priority,
        project_id: selectedProjectId || undefined,
        user_id: session.user.id, // Assigned to creator automatically
      });

      if (error) throw error;
      
      router.back();
    } catch (error: any) {
      console.error('Error creating task:', error);
      Alert.alert('Error', error.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const PriorityButton = ({ value }: { value: TaskPriority }) => (
    <ZeroButton 
      title={value}
      onPress={() => setPriority(value)}
      variant={priority === value ? 'primary' : 'outline'}
      className="flex-1 mx-1"
    />
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView className="flex-1 bg-[#f7f6f2] p-4">
        <ZeroInput
          label="Title *"
          placeholder="What needs to be done?"
          value={title}
          onChangeText={setTitle}
        />
        
        <ZeroInput
          label="Description (Optional)"
          placeholder="Add some details..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ height: 100, textAlignVertical: 'top' }}
        />

        {projects.length > 0 && (
          <>
            <Text className="text-[#0f141a] mb-2 font-bold ml-1 mt-4">Project *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {projects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  onPress={() => setSelectedProjectId(project.id)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    marginRight: 8,
                    borderRadius: 8,
                    backgroundColor: selectedProjectId === project.id ? '#e1c37a' : '#fff',
                    borderWidth: 1,
                    borderColor: selectedProjectId === project.id ? '#e1c37a' : '#ddd',
                  }}
                >
                  <Text style={{ 
                    color: selectedProjectId === project.id ? '#0f141a' : '#666',
                    fontWeight: selectedProjectId === project.id ? 'bold' : 'normal'
                  }}>
                    {project.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text className="text-[#0f141a] mb-2 font-bold ml-1 mt-4">Priority</Text>
        <View className="flex-row justify-between mb-8">
          <PriorityButton value="Low" />
          <PriorityButton value="Medium" />
          <PriorityButton value="High" />
          <PriorityButton value="Urgent" />
        </View>

        <ZeroButton 
          title="Save Task"
          onPress={handleSave}
          loading={loading}
          className="mt-4 mb-8"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
