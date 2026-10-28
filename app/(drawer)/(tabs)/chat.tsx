import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert, ScrollView, Image, Keyboard, KeyboardEvent, FlatList, BackHandler } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { processAndUploadAttachment } from '../../../src/utils/attachmentPipeline';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useChat } from '../../../src/hooks/useChat';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import ChatMessage from '../../../src/components/ChatMessage';
import { NewDirectChatModal } from '../../../src/components/chat/NewDirectChatModal';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { useResponsive } from '../../../src/hooks/useResponsive';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { isSmallDevice, isTablet, safeBottom } = useResponsive();
  const { session, profile } = useAuth();
  const { 
    channels, 
    activeChannelId, 
    setActiveChannelId, 
    messages, 
    loadingChannels, 
    loadingHistory,
    fetchChannels,
    fetchHistory,
    sendMessage,
    startDirectChat
  } = useChat();
  
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<{ uri: string, name: string, type: string, isImage: boolean } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isNewChatModalVisible, setIsNewChatModalVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'groups' | 'favourites'>('all');
  const isChatView = activeChannelId !== null;

  const isFirstMount = useRef(true);
  const isModalOpenRef = useRef(false);
  const channelScrollRef = useRef<ScrollView>(null);

  // Manual Keyboard Handling (Android & iOS)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const dynamicPaddingBottom = keyboardHeight > 0
    ? (Platform.OS === 'ios' ? Math.max(0, keyboardHeight - insets.bottom) : keyboardHeight)
    : Math.max(0, safeBottom);

  // Fetch channels when component mounts
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Handle pull to refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeChannelId) {
        await fetchHistory(activeChannelId);
      }
      await fetchChannels();
    } catch (err) {
      console.error('Error refreshing chat:', err);
    } finally {
      setRefreshing(false);
    }
  }, [activeChannelId, fetchHistory, fetchChannels]);

  const activeChannelIdRef = useRef(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // Refresh channels and active conversation history on focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const initChatScreen = async () => {
        await fetchChannels();
        if (!isMounted) return;

        if (activeChannelIdRef.current) {
          fetchHistory(activeChannelIdRef.current, true);
        }
      };

      initChatScreen();

      return () => {
        isMounted = false;
      };
    }, [fetchChannels, fetchHistory])
  );
  
  const isSuperAdmin = profile?.role === 'Super Admin';
  const isFounder = profile?.role === 'Founder';

  // Handle Android hardware back button to exit chat view back to chat list
  useEffect(() => {
    if (!activeChannelId) return;

    const onBackPress = () => {
      handleBackToList();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [activeChannelId]);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const directChannels = channels.filter(c => c.type === 'direct');

  const generalChannel = channels.find(
    c => c.name?.toLowerCase() === 'general' || c.type === 'public'
  );

  // Department channels:
  // For Founder: ALL department channels in the company
  // For Regular user: ONLY their own department channel
  const departmentChannels = channels.filter(c => {
    if (c.type !== 'department') return false;
    if (isFounder) return true;
    return profile?.department_id ? c.department_id === profile.department_id : false;
  });

  const userDeptChannel = departmentChannels[0] || null;
  const userDeptName = userDeptChannel?.name || profile?.department?.name;
  const departmentBtnTitle = userDeptName 
    ? (userDeptName.toLowerCase().endsWith('chat') ? userDeptName : `${userDeptName} Chat`)
    : 'Department Chat';

  const isGeneralActive = activeChannelId
    ? activeChannelId === generalChannel?.id
    : (!activeChannelId && (channels.length === 0 || activeChannel?.id === generalChannel?.id));

  const isDeptActive = Boolean(
    activeChannelId && departmentChannels.some(d => d.id === activeChannelId)
  );

  const handleSelectGeneral = async () => {
    Keyboard.dismiss();
    channelScrollRef.current?.scrollTo({ x: 0, animated: true });

    if (generalChannel) {
      setActiveChannelId(generalChannel.id);
      fetchHistory(generalChannel.id);
      return;
    }
    const chList = await fetchChannels();
    const gen = chList?.find((c: any) => c.name?.toLowerCase() === 'general' || c.type === 'public');
    if (gen) {
      setActiveChannelId(gen.id);
      fetchHistory(gen.id);
    } else if (chList && chList.length > 0) {
      const fallback = chList.find(c => c.type !== 'direct') || chList[0];
      setActiveChannelId(fallback.id);
      fetchHistory(fallback.id);
    }
  };

  const handleSelectDepartment = async (targetDeptChannel?: any) => {
    const target = targetDeptChannel || departmentChannels[0];
    if (target) {
      setActiveChannelId(target.id);
      fetchHistory(target.id);
      return;
    }

    const chList = await fetchChannels();
    const updatedDepts = chList?.filter((c: any) => {
      if (c.type !== 'department') return false;
      if (isFounder) return true;
      return profile?.department_id ? c.department_id === profile.department_id : false;
    }) || [];

    const foundTarget = targetDeptChannel 
      ? updatedDepts.find((c: any) => c.id === targetDeptChannel.id)
      : updatedDepts[0];

    if (foundTarget) {
      setActiveChannelId(foundTarget.id);
      fetchHistory(foundTarget.id);
    } else {
      Alert.alert(
        "Department Chat",
        profile?.department_id 
          ? "Department chat is currently being initialized. Please try again in a moment." 
          : "You are not currently assigned to a department."
      );
    }
  };

  const handleBackToList = () => {
    Keyboard.dismiss();
    setActiveChannelId(null);
  };


  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = asset.fileName || `image_${Date.now()}.jpg`;
      setAttachment({
        uri: asset.uri,
        name: fileName,
        type: asset.mimeType || 'image/jpeg',
        isImage: true
      });
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/zip',
          'application/x-zip-compressed',
          '*/*'
        ],
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const ext = (asset.name?.split('.').pop() || '').toLowerCase();
        let detectedMime = asset.mimeType;
        if (!detectedMime || detectedMime === '*/*' || detectedMime === 'application/octet-stream') {
          if (ext === 'pdf') detectedMime = 'application/pdf';
          else if (ext === 'docx') detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          else if (ext === 'doc') detectedMime = 'application/msword';
          else if (ext === 'xlsx') detectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else if (ext === 'xls') detectedMime = 'application/vnd.ms-excel';
          else if (ext === 'csv') detectedMime = 'text/csv';
          else if (ext === 'pptx') detectedMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          else if (ext === 'ppt') detectedMime = 'application/vnd.ms-powerpoint';
          else if (ext === 'zip') detectedMime = 'application/zip';
          else detectedMime = 'application/octet-stream';
        }

        setAttachment({
          uri: asset.uri,
          name: asset.name,
          type: detectedMime,
          isImage: false
        });
      }
    } catch (err: any) {
      console.warn('[Chat] Document picker error:', err);
    }
  };

  const handlePickAttachment = () => {
    Alert.alert(
      "Send Attachment",
      "Choose the type of file you want to send",
      [
        { text: "Image (Gallery)", onPress: pickImage },
        { text: "Document (Files)", onPress: pickDocument },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleSend = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = inputText.trim();
    if (!text && !attachment) return;

    let targetChannelId = activeChannelId;
    if (!targetChannelId && channels.length > 0) {
      targetChannelId = channels[0].id;
      setActiveChannelId(targetChannelId);
    }

    if (!targetChannelId) {
      Alert.alert(
        "No Conversation Selected",
        "Please select a chat above or tap New Chat to start messaging.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "New Chat", onPress: () => setIsNewChatModalVisible(true) },
        ]
      );
      return;
    }

    setIsSending(true);

    let attachmentUrl = null;
    let attachmentName = null;

    if (attachment) {
      try {
        const uId = profile?.id || session?.user?.id || 'unknown';
        const result = await processAndUploadAttachment(
          attachment.uri,
          attachment.name,
          attachment.type || 'application/octet-stream',
          'chat-attachments',
          uId
        );

        attachmentUrl = result.url;
        attachmentName = result.name;
      } catch (err: any) {
        const errMsg = String(err?.message || '').toLowerCase();
        const isNetworkErr = errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('abort') || errMsg.includes('failed');
        Alert.alert(
          "Attachment Upload Failed",
          isNetworkErr
            ? "Could not reach the server to upload the document. Please verify your connection to the backend."
            : (err?.message || "Failed to upload document.")
        );
        setIsSending(false);
        return; // Stop send if attachment fails
      }
    }

    // Clear input optimistically
    setInputText('');
    setAttachment(null);

    try {
      await sendMessage(text, targetChannelId, attachmentUrl, attachmentName);
    } catch (err: any) {
      Alert.alert("Send Failed", err?.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectDirectUser = async (targetUserId: string) => {
    try {
      const channelId = await startDirectChat(targetUserId);
      if (channelId) {
        setActiveChannelId(channelId);
        await fetchHistory(channelId);
      }
    } catch (err: any) {
      Alert.alert('Chat', err?.message || 'Could not open conversation. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      {!isChatView ? (
        <View style={styles.waHomeContainer}>
          <ZeroTaskHeader
            includeSafeArea={true}
            title="Chats"
            subtitle="Conversations & Team Messaging"
            showNotifications={true}
            showAvatar={true}
            onSearchPress={() => setIsNewChatModalVisible(true)}
          />
          
          {/* Search Bar */}
          <View style={styles.waSearchContainer}>
             <TouchableOpacity style={styles.waSearchBar} onPress={() => setIsNewChatModalVisible(true)} activeOpacity={0.9}>
                <Ionicons name="search" size={20} color={Colors.textMuted} style={{ marginLeft: 12, marginRight: 8 }} />
                <Text style={styles.waSearchText}>Search or start a new chat</Text>
             </TouchableOpacity>
          </View>

          {/* Filters Row */}
          <View style={styles.waFiltersContainer}>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.waFiltersScroll}>
               <TouchableOpacity 
                 style={[styles.waFilterPill, activeFilter === 'all' && styles.waFilterPillActive]}
                 onPress={() => setActiveFilter('all')}
               >
                  <Text style={activeFilter === 'all' ? styles.waFilterTextActive : styles.waFilterText}>All</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.waFilterPill, activeFilter === 'unread' && styles.waFilterPillActive]}
                 onPress={() => setActiveFilter('unread')}
               >
                  <Text style={activeFilter === 'unread' ? styles.waFilterTextActive : styles.waFilterText}>Unread</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.waFilterPill, activeFilter === 'groups' && styles.waFilterPillActive]}
                 onPress={() => setActiveFilter('groups')}
               >
                  <Text style={activeFilter === 'groups' ? styles.waFilterTextActive : styles.waFilterText}>Groups</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.waFilterPill, activeFilter === 'favourites' && styles.waFilterPillActive]}
                 onPress={() => setActiveFilter('favourites')}
               >
                  <Text style={activeFilter === 'favourites' ? styles.waFilterTextActive : styles.waFilterText}>Favourites</Text>
               </TouchableOpacity>
             </ScrollView>
          </View>

          {/* Chat List */}
          <ScrollView contentContainerStyle={styles.waChatListScroll}>
             {/* General Chat (Pinned by default) */}
             {!isSuperAdmin && generalChannel && (activeFilter === 'all' || activeFilter === 'groups' || activeFilter === 'favourites') && (
               <TouchableOpacity style={styles.waChatCard} onPress={handleSelectGeneral} activeOpacity={0.7}>
                  <View style={[styles.waAvatar, { backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name="globe-outline" size={24} color={Colors.primary} />
                  </View>
                  <View style={styles.waChatInfo}>
                     <View style={styles.waTitleRow}>
                        <Text style={styles.waTitleText}>General Chat</Text>
                        <Ionicons name="pin" size={14} color={Colors.textMuted} />
                     </View>
                     <Text style={styles.waSubtitleText} numberOfLines={1}>Company General Chat</Text>
                  </View>
               </TouchableOpacity>
             )}

             {/* Department Chats (Pinned) */}
             {!isSuperAdmin && (activeFilter === 'all' || activeFilter === 'groups' || activeFilter === 'favourites') && (isFounder ? departmentChannels : (userDeptChannel ? [userDeptChannel] : [])).map((deptChan) => (
                <TouchableOpacity key={deptChan.id} style={styles.waChatCard} onPress={() => handleSelectDepartment(deptChan)} activeOpacity={0.7}>
                  <View style={[styles.waAvatar, { backgroundColor: '#F5F3FF' }]}>
                    <Ionicons name="briefcase" size={22} color="#7C3AED" />
                  </View>
                  <View style={styles.waChatInfo}>
                    <View style={styles.waTitleRow}>
                      <Text style={styles.waTitleText}>{deptChan.name.toLowerCase().endsWith('chat') ? deptChan.name : `${deptChan.name} Chat`}</Text>
                      <Ionicons name="pin" size={14} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.waSubtitleText} numberOfLines={1}>Department Chat</Text>
                  </View>
                </TouchableOpacity>
             ))}

             {/* Direct Chats */}
             {(activeFilter === 'all' || activeFilter === 'unread') && directChannels.map((c) => {
                const displayName = c.other_user?.full_name || c.other_user?.name || c.name || 'Private Chat';
                const initial = displayName.charAt(0).toUpperCase();
                const role = c.other_user?.role || 'Team Member';
                const comp = isSuperAdmin && c.other_user?.company?.name ? ` (${c.other_user.company.name})` : '';
                return (
                  <TouchableOpacity key={c.id} style={styles.waChatCard} onPress={() => { setActiveChannelId(c.id); fetchHistory(c.id); }} activeOpacity={0.7}>
                    <View style={[styles.waAvatar, { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' }]}>
                      <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.primary }}>{initial}</Text>
                    </View>
                    <View style={styles.waChatInfo}>
                      <View style={styles.waTitleRow}>
                        <Text style={styles.waTitleText} numberOfLines={1}>{displayName}{comp}</Text>
                      </View>
                      <Text style={styles.waSubtitleText} numberOfLines={1}>{role}</Text>
                    </View>
                  </TouchableOpacity>
                );
             })}
          </ScrollView>

          {/* New Chat FAB */}
          <TouchableOpacity style={styles.waFab} onPress={() => { isModalOpenRef.current = true; setIsNewChatModalVisible(true); }}>
             <Ionicons name="chatbox-ellipses" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      ) : (
        // Active Chat View
        <View style={styles.activeChatContainer}>
          <ZeroTaskHeader
            includeSafeArea={true}
            showBack
            onBackPress={handleBackToList}
            showDrawer={false}
            title={
              activeChannel?.type === 'direct'
                ? (activeChannel?.other_user?.full_name || activeChannel?.other_user?.name || activeChannel?.name || 'Private Chat')
                : (activeChannel?.name?.toLowerCase() === 'general' ? 'General Chat' : `${activeChannel?.name || ''} Chat`)
            }
            subtitle={
              activeChannel?.type === 'direct'
                ? (activeChannel?.other_user?.role ? `${activeChannel.other_user.role}` : 'Direct Message')
                : activeChannel?.type === 'department'
                ? 'Department Chat'
                : 'Company General Chat'
            }
            showNotifications={false}
            showAvatar={false}
            rightElement={
              <View style={[
                styles.activeChatAvatarWrap,
                activeChannel?.type === 'direct' 
                  ? styles.activeChatDirectAvatar 
                  : activeChannel?.type === 'department'
                  ? styles.activeChatDeptAvatar
                  : styles.activeChatPublicAvatar
              ]}>
                <Ionicons 
                  name={activeChannel?.type === 'direct' ? 'person' : activeChannel?.type === 'department' ? 'briefcase' : 'globe-outline'} 
                  size={16} 
                  color={activeChannel?.type === 'direct' ? Colors.primary : activeChannel?.type === 'department' ? '#7C3AED' : Colors.primary} 
                />
              </View>
            }
          />

          <View style={[{ flex: 1, paddingBottom: dynamicPaddingBottom }, isTablet && { maxWidth: 860, width: '100%', alignSelf: 'center' }]}>
            <View style={styles.feedContainer}>
              <FlatList
                data={messages}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                keyExtractor={(item) => item.id}
                inverted={messages.length > 0}
                renderItem={({ item }) => <ChatMessage message={item} />}
                contentContainerStyle={[styles.listContent, messages.length === 0 && styles.listContentEmpty]}
                ListEmptyComponent={
                  loadingHistory ? (
                    <View style={styles.centerLoadingContainer}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.loadingText}>Loading messages...</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyContainer}>
                      <View style={styles.emptyIconWrap}>
                        <Ionicons name="chatbubbles-outline" size={32} color={Colors.primary} />
                      </View>
                      <Text style={styles.emptyTitle}>No messages yet</Text>
                      <Text style={styles.emptySubtitle}>Start the conversation by typing a message or sharing a document below.</Text>
                    </View>
                  )
                }
              />
            </View>

            <View style={styles.inputWrapper}>
              {attachment && (
                <View style={styles.attachmentPreviewContainer}>
                  <View style={styles.attachmentPreview}>
                    <Ionicons name={attachment.isImage ? "image" : "document"} size={20} color={Colors.textPrimary} />
                    <Text style={styles.attachmentPreviewText} numberOfLines={1} ellipsizeMode="middle">{attachment.name}</Text>
                    <TouchableOpacity onPress={() => setAttachment(null)} style={styles.attachmentPreviewClose}>
                      <Ionicons name="close" size={14} color={Colors.textInverse} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <View style={[styles.inputRow, isSmallDevice && { paddingHorizontal: 10 }]}>
                <TouchableOpacity onPress={handlePickAttachment} disabled={isSending} style={styles.attachBtn}>
                  <Ionicons name="add" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.textInput}
                  placeholder="Message..."
                  placeholderTextColor={Colors.textMuted}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  textAlignVertical="center"
                  editable={!isSending}
                />
                <TouchableOpacity 
                  onPress={handleSend}
                  disabled={isSending || (!inputText.trim() && !attachment)}
                  style={[styles.sendBtn, (inputText.trim() || attachment) && !isSending ? styles.sendBtnActive : styles.sendBtnInactive]}
                >
                  {isSending ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <Ionicons name="send" size={14} color={(inputText.trim() || attachment) ? Colors.textInverse : Colors.textMuted} style={{ marginLeft: 2 }} />}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      <NewDirectChatModal
        visible={isNewChatModalVisible}
        onClose={() => {
          setIsNewChatModalVisible(false);
          setTimeout(() => { isModalOpenRef.current = false; }, 500);
        }}
        onSelectUser={handleSelectDirectUser}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  waHomeContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  waHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFF',
  },
  waHeaderTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 24,
    color: Colors.textPrimary,
  },
  waHeaderIcons: {
    flexDirection: 'row',
  },
  waSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
  },
  waSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9', // Light gray background
    borderRadius: Layout.radius.full,
    paddingHorizontal: 12,
    height: 44,
  },
  waSearchText: {
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
  },
  waFiltersContainer: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingBottom: 10,
  },
  waFiltersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  waFilterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Layout.radius.full,
    backgroundColor: '#F1F5F9',
  },
  waFilterPillActive: {
    backgroundColor: '#EFF6FF',
  },
  waFilterText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  waFilterTextActive: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  waChatListScroll: {
    paddingBottom: 100,
  },
  waChatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
  },
  waAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  waChatInfo: {
    flex: 1,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingBottom: 14,
  },
  waTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  waTitleText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
  },
  waTimeText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  waSubtitleText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  waFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  activeChatContainer: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  activeChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  activeChatAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeChatDirectAvatar: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activeChatPublicAvatar: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  activeChatDeptAvatar: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  activeChatTextCol: {
    flex: 1,
  },
  activeChatTitleText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  activeChatSubtitleText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  feedContainer: {
    flex: 1,
  },
  listContent: {
    padding: Layout.spacing.lg,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLoadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
  },
  emptyContainer: {
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 17,
    color: Colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  inputWrapper: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingBottom: 12,
  },
  attachmentPreviewContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    maxWidth: '80%',
  },
  attachmentPreviewText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  attachmentPreviewClose: {
    marginLeft: 12,
    backgroundColor: Colors.textMuted,
    borderRadius: 12,
    padding: 2,
  },
  inputRow: {
    padding: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  attachBtn: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  sendBtn: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: Colors.primary,
  },
  sendBtnInactive: {
    backgroundColor: 'transparent',
  },
});
