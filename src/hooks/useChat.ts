const isIgnoredChatError = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || err || '').toLowerCase();
  const code = String(err.code || '');
  const status = err.status;
  return (
    status === 401 ||
    status === 403 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === '401' ||
    code === '403' ||
    code === '500' ||
    code === '502' ||
    code === '503' ||
    code === '504' ||
    code === 'C@3' ||
    code === 'HTTP_401' ||
    code === 'HTTP_403' ||
    code === 'HTTP_500' ||
    code === 'HTTP_502' ||
    code === 'HTTP_503' ||
    code === 'HTTP_504' ||
    code === 'NETWORK_ERROR' ||
    code === 'ERR_NETWORK' ||
    msg.includes('credentials') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('not authenticated') ||
    msg.includes('http 401') ||
    msg.includes('http 403') ||
    msg.includes('http 500') ||
    msg.includes('http 502') ||
    msg.includes('http 503') ||
    msg.includes('http 504') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('service unavailable') ||
    msg.includes('bad gateway') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('connectexception') ||
    msg.includes('network error')
  );
};

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ChatChannel, ChatMessage } from '../types';
import { ChatService } from '../services/chat/ChatService';
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
    
    let channelList: ChatChannel[] = [];

    // 1. Primary: Load channels via authoritative FastAPI backend
    try {
      const res = await ChatService.getChannels();
      if (res.data && Array.isArray(res.data)) {
        channelList = res.data as ChatChannel[];
      }
    } catch {
      // Non-fatal, fallback to Supabase
    }

    // 2. Fallback to Supabase strictly scoped to caller's company
    if (channelList.length === 0) {
      let query = supabase
        .from('chat_channels')
        .select('*, department:departments(id, name), company:companies(id, name)')
        .order('created_at', { ascending: true });

      if (profile.role !== 'Super Admin' && profile.company_id) {
        query = query.eq('company_id', profile.company_id);
      }

      const { data, error } = await query;
      if (!error && data) {
        channelList = data as ChatChannel[];
      } else if (error && !isIgnoredChatError(error)) {
        console.error('Error fetching channels:', error);
      }
    }

    // 3. Strict Company Isolation: For non-SuperAdmin, exclude any channels outside profile.company_id
    if (profile.role !== 'Super Admin' && profile.company_id) {
      channelList = channelList.filter(c => !c.company_id || c.company_id === profile.company_id);
    }

    // Filter out phantom management channels
    channelList = channelList.filter(c => {
      if (c.type === 'management' || c.name?.toLowerCase() === 'management') {
        return false;
      }
      return true;
    });

    // Ensure General channel is present for company
    const hasGeneral = channelList.some(c => c.name?.toLowerCase() === 'general' || c.type === 'public');
    if (!hasGeneral && profile.company_id) {
      try {
        const { data: existingGen } = await supabase
          .from('chat_channels')
          .select('*, department:departments(id, name), company:companies(id, name)')
          .eq('company_id', profile.company_id)
          .eq('name', 'General')
          .maybeSingle();

        if (existingGen) {
          channelList.unshift(existingGen as ChatChannel);
        } else {
          const { data: newGen } = await supabase
            .from('chat_channels')
            .insert({
              name: 'General',
              type: 'public',
              company_id: profile.company_id,
              is_private: false,
            })
            .select('*, department:departments(id, name), company:companies(id, name)')
            .maybeSingle();
          if (newGen) {
            channelList.unshift(newGen as ChatChannel);
          }
        }
      } catch {}
    }

    // Ensure Department channel is present for user's department
    if (profile.department_id && profile.company_id) {
      const hasDept = channelList.some(c => c.type === 'department' && c.department_id === profile.department_id);
      if (!hasDept) {
        try {
          const { data: existingDept } = await supabase
            .from('chat_channels')
            .select('*, department:departments(id, name), company:companies(id, name)')
            .eq('company_id', profile.company_id)
            .eq('department_id', profile.department_id)
            .maybeSingle();

          if (existingDept) {
            channelList.push(existingDept as ChatChannel);
          } else {
            const { data: deptData } = await supabase
              .from('departments')
              .select('name')
              .eq('id', profile.department_id)
              .maybeSingle();
            const deptName = deptData?.name || profile.department?.name || 'Department';

            const { data: newDept } = await supabase
              .from('chat_channels')
              .insert({
                name: deptName,
                type: 'department',
                company_id: profile.company_id,
                department_id: profile.department_id,
                is_private: false,
              })
              .select('*, department:departments(id, name), company:companies(id, name)')
              .maybeSingle();
            if (newDept) {
              channelList.push(newDept as ChatChannel);
            }
          }
        } catch {}
      }
    }

    // Resilient fallback objects if network/table was empty so UI never blanks
    if (!channelList.some(c => c.name?.toLowerCase() === 'general' || c.type === 'public')) {
      channelList.unshift({
        id: `general-${profile.company_id || 'company'}`,
        name: 'General',
        type: 'public',
        company_id: profile.company_id || '',
        created_at: new Date().toISOString(),
      } as ChatChannel);
    }

    if (profile.department_id && !channelList.some(c => c.type === 'department' && c.department_id === profile.department_id)) {
      channelList.push({
        id: `dept-${profile.department_id}`,
        name: profile.department?.name || 'Department',
        type: 'department',
        department_id: profile.department_id,
        company_id: profile.company_id || '',
        created_at: new Date().toISOString(),
      } as ChatChannel);
    }
    
    // For direct channels, fetch other participant user data if missing
    const directChannels = channelList.filter(c => c.type === 'direct');
    const otherUserIds = [
      ...new Set(
        directChannels
          .filter(c => !c.other_user)
          .map(c => c.participant_one_id === profile.id ? c.participant_two_id : c.participant_one_id)
          .filter(Boolean) as string[]
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

    // Sort to place General first
    channelList.sort((a, b) => {
      if (a.name?.toLowerCase() === 'general') return -1;
      if (b.name?.toLowerCase() === 'general') return 1;
      if (a.type !== 'direct' && b.type === 'direct') return -1;
      if (a.type === 'direct' && b.type !== 'direct') return 1;
      return 0;
    });

    setChannels(channelList);
    if (channelList.length > 0) {
      setActiveChannelId((prev) => {
        if (prev && channelList.some((c) => c.id === prev)) return prev;
        const general = channelList.find((c) => c.name?.toLowerCase() === 'general' || c.type === 'public');
        return general ? general.id : channelList[0].id;
      });
    }
    setLoadingChannels(false);
    return channelList;
  }, [profile]);

  const startDirectChat = useCallback(async (targetUserId: string): Promise<string | null> => {
    try {
      // 1. Primary: Use FastAPI ChatService with strict company isolation
      const res = await ChatService.getOrCreateDirectChannel(targetUserId);
      if (res.data) {
        const channelId = (res.data as any).channel_id || res.data.id;
        if (channelId) {
          await fetchChannels();
          setActiveChannelId(channelId);
          return channelId;
        }
      } else if (res.error) {
        throw new Error(res.error.message || 'Failed to start direct conversation');
      }

      // 2. Fallback to Supabase RPC
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
    
    // 1. Primary: Load authoritative message history via FastAPI ChatService
    try {
      const res = await ChatService.getMessages(channelId, 50);
      if (res.data && Array.isArray(res.data)) {
        // Sort descending (newest first for inverted list)
        const sorted = [...(res.data as ChatMessage[])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMessages(sorted);
        setLoadingHistory(false);
        return;
      }
    } catch {
      // Fallback to Supabase
    }

    // 2. Fallback to Supabase
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
    
    let targetChannelId = channelId;
    if (channelId.startsWith('general-') || channelId.startsWith('dept-')) {
      try {
        const isGen = channelId.startsWith('general-');
        const { data: newChan } = await supabase
          .from('chat_channels')
          .insert({
            name: isGen ? 'General' : (profile.department?.name || 'Department'),
            type: isGen ? 'public' : 'department',
            company_id: profile.company_id,
            department_id: isGen ? null : profile.department_id,
            is_private: false,
          })
          .select('*, department:departments(id, name), company:companies(id, name)')
          .single();
        if (newChan?.id) {
          targetChannelId = newChan.id;
          setActiveChannelId(targetChannelId);
          setChannels(prev => prev.map(c => c.id === channelId ? newChan as ChatChannel : c));
        }
      } catch (err) {
        console.warn('Could not auto-create channel before sending message:', err);
      }
    }

    // Generate a temporary ID for optimistic rendering
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      channel_id: targetChannelId,
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
      // 1. Primary: Use authoritative FastAPI ChatService
      try {
        const res = await ChatService.sendMessage(targetChannelId, trimmed, {
          url: attachmentUrl || '',
          name: attachmentName || '',
        });
        if (res.data) {
          const realMessage: ChatMessage = {
            ...(res.data as any),
            user: (res.data as any).user || optimisticMessage.user,
          };
          setMessages(prev => prev.map(m => m.id === tempId ? realMessage : m));
          return;
        }
      } catch (backendErr) {
        // Fallback to Supabase
      }

      // 2. Fallback to Supabase direct insert
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: targetChannelId,
          user_id: profile.id,
          content: trimmed || null,
          attachment_url: attachmentUrl || null,
          attachment_name: attachmentName || null
        })
        .select('*')
        .single();
        
      if (error) {
        console.error('Supabase rejected the message insertion:', error.message);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        throw error;
      } else if (data) {
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
