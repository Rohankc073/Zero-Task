import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function ChatScreen() {
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
        const fileExt = attachment.name.split('.').pop();
        const filePath = `${session?.user?.id}/${Date.now()}.${fileExt}`;
        
        // Read the file as base64 and decode to ArrayBuffer
        const base64 = await FileSystem.readAsStringAsync(attachment.uri, { encoding: FileSystem.EncodingType.Base64 });
        const arrayBuffer = decode(base64);
        
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, arrayBuffer, {
            contentType: attachment.type || 'application/octet-stream',
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        attachmentUrl = publicUrl;
        attachmentName = attachment.name;
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
    <SafeAreaView className="flex-1 bg-[#f7f6f2]">
      <Stack.Screen 
        options={{
          headerShown: true,
          title: activeChannel ? `#${activeChannel.name}` : 'Chat Hub',
          headerStyle: { backgroundColor: '#0f141a' },
          headerTintColor: '#e1c37a',
          headerTitleStyle: { fontWeight: 'bold' }
        }} 
      />

      {/* Message Feed */}
      <View className="flex-1 bg-[#f7f6f2]">
        {loadingHistory && messages.length === 0 ? (
          <View className="flex-1 p-4">
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
            contentContainerStyle={{ padding: 16 }}
            style={{ transform: [{ scaleY: -1 }] }}
            ListEmptyComponent={() => (
              <View style={{ padding: 20, justifyContent: 'center', alignItems: 'center', transform: [{ scaleY: -1 }] }}>
                <Text className="text-gray-400 font-medium">No messages yet. Start the conversation!</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* Composer Input */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View className="bg-white border-t border-[#0f141a]/10 pb-4">
          
          {/* Attachment Preview */}
          {attachment && (
            <View className="px-4 pt-3 flex-row items-center">
              <View className="flex-row items-center bg-[#f7f6f2] px-3 py-2 rounded-xl border border-[#0f141a]/10 max-w-[80%]">
                <Ionicons name={attachment.isImage ? "image" : "document"} size={20} color="#e1c37a" />
                <Text className="ml-2 text-sm text-[#0f141a] font-medium" numberOfLines={1} ellipsizeMode="middle">
                  {attachment.name}
                </Text>
                <TouchableOpacity onPress={() => setAttachment(null)} className="ml-3 bg-gray-200 rounded-full p-1">
                  <Ionicons name="close" size={14} color="#0f141a" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View className="p-4 flex-row items-end">
            <TouchableOpacity 
              onPress={handlePickAttachment}
              disabled={isSending}
              className="h-11 w-11 items-center justify-center mr-2 mb-0.5"
            >
              <Ionicons name="add-circle" size={28} color="#e1c37a" />
            </TouchableOpacity>

            <TextInput
              className="flex-1 bg-[#f7f6f2] min-h-[44px] max-h-[120px] rounded-2xl px-4 py-3 mr-3 text-[#0f141a] border border-[#0f141a]/5"
              placeholder="Type a message..."
              placeholderTextColor="#9ca3af"
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="center"
              editable={!isSending}
            />
            
            <TouchableOpacity 
              onPress={handleSend}
              disabled={isSending || (!inputText.trim() && !attachment)}
              className={`h-11 w-11 rounded-full items-center justify-center mb-0.5 ${
                (inputText.trim() || attachment) && !isSending ? 'bg-[#e1c37a]' : 'bg-gray-200'
              }`}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#0f141a" />
              ) : (
                <Ionicons name="send" size={18} color={(inputText.trim() || attachment) ? '#0f141a' : '#9ca3af'} style={{ marginLeft: 3 }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
