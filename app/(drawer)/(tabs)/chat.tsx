import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert, ScrollView, Image, Keyboard, KeyboardEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { processAndUploadAttachment } from '../../../src/utils/attachmentPipeline';
import { Stack } from 'expo-router';
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
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { 
    channels, 
    activeChannelId, 
    setActiveChannelId, 
    messages, 
    loadingChannels, 
    loadingHistory,
    fetchChannels
  } = useChat();
  
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<{ uri: string, name: string, type: string, isImage: boolean } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Manual Keyboard Handling (iOS only)
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

  // Fetch channels when component mounts
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);
  
  // Ensure a default channel is selected if activeChannelId is missing
  useEffect(() => {
    if (!activeChannelId && !loadingChannels && channels.length > 0) {
      const general = channels.find(c => c.name.toLowerCase() === 'general');
      setActiveChannelId(general ? general.id : channels[0].id);
    }
  }, [activeChannelId, loadingChannels, channels]);

  const activeChannel = channels.find(c => c.id === activeChannelId);

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

    if (!activeChannelId) {
      console.error("NO CHANNEL SELECTED");
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

    const { error } = await supabase.from('chat_messages').insert({
      content: text || null, // Null if empty and only sending attachment
      channel_id: activeChannelId,
      user_id: session?.user?.id,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName
    }).select();

    if (error) {
      Alert.alert("Send Failed", error.message);
    }
    
    setIsSending(false);
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
          {channels.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.channelPill, activeChannelId === c.id && styles.channelPillActive]}
              onPress={() => setActiveChannelId(c.id)}
            >
              <Text style={[styles.channelPillText, activeChannelId === c.id && styles.channelPillTextActive]}>
                #{c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1, paddingBottom: Platform.OS === 'ios' ? (keyboardHeight > 0 ? keyboardHeight - insets.bottom : 0) : 0 }}>
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
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ transform: [{ scaleY: -1 }] }}>
                  <ChatMessage message={item} />
                </View>
              )}
              contentContainerStyle={styles.listContent}
              style={styles.invertedList}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
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
  channelPillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  channelPillTextActive: {
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
});
