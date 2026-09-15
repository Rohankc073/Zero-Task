const isIgnoredChatError = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || err || '').toLowerCase();
  const code = String(err.code || '');
  const status = err.status;
  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === 'C@3' ||
    code === 'HTTP_401' ||
    code === 'HTTP_403' ||
    code === 'NETWORK_ERROR' ||
    code === 'ERR_NETWORK' ||
    msg.includes('credentials') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('not authenticated') ||
    msg.includes('http 401') ||
    msg.includes('fetch failed') ||
    msg.includes('connectexception') ||
    msg.includes('network error')
  );
};

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
    
    // Query channels with active department verification and company information
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*, department:departments(id, name), company:companies(id, name)')
      .order('created_at', { ascending: true });
      
    if (!error && data) {
      // Filter out any phantom management channels and ensure department channels only show present departments
      const channelList = (data as any[]).filter(c => {
        if (c.type === 'management' || c.name?.toLowerCase() === 'management') {
          return false;
        }
        if (c.type === 'department' && !c.department) {
          return false;
        }
        return true;
      }) as ChatChannel[];
      
      // For direct channels, fetch other participant user data
      const directChannels = channelList.filter(c => c.type === 'direct');
      const otherUserIds = [
        ...new Set(
          directChannels.map(c => 
            c.participant_one_id === profile.id ? c.participant_two_id : c.participant_one_id
          ).filter(Boolean) as string[]
        )
      ];

      if (otherUserIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, name, email, role, avatar_url, department_id, company_id, company:companies(id, name)')
          .in('id', otherUserIds);

        if (usersData) {
          const userMap = usersData.reduce((acc: Record<string, any>, u: any) => {
            acc[u.id] = u;
            return acc;
          }, {} as Record<string, any>);

          directChannels.forEach((c: any) => {
            const partnerId = c.participant_one_id === profile.id ? c.participant_two_id : c.participant_one_id;
            if (partnerId && userMap[partnerId]) {
              c.other_user = userMap[partnerId];
              c.name = userMap[partnerId].full_name || userMap[partnerId].name || 'Private Chat';
            }
          });
        }
      }

      setChannels(channelList);
      if (channelList.length > 0) {
        setActiveChannelId((prev) => {
          if (prev && channelList.some((c) => c.id === prev)) return prev;
          const general = channelList.find((c) => c.name.toLowerCase() === 'general');
          return general ? general.id : channelList[0].id;
        });
      }
    } else if (error) {
      if (!isIgnoredChatError(error)) console.error('Error fetching channels:', error);
    }
    setLoadingChannels(false);
  }, [profile]);

  const startDirectChat = useCallback(async (targetUserId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_direct_channel', {
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      const channelId = (data as any)?.channel_id || (data as any)?.id;
      if (channelId) {
        await fetchChannels();
        setActiveChannelId(channelId);
        return channelId;
      }
      return null;
    } catch (err: any) {
      console.error('Error starting direct chat:', err);
      throw err;
    }
  }, [fetchChannels]);

  const fetchHistory = useCallback(async (channelId: string) => {
    if (!channelId) return;
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
      // If user data is missing on some messages, fetch users to hydrate them
      const missingUserIds = [...new Set((data as any[]).filter((m: any) => !m.user && m.user_id).map((m: any) => m.user_id))];
      if (missingUserIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, name, email, role')
          .in('id', missingUserIds);
          
        if (usersData) {
          const userMap = usersData.reduce((acc: Record<string, any>, user: any) => {
            acc[user.id] = user;
            return acc;
          }, {} as any);
          
          data.forEach((m: any) => {
            if (!m.user && userMap[m.user_id]) {
              m.user = userMap[m.user_id];
            }
          });
        }
      }
      setMessages(data as ChatMessage[]);
    } else if (error) {
      if (!isIgnoredChatError(error)) console.error('Error fetching history:', error);
    }
    setLoadingHistory(false);
  }, []);

  const sendMessage = async (
    content: string,
    channelId: string,
    attachmentUrl?: string | null,
    attachmentName?: string | null
  ) => {
    const trimmed = content ? content.trim() : '';
    if (!profile || (!trimmed && !attachmentUrl)) return;
    
    // Generate a temporary ID for optimistic rendering
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      channel_id: channelId,
      user_id: profile.id,
      content: trimmed || null,
      attachment_url: attachmentUrl || undefined,
      attachment_name: attachmentName || undefined,
      created_at: new Date().toISOString(),
      user: profile
    };
    
    // Optimistically add to state (at the beginning because list is inverted: index 0 is newest/bottom)
    setMessages(prev => [optimisticMessage, ...prev]);
    
    try {
      // Fire to Supabase
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: channelId,
          user_id: profile.id,
          content: trimmed || null,
          attachment_url: attachmentUrl || null,
          attachment_name: attachmentName || null
        })
        .select('*')
        .single();
        
      if (error) {
        console.error('Supabase rejected the message insertion:', error.message);
        // Remove optimistic message if it failed
        setMessages(prev => prev.filter(m => m.id !== tempId));
        throw error;
      } else if (data) {
        // Replace the temp message with the real one from the server (with real UUID)
        const realMessage = {
          ...data,
          user: data.user || optimisticMessage.user
        };
        setMessages(prev => prev.map(m => m.id === tempId ? realMessage : m));
      }
    } catch (err: any) {
      console.error('Exception caught during message send:', err.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      throw err;
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
          if (!newMessage || !newMessage.id) return;

          // If user info is not already hydrated, fetch it
          if (!newMessage.user && newMessage.user_id) {
            try {
              const { data: userData } = await supabase
                .from('users')
                .select('id, full_name, name, email, role')
                .eq('id', newMessage.user_id)
                .single();
              if (userData) {
                newMessage.user = userData;
              }
            } catch (err) {
              // fallback gracefully
            }
          }

          setMessages((prev) => {
            // Ensure no duplicates by authoritative ID
            if (prev.some((m) => m.id === newMessage.id)) return prev;

            // Reconcile optimistic temp message if matching sender & content or attachment
            const tempIndex = prev.findIndex(
              (m) =>
                m.id.startsWith('temp-') &&
                m.user_id === newMessage.user_id &&
                ((m.content && m.content === newMessage.content) ||
                 (m.attachment_name && m.attachment_name === newMessage.attachment_name))
            );
            if (tempIndex !== -1) {
              const next = [...prev];
              next[tempIndex] = { ...newMessage, user: next[tempIndex].user || newMessage.user };
              return next;
            }

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
    setMessages,
    loadingChannels,
    loadingHistory,
    fetchChannels,
    fetchHistory,
    sendMessage,
    startDirectChat
  };
}
