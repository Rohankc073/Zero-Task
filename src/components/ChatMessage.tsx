import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, Modal, StyleSheet } from 'react-native';
import { ChatMessage as ChatMessageType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../theme/tokens';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const { profile } = useAuth();
  const { isSmallDevice, isTablet } = useResponsive();
  const isMine = profile?.id === message.user_id;
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const dateObj = new Date(message.created_at);
  const formattedTime = isNaN(dateObj.getTime())
    ? ''
    : dateObj.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

  const formattedDate = isNaN(dateObj.getTime())
    ? ''
    : dateObj.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

  const displayTime = formattedTime ? `${formattedDate} • ${formattedTime}` : '';

  // Helper to determine if attachment is an image
  const isImage = (url?: string, name?: string) => {
    if (!url) return false;
    const lowerName = (name || url).toLowerCase();
    return lowerName.match(/\.(jpeg|jpg|gif|png|webp)$/) != null;
  };

  const handleOpenAttachment = () => {
    if (message.attachment_url) {
      Linking.openURL(message.attachment_url).catch((err) => {
        console.warn('Could not open attachment URL:', err);
      });
    }
  };

  const hasAttachment = !!message.attachment_url;
  const isImageAttachment = isImage(message.attachment_url, message.attachment_name);

  const initial = isMine
    ? (profile?.full_name?.charAt(0) || profile?.name?.charAt(0) || profile?.email?.charAt(0) || 'Y').toUpperCase()
    : (message.user?.full_name?.charAt(0) || message.user?.name?.charAt(0) || message.user?.email?.charAt(0) || 'U').toUpperCase();

  const authorName = isMine
    ? 'You'
    : (message.user?.full_name || message.user?.name)
    ? `${message.user?.full_name || message.user?.name} (${message.user?.role || 'Member'})`
    : message.user?.email || 'User';

  return (
    <View style={styles.messageRow}>
      {/* Avatar */}
      <View style={[styles.avatarContainer, isMine && styles.avatarContainerMine]}>
        <Text style={[styles.avatarText, isMine && styles.avatarTextMine]}>
          {initial}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.contentCol}>
        {/* Name and Time */}
        <View style={styles.headerRow}>
          <Text style={styles.authorText}>
            {authorName}
          </Text>
          {!!displayTime && (
            <Text style={styles.timeText}>
              {displayTime}
            </Text>
          )}
        </View>

        {/* Attachment */}
        {hasAttachment && (
          <View style={styles.attachmentWrapper}>
            {isImageAttachment ? (
              <>
                <TouchableOpacity onPress={() => setIsPreviewVisible(true)} activeOpacity={0.9}>
                  <Image
                    source={{ uri: message.attachment_url }}
                    style={[
                      styles.imageAttachment,
                      isSmallDevice && { width: 170, height: 130 },
                      isTablet && { width: 260, height: 200 }
                    ]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <Modal
                  visible={isPreviewVisible}
                  transparent={true}
                  onRequestClose={() => setIsPreviewVisible(false)}
                  animationType="fade"
                >
                  <View style={styles.modalBackdrop}>
                    <TouchableOpacity
                      style={styles.modalCloseBtn}
                      onPress={() => setIsPreviewVisible(false)}
                    >
                      <Ionicons name="close" size={30} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Image
                      source={{ uri: message.attachment_url }}
                      style={styles.modalImage}
                      resizeMode="contain"
                    />
                  </View>
                </Modal>
              </>
            ) : (
              <TouchableOpacity
                onPress={handleOpenAttachment}
                style={[
                  styles.docAttachment,
                  isSmallDevice && { maxWidth: 200 },
                  isTablet && { maxWidth: 320 }
                ]}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
                <Text style={styles.docAttachmentText} numberOfLines={1} ellipsizeMode="middle">
                  {message.attachment_name || 'Attachment'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Text Content */}
        {!!message.content && (
          <View style={[
            styles.textBubble, 
            isMine && styles.textBubbleMine,
            isTablet && { maxWidth: '75%' }
          ]}>
            <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
              {message.content}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 8,
    width: '100%',
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarContainerMine: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 15,
    color: '#334155',
  },
  avatarTextMine: {
    color: Colors.primary,
  },
  contentCol: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 4,
    gap: 6,
  },
  authorText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  timeText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 11,
    color: Colors.textMuted,
  },
  textBubble: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 12,
    borderTopLeftRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    maxWidth: '92%',
  },
  textBubbleMine: {
    backgroundColor: '#F0F7FF',
    borderColor: '#D0E1FD',
  },
  messageText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  messageTextMine: {
    color: '#0F172A',
  },
  attachmentWrapper: {
    marginBottom: 6,
    marginTop: 2,
  },
  imageAttachment: {
    width: 200,
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSubtle,
  },
  docAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    maxWidth: 240,
    gap: 8,
  },
  docAttachmentText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 13,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  modalImage: {
    width: '94%',
    height: '80%',
  },
});
