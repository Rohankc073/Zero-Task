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

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { ChatChannel, ChatMessage } from '../types';
import { ChatService } from '../services/chat/ChatService';
import { useAuth } from '../context/AuthContext';

const isValidUuid = (id?: string | null): boolean => {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

const getChannelsCacheKey = (companyId?: string | null, userId?: string | null) =>
  `@zerotask_chat_channels_${companyId || 'co'}_${userId || 'usr'}`;

const getMessagesCacheKey = (channelId: string) =>
  `@zerotask_chat_messages_${channelId}`;

const historyPromiseMap = new Map<string, Promise<void>>();

export function useChat() {
  const { profile } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 1. Instant Cache Hydration on Mount: Load stored channels from AsyncStorage
  useEffect(() => {
    if (!profile) return;
    const cacheKey = getChannelsCacheKey(profile.company_id, profile.id);
    AsyncStorage.getItem(cacheKey).then((cached) => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const isSuperAdmin = profile.role === 'Super Admin';
            const isFounder = profile.role === 'Founder';
            let initial: ChatChannel[] = parsed;

            if (isSuperAdmin) {
              initial = initial.filter((c: any) => c.type === 'direct' && (c.participant_one_id === profile.id || c.participant_two_id === profile.id || c.other_user?.id || c.type === 'direct'));
            } else if (isFounder) {
              initial = initial.filter((c: any) => 
                (c.name?.toLowerCase() === 'general' || c.type === 'public') ||
                c.type === 'department' ||
                (c.type === 'direct' && (c.participant_one_id === profile.id || c.participant_two_id === profile.id || c.other_user?.id || c.type === 'direct'))
              );
            } else {
              initial = initial.filter((c: any) => 
                (c.name?.toLowerCase() === 'general' || c.type === 'public') ||
                (c.type === 'department' && profile.department_id && c.department_id === profile.department_id) ||
                (c.type === 'direct' && (c.participant_one_id === profile.id || c.participant_two_id === profile.id || c.other_user?.id || c.type === 'direct'))
              );
            }

            if (initial.length > 0) {
              setChannels(initial);
              setActiveChannelId((prev) => {
                if (prev && initial.some((c: any) => c.id === prev)) return prev;
                return null;
              });
            }
          }
        } catch {}
      }
    }).catch(() => {});
  }, [profile?.id, profile?.company_id, profile?.role, profile?.department_id]);

  const fetchChannels = useCallback(async () => {
    if (!profile) return;
    setLoadingChannels(true);
    
    let channelList: ChatChannel[] = [];

    // 1. Primary: Load channels via authoritative FastAPI backend
    try {
      const res = await ChatService.getChannels();
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        channelList = res.data as ChatChannel[];
      }
    } catch {
      // Non-fatal, fallback to Supabase
    }

    // 2. Fallback to Supabase strictly scoped to caller's company
    if (channelList.length === 0) {
      try {
        let query = supabase
          .from('chat_channels')
          .select('*, department:departments(id, name), company:companies(id, name)')
          .order('created_at', { ascending: true });

        if (profile.role !== 'Super Admin' && profile.company_id) {
          query = query.eq('company_id', profile.company_id);
        }

        const { data, error } = await query;
        if (!error && data && Array.isArray(data) && data.length > 0) {
          channelList = data as ChatChannel[];
        } else if (error && !isIgnoredChatError(error)) {
          console.error('Error fetching channels:', error);
        }
      } catch {}
    }

    // 3. Fallback to AsyncStorage cache if network failed to prevent blanking or lost channels
    if (channelList.length === 0) {
      try {
        const cached = await AsyncStorage.getItem(getChannelsCacheKey(profile.company_id, profile.id));
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            channelList = parsed as ChatChannel[];
          }
        }
      } catch {}
    }

    // 4. Strict Role & Company Isolation:
    const isSuperAdmin = profile.role === 'Super Admin';
    const isFounder = profile.role === 'Founder';

    if (isSuperAdmin) {
      // Super Admin ONLY has access to 1-on-1 direct chats where they are a participant
      channelList = channelList.filter(c => c.type === 'direct' && (c.participant_one_id === profile.id || c.participant_two_id === profile.id));
    } else {
      if (profile.company_id) {
        channelList = channelList.filter(c => !c.company_id || c.company_id === profile.company_id);
      }

      // Filter out phantom management channels
      channelList = channelList.filter(c => {
        if (c.type === 'management' || c.name?.toLowerCase() === 'management') {
          return false;
        }
        return true;
      });

      // Direct chats must only be visible to the 2 participants (strictly 1-on-1)
      channelList = channelList.filter(c => {
        if (c.type === 'direct') {
          return c.participant_one_id === profile.id || c.participant_two_id === profile.id;
        }
        return true;
      });

      if (isFounder) {
        // Founder can see General chat, all company department chats, and only their own 1-on-1 direct chats
        channelList = channelList.filter(c => {
          if (c.name?.toLowerCase() === 'general' || c.type === 'public') return true;
          if (c.type === 'department') return true;
          if (c.type === 'direct') return c.participant_one_id === profile.id || c.participant_two_id === profile.id;
          return false;
        });
      } else {
        // Regular user: ONLY General chat, their OWN department chat, and their own 1-on-1 direct chats
        channelList = channelList.filter(c => {
          if (c.name?.toLowerCase() === 'general' || c.type === 'public') return true;
          if (c.type === 'department') {
            return profile.department_id ? c.department_id === profile.department_id : false;
          }
          if (c.type === 'direct') return c.participant_one_id === profile.id || c.participant_two_id === profile.id;
          return false;
        });
      }
    }

    // Ensure General channel is present for company (non-superadmin)
    const hasGeneral = channelList.some(c => c.name?.toLowerCase() === 'general' || c.type === 'public');
    if (!hasGeneral && profile.company_id && !isSuperAdmin) {
      try {
        const { data: existingGen } = await supabase
          .from('chat_channels')
          .select('*, department:departments(id, name), company:companies(id, name)')
          .eq('company_id', profile.company_id)
          .eq('name', 'General')
          .limit(1);

        if (existingGen && existingGen.length > 0) {
          channelList.unshift(existingGen[0] as ChatChannel);
        }
      } catch (err) {
        console.error('Error fetching General channel:', err);
      }
    }

    // For direct channels, ensure participant other_user data and proper naming is hydrated
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
      try {
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
      } catch {}
    }

    // Normalize direct channel names
    directChannels.forEach((c: any) => {
      if (c.other_user) {
        c.name = c.other_user.full_name || c.other_user.name || c.name || 'Private Chat';
      }
    });

    // Ensure General channel is guaranteed present for company users (non-superadmin)
    const hasGen = channelList.some(c => c.name?.toLowerCase() === 'general' || c.type === 'public');
    if (!hasGen && !isSuperAdmin) {
      channelList.unshift({
        id: `general-${profile.company_id || 'main'}`,
        name: 'General',
        type: 'public',
        company_id: profile.company_id || '',
        is_private: false,
        created_at: new Date().toISOString(),
      } as ChatChannel);
    }

    // Merge any existing direct channels from previous state/cache so they are never lost
    setChannels((prev) => {
      const prevDirects = prev.filter(c => c.type === 'direct');
      for (const pd of prevDirects) {
        if (!channelList.some(c => c.id === pd.id)) {
          channelList.push(pd);
        }
      }
      return prev;
    });

    // Priority Sort Order:
    // 0: General Chat (always first for non-superadmin)
    // 1: Department Chat(s)
    // 2: Direct / 1-on-1 Private Chats
    channelList.sort((a, b) => {
      const aIsGen = a.name?.toLowerCase() === 'general' || a.type === 'public';
      const bIsGen = b.name?.toLowerCase() === 'general' || b.type === 'public';
      if (aIsGen) return -1;
      if (bIsGen) return 1;
      if (a.type === 'department' && b.type !== 'department') return -1;
      if (a.type !== 'department' && b.type === 'department') return 1;
      if (a.type === 'direct' && b.type !== 'direct') return -1;
      if (a.type !== 'direct' && b.type === 'direct') return 1;
      return 0;
    });

    if (channelList.length > 0) {
      setChannels(channelList);
      AsyncStorage.setItem(getChannelsCacheKey(profile.company_id, profile.id), JSON.stringify(channelList)).catch(() => {});
      
      setActiveChannelId((prev) => {
        if (prev && channelList.some((c) => c.id === prev)) return prev;
        return null;
      });
    }

    setLoadingChannels(false);
    return channelList;
  }, [profile]);

  const startDirectChat = useCallback(async (targetUserId: string): Promise<string | null> => {
    try {
      let createdChannel: any = null;
      let channelId: string | null = null;

      // 1. Primary: Use FastAPI ChatService with strict company isolation
      try {
        const res = await ChatService.getOrCreateDirectChannel(targetUserId);
        if (res.data) {
          channelId = (res.data as any).channel_id || (res.data as any).id;
          createdChannel = res.data;
        }
      } catch (apiErr) {
        console.warn('FastAPI getOrCreateDirectChannel failed, falling back to Supabase:', apiErr);
      }

      // 2. Fallback to Supabase RPC
      if (!channelId) {
        const { data, error } = await supabase.rpc('get_or_create_direct_channel', {
          p_target_user_id: targetUserId,
        });
        if (error) throw error;
        channelId = (data as any)?.channel_id || (data as any)?.id;
        if (channelId) {
          createdChannel = data;
        }
      }

      if (channelId) {
        // Immediate optimistic update of channels list so the new direct chat pill is immediately visible
        setChannels((prev) => {
          const exists = prev.some(c => c.id === channelId);
          if (exists) return prev;
          
          const p1 = profile?.id && targetUserId ? (profile.id < targetUserId ? profile.id : targetUserId) : profile?.id;
          const p2 = profile?.id && targetUserId ? (profile.id < targetUserId ? targetUserId : profile.id) : targetUserId;

          const newChan: ChatChannel = {
            id: channelId!,
            name: createdChannel?.target_user_name || createdChannel?.name || 'Private Chat',
            type: 'direct',
            company_id: profile?.company_id || '',
            is_private: true,
            created_at: new Date().toISOString(),
            participant_one_id: createdChannel?.participant_one_id || p1,
            participant_two_id: createdChannel?.participant_two_id || p2,
            other_user: createdChannel?.other_user || {
              id: targetUserId,
              name: createdChannel?.target_user_name || 'User',
              full_name: createdChannel?.target_user_name || 'User',
            },
          } as ChatChannel;

          const gen = prev.find(c => c.name?.toLowerCase() === 'general' || c.type === 'public');
          const others = prev.filter(c => c.id !== gen?.id && c.id !== channelId);
          const updated = gen ? [gen, newChan, ...others] : [newChan, ...others];

          if (profile) {
            AsyncStorage.setItem(getChannelsCacheKey(profile.company_id, profile.id), JSON.stringify(updated)).catch(() => {});
          }
          return updated;
        });

        setActiveChannelId(channelId);
        await fetchHistory(channelId);
        // Refresh full channel list in background
        fetchChannels().catch(() => {});
        return channelId;
      }
      return null;
    } catch (err: any) {
      console.error('Error starting direct chat:', err);
      throw err;
    }
  }, [fetchChannels, profile]);

  const fetchHistory = useCallback(async (channelId: string, silent: boolean = false) => {
    if (!channelId || !isValidUuid(channelId)) return;
    
    if (historyPromiseMap.has(channelId)) {
      return historyPromiseMap.get(channelId);
    }
    
    const promise = (async () => {
      if (!silent) {
        setLoadingHistory(true);
      }
      
      // 0. Instant Cache Hydration: Load cached messages immediately from AsyncStorage
      let hasCache = false;
      try {
        const cached = await AsyncStorage.getItem(getMessagesCacheKey(channelId));
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            hasCache = true;
          }
        }
      } catch {}

      if (!hasCache && !silent) {
        setMessages([]); // Clear previous messages if no cache for new channel
      }

      let fetchedSuccessfully = false;
      let isNetworkOrTimeout = false;

      // 1. Primary: Load authoritative message history via FastAPI ChatService
      try {
        const res = await ChatService.getMessages(channelId, 100);
        if (res.data && Array.isArray(res.data)) {
          // Sort descending (newest first for inverted list)
          const sorted = [...(res.data as ChatMessage[])].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setMessages(sorted);
          AsyncStorage.setItem(getMessagesCacheKey(channelId), JSON.stringify(sorted)).catch(() => {});
          fetchedSuccessfully = true;
          if (!silent) setLoadingHistory(false);
          return;
        } else if (res.error) {
          const code = String(res.error.code || '');
          const msg = String(res.error.message || '').toLowerCase();
          if (code === 'NETWORK_ERROR' || code === 'TIMEOUT' || msg.includes('network') || msg.includes('timeout') || msg.includes('abort')) {
            isNetworkOrTimeout = true;
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('network') || msg.includes('timeout') || msg.includes('abort') || err?.status === 429) {
          isNetworkOrTimeout = true;
        }
      }

      // 2. Fallback to Supabase (only if not a hard network failure on the same host)
      if (!fetchedSuccessfully && !isNetworkOrTimeout) {
        try {
          const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: false })
            .limit(100);
            
          if (!error && data && Array.isArray(data)) {
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
            const sorted = [...(data as ChatMessage[])].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setMessages(sorted);
            AsyncStorage.setItem(getMessagesCacheKey(channelId), JSON.stringify(sorted)).catch(() => {});
          } else if (error && !isIgnoredChatError(error)) {
            console.error('Error fetching history:', error);
          }
        } catch (err) {
          if (!isIgnoredChatError(err)) console.error('Error in fetchHistory fallback:', err);
        }
      }
    })().finally(() => {
      if (!silent) {
        setLoadingHistory(false);
      }
    });
    
    historyPromiseMap.set(channelId, promise);
    try {
      await promise;
    } finally {
      setTimeout(() => {
        historyPromiseMap.delete(channelId);
      }, 2000); // 2-second debounce to prevent duplicate requests
    }
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
        const channelName = isGen ? 'General' : (profile.department?.name || 'Department');
        
        // First check if it already exists to prevent duplicates
        const { data: existing } = await supabase
          .from('chat_channels')
          .select('*, department:departments(id, name), company:companies(id, name)')
          .eq('company_id', profile.company_id)
          .eq('name', channelName)
          .limit(1);

        if (existing && existing.length > 0) {
          targetChannelId = existing[0].id;
          setActiveChannelId(targetChannelId);
          setChannels(prev => prev.map(c => c.id === channelId ? existing[0] as ChatChannel : c));
        } else {
          const { data: newChan } = await supabase
            .from('chat_channels')
            .insert({
              name: channelName,
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
      let sentSuccessfully = false;
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
          sentSuccessfully = true;
        } else if (res.error) {
          console.warn('ChatService.sendMessage returned error, falling back to Supabase:', res.error);
        }
      } catch (backendErr) {
        console.warn('ChatService.sendMessage failed, falling back to Supabase:', backendErr);
      }

      if (!sentSuccessfully) {
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
            user: (data as any).user || optimisticMessage.user
          };
          setMessages(prev => prev.map(m => m.id === tempId ? realMessage : m));
        }
      }

      // Revalidate history silently in background
      fetchHistory(targetChannelId, true);
    } catch (err: any) {
      console.error('Exception caught during message send:', err.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      throw err;
    }
  };

  // Setup Realtime & Polling Subscriptions
  useEffect(() => {
    if (!activeChannelId) return;

    // Check cache first before resetting to prevent flash of empty screen
    const cacheKey = getMessagesCacheKey(activeChannelId);
    AsyncStorage.getItem(cacheKey).then((cached) => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            fetchHistory(activeChannelId, true);
            return;
          }
        } catch {}
      }
      setMessages([]);
      fetchHistory(activeChannelId, false);
    }).catch(() => {
      setMessages([]);
      fetchHistory(activeChannelId, false);
    });

    // 1. Supabase Postgres changes subscription
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

            const updated = [newMessage, ...prev];
            AsyncStorage.setItem(getMessagesCacheKey(activeChannelId), JSON.stringify(updated)).catch(() => {});
            return updated;
          });
        }
      )
      .subscribe();

    // 2. ChatService WebSocket direct subscription
    const unsubWs = ChatService.subscribeToMessages((rawMsg) => {
      if (rawMsg && String(rawMsg.channel_id) === String(activeChannelId)) {
        const newMsg: ChatMessage = {
          id: rawMsg.id,
          channel_id: rawMsg.channel_id,
          user_id: rawMsg.user_id,
          content: rawMsg.content,
          attachment_url: rawMsg.attachment_url || undefined,
          attachment_name: rawMsg.attachment_name || undefined,
          created_at: rawMsg.created_at,
          user: rawMsg.user as any,
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          const tempIndex = prev.findIndex(
            (m) =>
              m.id.startsWith('temp-') &&
              m.user_id === newMsg.user_id &&
              ((m.content && m.content === newMsg.content) ||
               (m.attachment_name && m.attachment_name === newMsg.attachment_name))
          );
          if (tempIndex !== -1) {
            const next = [...prev];
            next[tempIndex] = { ...newMsg, user: next[tempIndex].user || newMsg.user };
            AsyncStorage.setItem(getMessagesCacheKey(activeChannelId), JSON.stringify(next)).catch(() => {});
            return next;
          }
          const updated = [newMsg, ...prev];
          AsyncStorage.setItem(getMessagesCacheKey(activeChannelId), JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
    });

    // 3. Heartbeat polling (every 5s) to guarantee new messages arrive even if tunnel WebSocket drops (SILENT: no loading spinner)
    const pollInterval = setInterval(() => {
      fetchHistory(activeChannelId, true);
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      unsubWs();
      clearInterval(pollInterval);
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
