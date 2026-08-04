import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { ZeroInput } from './ZeroInput';
import { ZeroButton } from './ZeroButton';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { TaskPriority } from '../types';

export type CreateTaskModalRef = BottomSheetModal;

interface CreateTaskModalProps {
  onSuccess?: (task: any) => void;
}

const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 MB

export const CreateTaskModal = forwardRef<CreateTaskModalRef, CreateTaskModalProps>(({ onSuccess }, ref) => {
  const { session, profile } = useAuth();
  const snapPoints = useMemo(() => ['85%', '95%'], []);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  
  const [documents, setDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    []
  );

  const handlePickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        const newDocs = [...documents, ...result.assets];
        
        // Calculate total size
        const totalSize = newDocs.reduce((acc, curr) => acc + (curr.size || 0), 0);
        if (totalSize > MAX_TOTAL_SIZE) {
          Alert.alert('Size Limit Exceeded', 'The total size of all attached documents must not exceed 20MB.');
          return;
        }
        
        setDocuments(newDocs);
      }
    } catch (err) {
      console.log('Error picking documents', err);
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(docs => docs.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim() || !session?.user) return;

    setLoading(true);
    setUploadProgress('Creating task...');
    
    try {
      // 1. Insert task and return the inserted row to get its ID
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: 'To Do',
          progress: 0,
          user_id: session.user.id, // Auto-assign to creator
          department_id: profile?.department_id || null,
        })
        .select()
        .single();

      if (taskError) throw taskError;
      
      const newTaskId = taskData.id;

      // 2. Upload Documents
      if (documents.length > 0) {
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          setUploadProgress(`Uploading document ${i + 1} of ${documents.length}...`);
          
          const filePath = `${session.user.id}/${Date.now()}_${doc.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          
          // Using base64 to ArrayBuffer conversion for Expo
          const base64 = await FileSystem.readAsStringAsync(doc.uri, { encoding: FileSystem.EncodingType.Base64 });
          const arrayBuffer = decode(base64);

          const { error: uploadError } = await supabase.storage
            .from('task-attachments')
            .upload(filePath, arrayBuffer, {
              contentType: doc.mimeType || 'application/octet-stream'
            });

          if (uploadError) {
            console.error('Failed to upload', doc.name, uploadError);
            throw new Error(`Failed to upload ${doc.name}: ${uploadError.message}`);
          }

          // 3. Insert into task_attachments
          const { error: dbError } = await supabase
            .from('task_attachments')
            .insert({
              task_id: newTaskId,
              uploaded_by: session.user.id,
              file_name: doc.name,
              file_path: filePath,
              file_size: doc.size || 0,
              content_type: doc.mimeType || 'application/octet-stream'
            });

          if (dbError) throw dbError;
        }
      }
      
      // Cleanup
      setTitle('');
      setDescription('');
      setPriority('Medium');
      setDocuments([]);
      setUploadProgress('');
      
      if (ref && 'current' in ref && ref.current) {
        ref.current.dismiss();
      }
      onSuccess?.(taskData);
    } catch (err: any) {
      console.error('Failed to create task:', err.message);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  if (profile?.role === 'Employee') {
    return null;
  }

  const currentTotalSize = documents.reduce((acc, curr) => acc + (curr.size || 0), 0);
  const sizeFormatted = (currentTotalSize / (1024 * 1024)).toFixed(2);

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: '#f7f6f2' }}
      handleIndicatorStyle={{ backgroundColor: '#0f141a' }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Create New Task</Text>
        
        <ZeroInput
          label="Task Title"
          placeholder="What needs to be done?"
          value={title}
          onChangeText={setTitle}
        />

        <View style={styles.spacer} />

        <View style={styles.section}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.row}>
            {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.segmentBtn,
                  priority === p && styles.segmentBtnActive,
                  priority === p && p === 'Urgent' && { backgroundColor: '#dc2626' },
                  priority === p && p === 'High' && { backgroundColor: '#ef4444' },
                  priority === p && p === 'Medium' && { backgroundColor: '#e1c37a' },
                  priority === p && p === 'Low' && { backgroundColor: '#9ca3af' },
                ]}
                onPress={() => setPriority(p as TaskPriority)}
              >
                <Text style={[
                  styles.segmentText,
                  priority === p && styles.segmentTextActive,
                  priority === p && { fontSize: p === 'Urgent' ? 12 : 14 }
                ]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.spacer} />

        <ZeroInput
          label="Description (Optional)"
          placeholder="Add more details..."
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <View style={styles.spacer} />

        {/* Document Attachments Section */}
        <View style={styles.section}>
          <View style={styles.attachmentHeader}>
            <Text style={styles.label}>Attachments</Text>
            <Text style={styles.sizeLimitText}>{sizeFormatted}MB / 20MB</Text>
          </View>
          
          {documents.length > 0 && (
            <View style={styles.documentList}>
              {documents.map((doc, index) => (
                <View key={index} style={styles.documentItem}>
                  <Ionicons name="document-text-outline" size={20} color="#e1c37a" />
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName} numberOfLines={1}>{doc.name}</Text>
                    <Text style={styles.documentSize}>{((doc.size || 0) / 1024 / 1024).toFixed(2)} MB</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeDocument(index)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.attachBtn} onPress={handlePickDocuments}>
            <Ionicons name="cloud-upload-outline" size={20} color="#0f141a" />
            <Text style={styles.attachBtnText}>Attach Documents</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#e1c37a" />
            <Text style={styles.loadingText}>{uploadProgress}</Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <ZeroButton
            title="Create Task"
            onPress={handleCreate}
            disabled={!title.trim() || loading}
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    padding: 24,
    paddingBottom: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 20,
  },
  spacer: {
    height: 20,
  },
  section: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    borderColor: 'transparent',
  },
  segmentText: {
    fontWeight: 'bold',
    color: '#4b5563',
    fontSize: 14,
  },
  segmentTextActive: {
    color: 'white',
  },
  attachmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sizeLimitText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    borderRadius: 8,
    marginTop: 8,
  },
  attachBtnText: {
    marginLeft: 8,
    fontWeight: 'bold',
    color: '#0f141a',
  },
  documentList: {
    marginBottom: 8,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 8,
  },
  documentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  documentName: {
    fontWeight: 'bold',
    color: '#0f141a',
    fontSize: 14,
  },
  documentSize: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  buttonContainer: {
    marginTop: 32,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  loadingText: {
    marginLeft: 10,
    color: '#666',
    fontWeight: '600',
  }
});
