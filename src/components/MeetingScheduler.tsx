import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';
import { ZeroInput } from './ZeroInput';
import { ZeroButton } from './ZeroButton';

interface MeetingSchedulerProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MeetingScheduler({ visible, onClose, onSuccess }: MeetingSchedulerProps) {
  const { session } = useAuth();
  
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 3600000)); // Default 1 hour later
  
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchProjects();
    }
  }, [visible]);

  const fetchProjects = async () => {
    if (!session?.user) return;
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('owner_id', session.user.id)
      .order('name');
    if (!error && data) {
      setProjects(data as Project[]);
    }
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    const isStart = showPicker === 'start';
    
    // Extract date from event if selectedDate is missing
    const timestamp = event?.nativeEvent?.timestamp;
    const finalDate = selectedDate || (timestamp ? new Date(timestamp) : undefined);
    
    if (finalDate) {
      if (Platform.OS === 'android') {
        if (pickerMode === 'date') {
          // Keep picker open, but switch to time picker
          const current = isStart ? startDate : endDate;
          const newDate = new Date(current);
          newDate.setFullYear(finalDate.getFullYear(), finalDate.getMonth(), finalDate.getDate());
          if (isStart) setStartDate(newDate);
          else setEndDate(newDate);
          
          setPickerMode('time');
        } else {
          // Time selected, we are done
          const current = isStart ? startDate : endDate;
          const newDate = new Date(current);
          newDate.setHours(finalDate.getHours(), finalDate.getMinutes());
          if (isStart) setStartDate(newDate);
          else setEndDate(newDate);
          
          setShowPicker(null);
        }
      } else {
        // iOS handles datetime in one go
        if (isStart) setStartDate(finalDate);
        else setEndDate(finalDate);
      }
    } else {
      setShowPicker(null);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Meeting title is required');
      return;
    }
    if (endDate <= startDate) {
      Alert.alert('Error', 'End time must be after start time');
      return;
    }
    if (!session?.user) return;

    try {
      setLoading(true);
      // 1. Create meeting
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          title: title.trim(),
          agenda: agenda.trim() || null,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          project_id: selectedProjectId || null,
          organizer_id: session.user.id,
        })
        .select()
        .single();

      if (meetingError) throw meetingError;

      // 2. Add organizer as participant
      const { error: partError } = await supabase
        .from('meeting_participants')
        .insert({
          meeting_id: meeting.id,
          user_id: session.user.id,
        });

      if (partError) throw partError;

      // Reset state and close
      setTitle('');
      setAgenda('');
      setStartDate(new Date());
      setEndDate(new Date(Date.now() + 3600000));
      setSelectedProjectId(null);
      
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to schedule meeting');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-[#f7f6f2] h-[85%] rounded-t-3xl p-4">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-bold text-[#0f141a]">Schedule Meeting</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={28} color="#0f141a" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <ZeroInput label="Title *" placeholder="Weekly Sync" value={title} onChangeText={setTitle} />
            <ZeroInput label="Agenda" placeholder="What are we discussing?" value={agenda} onChangeText={setAgenda} multiline style={{ height: 80 }} />

            {/* Date Time Selectors */}
            <Text className="text-[#0f141a] font-bold ml-1 mb-2">Time</Text>
            <View className="flex-row justify-between mb-4">
              <TouchableOpacity 
                className="flex-1 bg-white p-3 rounded-xl border border-gray-200 mr-2 items-center"
                onPress={() => { setShowPicker('start'); setPickerMode('date'); }}
              >
                <Text className="text-gray-500 text-xs mb-1">Start Time</Text>
                <Text className="font-semibold text-[#0f141a]">{formatDateTime(startDate)}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                className="flex-1 bg-white p-3 rounded-xl border border-gray-200 ml-2 items-center"
                onPress={() => { setShowPicker('end'); setPickerMode('date'); }}
              >
                <Text className="text-gray-500 text-xs mb-1">End Time</Text>
                <Text className="font-semibold text-[#0f141a]">{formatDateTime(endDate)}</Text>
              </TouchableOpacity>
            </View>

            {showPicker && (
              <DateTimePicker
                value={showPicker === 'start' ? startDate : endDate}
                mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
                display="default"
                onValueChange={onChangeDate}
                onDismiss={() => setShowPicker(null)}
                minimumDate={new Date()}
              />
            )}

            {/* Project Selection */}
            {projects.length > 0 && (
              <>
                <Text className="text-[#0f141a] font-bold ml-1 mb-2 mt-2">Project (Optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                  <ZeroButton 
                    title="None"
                    onPress={() => setSelectedProjectId(null)}
                    variant={selectedProjectId === null ? 'primary' : 'outline'}
                    className="mr-2 px-4"
                  />
                  {projects.map(proj => (
                    <ZeroButton 
                      key={proj.id}
                      title={proj.name}
                      onPress={() => setSelectedProjectId(proj.id)}
                      variant={selectedProjectId === proj.id ? 'primary' : 'outline'}
                      className="mr-2 px-4"
                    />
                  ))}
                </ScrollView>
              </>
            )}

            <ZeroButton title="Schedule Meeting" onPress={handleSave} loading={loading} className="mt-4 mb-10" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
