import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ChatChannel, ChatMessage } from '../types';
import { useAuth } from '../context/AuthContext';

export function useChat() {
  const { profile } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchChannels = useCallback(async () => {
    if (!profile) return;
    setLoadingChannels(true);
    
    // RLS handles the filtering automatically based on the user's role and department
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (!error && data) {
      setChannels(data as ChatChannel[]);
      if (data.length > 0 && !activeChannelId) {
        setActiveChannelId(data[0].id);
      }
    } else if (error) {
      console.error('Error fetching channels:', error);
    }
    setLoadingChannels(false);
  }, [profile, activeChannelId]);

  const fetchHistory = useCallback(async (channelId: string) => {
    setLoadingHistory(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (!error && data) {
      // Fetch user data manually to avoid schema cache join issues, as we did in TaskPreviewModal
      const userIds = [...new Set(data.map(m => m.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds);
          
        if (usersData) {
          const userMap = usersData.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as any);
          
          data.forEach((m: any) => {
            m.user = userMap[m.user_id];
          });
        }
      }
      setMessages(data as ChatMessage[]);
    } else if (error) {
      console.error('Error fetching history:', error);
    }
    setLoadingHistory(false);
  }, []);

  const sendMessage = async (content: string, channelId: string) => {
    if (!profile || !content.trim()) return;
    
    // Generate a temporary ID for optimistic rendering
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      channel_id: channelId,
      user_id: profile.id,
      content: content.trim(),
      created_at: new Date().toISOString(),
      user: { id: profile.id, full_name: profile.full_name || profile.name || 'You' }
    };
    
    // Optimistically add to state (at the beginning because FlatList is inverted)
    setMessages(prev => [optimisticMessage, ...prev]);
    
    try {
      // Fire to Supabase
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: channelId,
          user_id: profile.id,
          content: content.trim()
        })
        .select('*')
        .single();
        
      if (error) {
        console.error('Supabase rejected the message insertion:', error.message);
        // Remove optimistic message if it failed
        setMessages(prev => prev.filter(m => m.id !== tempId));
      } else if (data) {
        // Replace the temp message with the real one from the server (with real UUID)
        const realMessage = {
          ...data,
          user: optimisticMessage.user
        };
        setMessages(prev => prev.map(m => m.id === tempId ? realMessage : m));
      }
    } catch (err: any) {
      console.error('Exception caught during message send:', err.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  };

  // Setup Realtime Subscription
  useEffect(() => {
    if (!activeChannelId) return;

    // Fetch initial history when channel changes
    fetchHistory(activeChannelId);

    const channel = supabase.channel(`chat_${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        async (payload) => {
          const newMessage = payload.new as ChatMessage;
          
          // The sender's app receives the insert event too, which we now rely on 
          // to render the message since we removed the optimistic update.
          const { data: userData } = await supabase
            .from('users')
            .select('id, full_name')
            .eq('id', newMessage.user_id)
            .single();
            
          if (userData) {
            newMessage.user = userData;
          }
          
          setMessages((prev) => {
            // Ensure no duplicates by ID
            if (prev.find(m => m.id === newMessage.id)) return prev;
            return [newMessage, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, fetchHistory, profile?.id]);

  return {
    channels,
    activeChannelId,
    setActiveChannelId,
    messages,
    loadingChannels,
    loadingHistory,
    fetchChannels,
    sendMessage
  };
}
