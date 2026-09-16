import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert, ScrollView, Image, Keyboard, KeyboardEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { processAndUploadAttachment } from '../../../src/utils/attachmentPipeline';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { FlashList } from '@shopify/flash-list';
import { useChat } from '../../../src/hooks/useChat';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import ChatMessage from '../../../src/components/ChatMessage';
import { ChatMessageSkeleton } from '../../../src/components/Skeleton';
import { NewDirectChatModal } from '../../../src/components/chat/NewDirectChatModal';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
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
    : 0;

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

  // Refresh channels and active messages whenever tab gains focus
  useFocusEffect(
    useCallback(() => {
      fetchChannels();
      if (activeChannelId) {
        fetchHistory(activeChannelId);
      }
    }, [fetchChannels, fetchHistory, activeChannelId])
  );
  
  // Ensure a default channel is selected if activeChannelId is missing
  useEffect(() => {
    if (!activeChannelId && !loadingChannels && channels.length > 0) {
      const general = channels.find(c => c.name?.toLowerCase() === 'general' || c.type === 'public');
      setActiveChannelId(general ? general.id : channels[0].id);
    }
  }, [activeChannelId, loadingChannels, channels]);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const groupChannels = channels.filter(c => c.type !== 'direct');
  const directChannels = channels.filter(c => c.type === 'direct');

  const generalChannel = channels.find(
    c => c.name?.toLowerCase() === 'general' || c.type === 'public'
  );

  const departmentChannel = channels.find(
    c => c.type === 'department' && (profile?.department_id ? c.department_id === profile?.department_id : true)
  ) || channels.find(c => c.type === 'department');

  // Filter other group channels (exclude general and department from repeating in the list)
  const otherGroupChannels = groupChannels.filter(
    c => c.id !== generalChannel?.id && c.id !== departmentChannel?.id
  );

  const userDeptName = departmentChannel?.name || profile?.department?.name;
  const departmentBtnTitle = userDeptName ? `${userDeptName} Chat` : 'Department Chat';

  const isGeneralActive = activeChannelId
    ? activeChannelId === generalChannel?.id
    : (!activeChannelId && (channels.length === 0 || activeChannel?.id === generalChannel?.id));

  const isDeptActive = Boolean(
    activeChannelId && departmentChannel && activeChannelId === departmentChannel.id
  );

  const handleSelectGeneral = async () => {
    if (generalChannel) {
      setActiveChannelId(generalChannel.id);
      return;
    }
    const chList = await fetchChannels();
    const gen = chList?.find((c: any) => c.name?.toLowerCase() === 'general' || c.type === 'public');
    if (gen) {
      setActiveChannelId(gen.id);
    }
  };

  const handleSelectDepartment = async () => {
    if (departmentChannel) {
      setActiveChannelId(departmentChannel.id);
      return;
    }
    const chList = await fetchChannels();
    const dept = chList?.find((c: any) => c.type === 'department' && (profile?.department_id ? c.department_id === profile?.department_id : true))
      || chList?.find((c: any) => c.type === 'department');
    if (dept) {
      setActiveChannelId(dept.id);
    } else {
      Alert.alert(
        "Department Chat",
        profile?.department_id 
          ? "Connecting to your department chat..." 
          : "You are not currently assigned to a department."
      );
    }
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
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/zip', 'application/x-rar-compressed', 'text/csv', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setAttachment({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
        isImage: false
      });
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
        const result = await processAndUploadAttachment(
          attachment.uri,
          attachment.name,
          attachment.type || 'application/octet-stream',
          'chat-attachments',
          session?.user?.id || 'unknown'
        );

        attachmentUrl = result.url;
        attachmentName = result.name;
      } catch (err: any) {
        Alert.alert("Attachment Upload Failed", err.message);
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
    const channelId = await startDirectChat(targetUserId);
    if (channelId) {
      setActiveChannelId(channelId);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen 
        options={{
          headerShown: false
        }} 
      />

      {/* Header */}
      <ZeroTaskHeader />

      {/* Channel Pill Selector */}
      <View style={styles.channelContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelScroll}>
          {/* Start Private Chat Button */}
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => setIsNewChatModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.newChatBtnText}>New Chat</Text>
          </TouchableOpacity>

          {/* Dedicated General Chat Button (Founder + all departments) */}
          <TouchableOpacity
            style={[
              styles.channelPill,
              isGeneralActive && styles.channelPillActive,
              styles.presetChannelBtn,
              isGeneralActive && styles.presetChannelBtnActive
            ]}
            onPress={handleSelectGeneral}
            activeOpacity={0.8}
          >
            <Ionicons 
              name="globe-outline" 
              size={13} 
              color={isGeneralActive ? Colors.textInverse : Colors.primary} 
              style={{ marginRight: 5 }} 
            />
            <Text style={[styles.channelPillText, isGeneralActive && styles.channelPillTextActive]}>
              General Chat
            </Text>
          </TouchableOpacity>

          {/* Dedicated Department Chat Button (Scoped to department users) */}
          <TouchableOpacity
            style={[
              styles.channelPill,
              isDeptActive && styles.channelPillActive,
              styles.presetChannelBtn,
              isDeptActive && styles.presetChannelBtnActive
            ]}
            onPress={handleSelectDepartment}
            activeOpacity={0.8}
          >
            <Ionicons 
              name="briefcase-outline" 
              size={13} 
              color={isDeptActive ? Colors.textInverse : '#7C3AED'} 
              style={{ marginRight: 5 }} 
            />
            <Text style={[styles.channelPillText, isDeptActive && styles.channelPillTextActive]}>
              {departmentBtnTitle}
            </Text>
          </TouchableOpacity>

          {/* Other Group Channels (if any custom channels exist) */}
          {otherGroupChannels.map((c) => {
            const isSelected = activeChannelId === c.id;
            const companySuffix = profile?.role === 'Super Admin' && c.company?.name ? ` (${c.company.name})` : '';
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.channelPill, isSelected && styles.channelPillActive]}
                onPress={() => setActiveChannelId(c.id)}
              >
                <Text style={[styles.channelPillText, isSelected && styles.channelPillTextActive]}>
                  #{c.name}{companySuffix}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Divider if direct chats exist */}
          {directChannels.length > 0 && <View style={styles.channelDivider} />}

          {/* 1-to-1 Direct Private Chats */}
          {directChannels.map((c) => {
            const isSelected = activeChannelId === c.id;
            const displayName = c.other_user?.full_name || c.other_user?.name || c.name || 'Private Chat';
            const companySuffix = profile?.role === 'Super Admin' && c.other_user?.company?.name ? ` (${c.other_user.company.name})` : '';
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.directPill, isSelected && styles.directPillActive]}
                onPress={() => setActiveChannelId(c.id)}
              >
                <Ionicons 
                  name="person" 
                  size={12} 
                  color={isSelected ? Colors.textInverse : Colors.primary} 
                  style={{ marginRight: 5 }} 
                />
                <Text 
                  style={[styles.directPillText, isSelected && styles.directPillTextActive]}
                  numberOfLines={1}
                >
                  {displayName}{companySuffix}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Active Conversation Indicator Bar */}
      {activeChannel ? (
        <View style={styles.activeChatBar}>
          <View style={styles.activeChatLeft}>
            <View style={[
              styles.activeChatAvatarWrap,
              activeChannel.type === 'direct' 
                ? styles.activeChatDirectAvatar 
                : activeChannel.type === 'department'
                ? styles.activeChatDeptAvatar
                : styles.activeChatPublicAvatar
            ]}>
              <Ionicons 
                name={activeChannel.type === 'direct' ? 'person' : activeChannel.type === 'department' ? 'briefcase' : 'globe-outline'} 
                size={16} 
                color={activeChannel.type === 'direct' ? Colors.primary : activeChannel.type === 'department' ? '#7C3AED' : Colors.primary} 
              />
            </View>
            <View style={styles.activeChatTextCol}>
              <View style={styles.activeChatTitleRow}>
                <Text style={styles.activeChatTitleText} numberOfLines={1}>
                  {activeChannel.type === 'direct'
                    ? (activeChannel.other_user?.full_name || activeChannel.other_user?.name || activeChannel.name || 'Private Chat')
                    : (activeChannel.name?.toLowerCase() === 'general' ? 'General Chat' : `${activeChannel.name} Chat`)}
                </Text>
                <View style={[
                  styles.chatTypeTag,
                  activeChannel.type === 'direct' 
                    ? styles.chatTypeTagDirect 
                    : activeChannel.type === 'department'
                    ? styles.chatTypeTagDept
                    : styles.chatTypeTagPublic
                ]}>
                  <Text style={[
                    styles.chatTypeTagText,
                    activeChannel.type === 'direct' 
                      ? styles.chatTypeTagTextDirect 
                      : activeChannel.type === 'department'
                      ? styles.chatTypeTagTextDept
                      : styles.chatTypeTagTextPublic
                  ]}>
                    {activeChannel.type === 'direct' ? 'PERSONAL CHAT' : activeChannel.type === 'department' ? 'DEPARTMENT CHAT' : 'GENERAL CHAT'}
                  </Text>
                </View>
              </View>
              <Text style={styles.activeChatSubtitleText} numberOfLines={1}>
                {activeChannel.type === 'direct'
                  ? (activeChannel.other_user?.role ? `${activeChannel.other_user.role}${activeChannel.other_user.company?.name ? ` · ${activeChannel.other_user.company.name}` : ''}` : 'Direct 1-on-1 Message')
                  : activeChannel.type === 'department'
                  ? `Department: ${activeChannel.name} · Visible to department members`
                  : 'Company General Chat · Includes Founder & all departments (Managers, Department Heads, Employees)'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.activeChatBar}>
          <Text style={styles.activeChatSubtitleText}>Select a conversation above to start chatting</Text>
        </View>
      )}

      {/* Direct User Picker Modal */}
      <NewDirectChatModal
        visible={isNewChatModalVisible}
        onClose={() => setIsNewChatModalVisible(false)}
        onSelectUser={handleSelectDirectUser}
      />

      <View style={{ flex: 1, paddingBottom: dynamicPaddingBottom }}>
        {/* Message Feed */}
        <View style={styles.feedContainer}>
          {loadingHistory && messages.length === 0 ? (
            <View style={styles.skeletonContainer}>
              <ChatMessageSkeleton />
              <ChatMessageSkeleton isMine />
              <ChatMessageSkeleton />
              <ChatMessageSkeleton isMine />
            </View>
          ) : (
            <FlashList
              data={messages}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              keyExtractor={(item) => item.id}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              renderItem={({ item }) => (
                <View style={{ transform: [{ scaleY: -1 }] }}>
                  <ChatMessage message={item} />
                </View>
              )}
              contentContainerStyle={styles.listContent}
              style={styles.invertedList}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <Ionicons 
                    name={activeChannel?.type === 'direct' ? 'chatbubble-ellipses-outline' : 'chatbubbles-outline'} 
                    size={40} 
                    color={Colors.borderStrong} 
                    style={{ marginBottom: 12 }}
                  />
                  <Text style={styles.emptyText}>
                    {activeChannel?.type === 'direct'
                      ? `Beginning of direct message with ${activeChannel.other_user?.full_name || activeChannel.name || 'this user'}.`
                      : activeChannel?.type === 'department'
                      ? `No messages in ${activeChannel?.name} Department chat yet. Send a message to start!`
                      : `No messages in General chat yet. Send a message to start!`}
                  </Text>
                </View>
              )}
            />
          )}
        </View>

        {/* Composer Input */}
        <View style={styles.inputWrapper}>
          
          {/* Attachment Preview */}
          {attachment && (
            <View style={styles.attachmentPreviewContainer}>
              <View style={styles.attachmentPreview}>
                <Ionicons name={attachment.isImage ? "image" : "document"} size={20} color={Colors.textPrimary} />
                <Text style={styles.attachmentPreviewText} numberOfLines={1} ellipsizeMode="middle">
                  {attachment.name}
                </Text>
                <TouchableOpacity onPress={() => setAttachment(null)} style={styles.attachmentPreviewClose}>
                  <Ionicons name="close" size={14} color={Colors.textInverse} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity 
              onPress={handlePickAttachment}
              disabled={isSending}
              style={styles.attachBtn}
            >
              <Ionicons name="add" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder={
                activeChannel
                  ? activeChannel.type === 'direct'
                    ? `Message ${activeChannel.other_user?.full_name || activeChannel.name || 'user'} (Personal)...`
                    : `Message #${activeChannel.name}${activeChannel.company?.name && profile?.role === 'Super Admin' ? ` (${activeChannel.company.name})` : ''}...`
                  : "Message..."
              }
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
              style={[
                styles.sendBtn,
                (inputText.trim() || attachment) && !isSending ? styles.sendBtnActive : styles.sendBtnInactive
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <Ionicons 
                  name="send" 
                  size={14} 
                  color={(inputText.trim() || attachment) ? Colors.textInverse : Colors.textMuted} 
                  style={{ marginLeft: 2 }} 
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  channelContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  channelScroll: {
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 12,
    gap: Layout.spacing.sm,
  },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  channelPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  presetChannelBtn: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  presetChannelBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  channelPillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  channelPillTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  newChatBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  channelDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.borderSubtle,
    alignSelf: 'center',
    marginHorizontal: 4,
  },
  directPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  directPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  directPillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    maxWidth: 140,
  },
  directPillTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
  },
  feedContainer: {
    flex: 1,
  },
  skeletonContainer: {
    flex: 1,
    padding: Layout.spacing.lg,
  },
  listContent: {
    padding: Layout.spacing.lg,
  },
  invertedList: {
    transform: [{ scaleY: -1 }],
  },
  emptyContainer: {
    padding: Layout.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ scaleY: -1 }],
  },
  emptyText: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
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
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    fontSize: 15,
  },
  sendBtn: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: Colors.primary,
  },
  sendBtnInactive: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  activeChatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  activeChatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activeChatAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
  activeChatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeChatTitleText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  activeChatSubtitleText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  chatTypeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chatTypeTagDirect: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  chatTypeTagDept: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  chatTypeTagPublic: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chatTypeTagText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.5,
  },
  chatTypeTagTextDirect: {
    color: '#1D4ED8',
  },
  chatTypeTagTextDept: {
    color: '#7C3AED',
  },
  chatTypeTagTextPublic: {
    color: '#475569',
  },
});
