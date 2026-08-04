import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Comment } from '../types';
import { ZeroInput } from './ZeroInput';
import { ZeroButton } from './ZeroButton';
import { Ionicons } from '@expo/vector-icons';

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { session } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComments = async () => {
    try {
      setLoading(true);
      // Fetch comments for this task, joining with the 'users' table in public schema
      // NOTE: This requires a 'users' table or view in the public schema that mirrors auth.users
      const { data, error } = await supabase
        .from('comments')
        .select('*, user:users(id, email, full_name)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching comments:', error);
      } else {
        setComments(data as unknown as Comment[]);
      }
    } catch (error) {
      console.error('Exception fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) {
      fetchComments();
    }
  }, [taskId]);

  const handleSend = async () => {
    if (!newComment.trim()) return;
    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to comment');
      return;
    }

    try {
      setIsSubmitting(true);
      const tempContent = newComment.trim();
      setNewComment('');

      const { data, error } = await supabase
        .from('comments')
        .insert({
          content: tempContent,
          task_id: taskId,
          user_id: session.user.id,
        })
        .select('*, user:users(id, email)')
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setComments((prev) => [...prev, data as unknown as Comment]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to post comment');
      setNewComment(newComment); // restore input on failure
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderComment = useCallback(({ item }: { item: Comment }) => {
    const isMe = item.user_id === session?.user?.id;
    const displayName = isMe ? 'You' : (item.user?.full_name || item.user?.name || item.user?.email || 'Unknown User');

    return (
      <View className={`mb-3 flex-row ${isMe ? 'justify-end' : 'justify-start'}`}>
        <View 
          className={`max-w-[85%] p-3 rounded-2xl ${
            isMe ? 'bg-[#0f141a] rounded-br-sm' : 'bg-white border border-gray-200 rounded-bl-sm'
          }`}
        >
          <Text className={`text-xs font-bold mb-1 ${isMe ? 'text-[#e1c37a]' : 'text-gray-500'}`}>
            {displayName}
          </Text>
          <Text className={`${isMe ? 'text-white' : 'text-[#0f141a]'}`}>
            {item.content}
          </Text>
          <Text className={`text-[10px] mt-1 text-right ${isMe ? 'text-gray-400' : 'text-gray-400'}`}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  }, [session?.user?.id]);

  return (
    <View className="bg-[#f7f6f2] rounded-t-3xl p-4 shadow-sm mt-2">
      <Text className="text-lg font-bold text-[#0f141a] mb-3">Comments</Text>
      
      {loading && comments.length === 0 ? (
        <ActivityIndicator size="small" color="#e1c37a" />
      ) : (
        <View>
          {comments.length === 0 ? (
            <Text className="text-gray-500 text-center py-4">No comments yet. Be the first!</Text>
          ) : (
            comments.map((item) => (
              <React.Fragment key={item.id}>
                {renderComment({ item })}
              </React.Fragment>
            ))
          )}
        </View>
      )}

      <View className="flex-row items-center mt-3 pt-2 border-t border-gray-200">
        <View className="flex-1">
          <ZeroInput
            placeholder="Add a comment..."
            value={newComment}
            onChangeText={setNewComment}
            className="mb-0" // remove bottom margin for inline layout
            style={{ paddingVertical: 10 }}
          />
        </View>
        <ZeroButton
          title="Send"
          onPress={handleSend}
          disabled={!newComment.trim() || isSubmitting}
          className="w-auto ml-2 px-4 py-3"
        />
      </View>
    </View>
  );
}
