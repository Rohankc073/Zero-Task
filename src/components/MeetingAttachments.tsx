import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Linking, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { MeetingFile } from '../types';
import { Ionicons } from '@expo/vector-icons';

interface MeetingAttachmentsProps {
  meetingId: string;
}

export function MeetingAttachments({ meetingId }: MeetingAttachmentsProps) {
  const [attachments, setAttachments] = useState<MeetingFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttachments = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('meeting_files')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAttachments(data as MeetingFile[]);
      } catch (error) {
        console.error('Error fetching meeting attachments:', error);
      } finally {
        setLoading(false);
      }
    };

    if (meetingId) {
      fetchAttachments();
    }
  }, [meetingId]);

  const handlePress = (attachment: MeetingFile) => {
    const { data } = supabase.storage
      .from('meeting_attachments')
      .getPublicUrl(attachment.file_url);
      
    if (data?.publicUrl) {
      Linking.openURL(data.publicUrl).catch(err => {
        console.error("Couldn't open URL:", err);
      });
    }
  };

  const getIconForType = (contentType: string | null) => {
    if (!contentType) return 'document-outline';
    if (contentType.includes('pdf')) return 'document-text';
    if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('csv')) return 'stats-chart';
    if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'easel';
    if (contentType.includes('word')) return 'document';
    return 'document-outline';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#e1c37a" />
      </View>
    );
  }

  if (attachments.length === 0) {
    return null; // Don't show the section if there are no attachments
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attachments</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {attachments.map((item) => {
          const isImage = item.file_type?.startsWith('image/');
          
          return (
            <TouchableOpacity 
              key={item.id} 
              style={styles.attachmentCard}
              onPress={() => handlePress(item)}
            >
              {isImage ? (
                <Image 
                  source={{ uri: supabase.storage.from('meeting_attachments').getPublicUrl(item.file_url).data.publicUrl }}
                  style={styles.imageThumbnail}
                />
              ) : (
                <View style={styles.documentThumbnail}>
                  <Ionicons name={getIconForType(item.file_type)} size={32} color="#e1c37a" />
                </View>
              )}
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{item.file_name || 'Document'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 12,
  },
  scrollContent: {
    gap: 12,
  },
  attachmentCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    marginRight: 12,
  },
  imageThumbnail: {
    width: '100%',
    height: 90,
    resizeMode: 'cover',
    backgroundColor: '#f3f4f6',
  },
  documentThumbnail: {
    width: '100%',
    height: 90,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    padding: 8,
  },
  fileName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f141a',
    marginBottom: 2,
  },
});
