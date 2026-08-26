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
    <View className="mb-4 w-full flex-row px-4">
      {/* Avatar */}
      <View className="w-10 h-10 rounded bg-[#FBF8F2] items-center justify-center mr-3 border border-[#E6DED1]">
        <Text className="text-[#222222] font-bold text-lg">
          {isMine ? 'Y' : (message.user?.full_name?.charAt(0) || message.user?.name?.charAt(0) || message.user?.email?.charAt(0) || 'U').toUpperCase()}
        </Text>
      </View>
      
      {/* Content */}
      <View className="flex-1">
        {/* Name and Time */}
        <View className="flex-row items-baseline mb-1">
          <Text className="font-bold text-[#222222] text-[15px] mr-2">
            {isMine ? 'You' : (
              (message.user?.full_name || message.user?.name) 
                ? `${message.user?.full_name || message.user?.name} (${message.user?.role || 'Unknown'})`
                : (message.user?.email || 'User')
            )}
          </Text>
          <Text className="text-xs text-[#918B82]">
            {displayTime}
          </Text>
        </View>

        {/* Attachment */}
        {hasAttachment && (
          <View className={message.content ? 'mb-2 mt-1' : 'mt-1'}>
            {isImageAttachment ? (
              <>
                <TouchableOpacity onPress={() => setIsPreviewVisible(true)}>
                  <Image 
                    source={{ uri: message.attachment_url }} 
                    className="w-48 h-48 rounded border border-[#E6DED1] bg-[#FBF8F2]"
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
                className="flex-row items-center px-3 py-2 rounded border bg-[#FBF8F2] border-[#E6DED1] max-w-[250px]"
              >
                <Ionicons name="document" size={24} color="#222222" />
                <Text 
                  className="ml-2 font-medium flex-shrink-1 text-[#222222]" 
                  numberOfLines={1} 
                  ellipsizeMode="middle"
                >
                  {message.attachment_name || 'Attachment'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Text Content */}
        {!!message.content && (
          <Text className="text-[#222222] text-[15px] leading-6">
            {message.content}
          </Text>
        )}
      </View>
    </View>
  );
}
