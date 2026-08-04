import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Task, Meeting } from '../../../src/types';
import { MeetingScheduler } from '../../../src/components/MeetingScheduler';

export default function CalendarScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScheduler, setShowScheduler] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (!session?.user) return;

      // Fetch tasks (that have due dates)
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', session.user.id)
        .not('due_date', 'is', null);

      if (!taskError && taskData) setTasks(taskData as Task[]);

      // Fetch meetings (via participation or organizer)
      // For simplicity in this tutorial phase, fetching meetings where user is organizer
      // A full production app would also fetch meetings where the user is in meeting_participants
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .eq('organizer_id', session.user.id);

      if (!meetingError && meetingData) setMeetings(meetingData as Meeting[]);

    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [session?.user?.id])
  );

  // Map tasks and meetings to calendar marked dates
  const getMarkedDates = () => {
    const marked: any = {};
    
    // Default selected styling
    marked[selectedDate] = { selected: true, selectedColor: '#0f141a', selectedTextColor: '#e1c37a' };

    tasks.forEach(t => {
      if (t.due_date) {
        const date = t.due_date;
        if (!marked[date]) marked[date] = { dots: [] };
        if (marked[date].selected) return; // Keep selected styling but we'd need a custom approach to show both. Let's just merge.
        marked[date].dots = marked[date].dots || [];
        marked[date].dots.push({ color: '#e1c37a', key: `task-${t.id}` });
      }
    });

    meetings.forEach(m => {
      const date = m.start_time.split('T')[0];
      if (!marked[date]) marked[date] = { dots: [] };
      marked[date].dots = marked[date].dots || [];
      marked[date].dots.push({ color: '#3b82f6', key: `meeting-${m.id}` }); // Blue dot for meetings
    });

    return marked;
  };

  const dayTasks = tasks.filter(t => t.due_date === selectedDate);
  const dayMeetings = meetings.filter(m => m.start_time.startsWith(selectedDate));

  return (
    <View className="flex-1 bg-[#f7f6f2]">
      {/* Header Actions */}
      <View className="flex-row justify-end p-4">
        {profile?.role !== 'Employee' && (
          <TouchableOpacity 
            className="bg-[#0f141a] px-4 py-2 rounded-full flex-row items-center shadow-sm"
            onPress={() => setShowScheduler(true)}
          >
            <Ionicons name="calendar-outline" size={16} color="#e1c37a" />
            <Text className="text-[#e1c37a] font-bold ml-2">New Meeting</Text>
          </TouchableOpacity>
        )}
      </View>

      <Calendar
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        markedDates={getMarkedDates()}
        markingType="multi-dot"
        theme={{
          backgroundColor: '#f7f6f2',
          calendarBackground: '#f7f6f2',
          textSectionTitleColor: '#b6c1cd',
          selectedDayBackgroundColor: '#0f141a',
          selectedDayTextColor: '#e1c37a',
          todayTextColor: '#e1c37a',
          dayTextColor: '#2d4150',
          textDisabledColor: '#d9e1e8',
          dotColor: '#0f141a',
          selectedDotColor: '#ffffff',
          arrowColor: '#0f141a',
          monthTextColor: '#0f141a',
          indicatorColor: '#0f141a',
          textDayFontWeight: '500',
          textMonthFontWeight: 'bold',
          textDayHeaderFontWeight: 'bold'
        }}
        style={{ marginBottom: 10 }}
      />

      <ScrollView className="flex-1 px-4 bg-white rounded-t-3xl pt-6 shadow-sm">
        <Text className="text-xl font-bold text-[#0f141a] mb-4">
          Agenda for {new Date(selectedDate).toLocaleDateString()}
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#e1c37a" className="mt-4" />
        ) : (
          <>
            {dayMeetings.length === 0 && dayTasks.length === 0 && (
              <Text className="text-gray-500 text-center mt-4">No events scheduled.</Text>
            )}

            {dayMeetings.map(m => (
              <TouchableOpacity 
                key={m.id}
                className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl mb-3"
                onPress={() => router.push(`/meeting/${m.id}` as any)}
              >
                <View className="flex-row items-center mb-1">
                  <Ionicons name="videocam-outline" size={16} color="#3b82f6" className="mr-2" />
                  <Text className="text-blue-700 font-bold">{m.title}</Text>
                </View>
                <Text className="text-gray-600 text-xs">
                  {new Date(m.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                  {new Date(m.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            ))}

            {dayTasks.map(t => (
              <TouchableOpacity 
                key={t.id}
                className="bg-[#fcfbf9] border-l-4 border-[#e1c37a] p-4 rounded-r-xl mb-3"
                onPress={() => router.push(`/task/${t.id}` as any)}
              >
                <View className="flex-row items-center mb-1">
                  <Ionicons name="checkmark-circle-outline" size={16} color="#0f141a" className="mr-2" />
                  <Text className="text-[#0f141a] font-bold">{t.title}</Text>
                </View>
                <Text className="text-gray-500 text-xs">Due Today</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <MeetingScheduler 
        visible={showScheduler}
        onClose={() => setShowScheduler(false)}
        onSuccess={fetchData}
      />
    </View>
  );
}
