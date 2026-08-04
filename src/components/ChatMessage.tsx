import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, Modal } from 'react-native';
import { ChatMessage as ChatMessageType } from '../types';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const { profile } = useAuth();
  const isMine = profile?.id === message.user_id;
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const dateObj = new Date(message.created_at);
  const formattedTime = dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const formattedDate = dateObj.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const displayTime = `${formattedDate} • ${formattedTime}`;

  // Helper to determine if attachment is an image
  const isImage = (url?: string, name?: string) => {
    if (!url) return false;
    const lowerName = (name || url).toLowerCase();
    return lowerName.match(/\.(jpeg|jpg|gif|png|webp)$/) != null;
  };

  const handleOpenAttachment = () => {
    if (message.attachment_url) {
      Linking.openURL(message.attachment_url);
    }
  };

  const hasAttachment = !!message.attachment_url;
  const isImageAttachment = isImage(message.attachment_url, message.attachment_name);

  return (
    <View className={`mb-4 w-full flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
      <View className={`max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Sender Info & Timestamp */}
        <View className="flex-row items-center mb-1 mx-1 space-x-2">
          <Text className="text-[10px] font-bold text-gray-500 uppercase">
            {isMine ? 'You' : message.user?.full_name || 'User'}
          </Text>
          <Text className="text-[10px] text-gray-400">
            {displayTime}
          </Text>
        </View>

        {/* Message Bubble */}
        <View
          className={`px-4 py-3 rounded-2xl ${
            isMine
              ? 'bg-[#0f141a] rounded-tr-sm'
              : 'bg-[#f7f6f2] border border-[#0f141a]/10 rounded-tl-sm'
          }`}
        >
          {hasAttachment && (
            <View className={message.content ? 'mb-2' : ''}>
              {isImageAttachment ? (
                <>
                  <TouchableOpacity onPress={() => setIsPreviewVisible(true)}>
                    <Image 
                      source={{ uri: message.attachment_url }} 
                      className="w-48 h-48 rounded-xl bg-gray-200"
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  <Modal visible={isPreviewVisible} transparent={true} onRequestClose={() => setIsPreviewVisible(false)} animationType="fade">
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
                      <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }} onPress={() => setIsPreviewVisible(false)}>
                        <Ionicons name="close" size={32} color="#fff" />
                      </TouchableOpacity>
                      <Image source={{ uri: message.attachment_url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
                    </View>
                  </Modal>
                </>
              ) : (
                <TouchableOpacity 
                  onPress={handleOpenAttachment}
                  className={`flex-row items-center px-3 py-2 rounded-xl border ${
                    isMine ? 'bg-[#1f2937] border-gray-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <Ionicons name="document" size={24} color={isMine ? '#e1c37a' : '#0f141a'} />
                  <Text 
                    className={`ml-2 font-medium flex-shrink-1 ${isMine ? 'text-white' : 'text-[#0f141a]'}`} 
                    numberOfLines={1} 
                    ellipsizeMode="middle"
                    style={{ maxWidth: 160 }}
                  >
                    {message.attachment_name || 'Attachment'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!!message.content && (
            <Text className={`text-base ${isMine ? 'text-[#f7f6f2]' : 'text-[#0f141a]'}`}>
              {message.content}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
