import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Comment } from '../../../src/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

export default function ActivityFeed() {
  const { session } = useAuth();
  const router = useRouter();
  const [activities, setActivities] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      if (!session?.user) return;

      // Fetch latest 20 comments across the platform.
      // In a real app, this should be filtered by projects/tasks the user is involved in.
      const { data, error } = await supabase
        .from('comments')
        .select('*, user:users(id, email)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching activities:', error);
      } else {
        setActivities(data as unknown as Comment[]);
      }
    } catch (error) {
      console.error('Exception fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useFocusEffect(
    useCallback(() => {
      fetchActivities();
    }, [fetchActivities])
  );

  const renderActivityItem = useCallback(({ item }: { item: Comment }) => {
    const isMe = item.user_id === session?.user?.id;
    const displayName = isMe ? 'You' : (item.user?.full_name || item.user?.name || item.user?.email || 'Unknown User');

    return (
      <TouchableOpacity 
        className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100 flex-row items-start"
        onPress={() => item.task_id ? router.push(`/task/${item.task_id}` as any) : null}
      >
        <View className="bg-[#0f141a] p-2 rounded-full mr-3 mt-1">
          <Ionicons name="chatbubble-ellipses" size={16} color="#e1c37a" />
        </View>
        <View className="flex-1">
          <Text className="text-[#0f141a] text-sm">
            <Text className="font-bold">{displayName}</Text> commented:
          </Text>
          <Text className="text-gray-600 mt-1" numberOfLines={2}>
            "{item.content}"
          </Text>
          <Text className="text-gray-400 text-xs mt-2">
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [session?.user?.id, router]);

  if (loading && activities.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f7f6f2]">
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f7f6f2] p-4">
      <FlashList estimatedItemSize={100}
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={renderActivityItem}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshing={loading}
        onRefresh={fetchActivities}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center py-10 mt-10">
            <Ionicons name="notifications-off-outline" size={48} color="#ccc" />
            <Text className="text-gray-500 text-base mt-4 text-center">No recent activity.</Text>
          </View>
        }
      />
    </View>
  );
}
