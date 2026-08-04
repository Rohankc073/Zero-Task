import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { X, Calendar, Paperclip, Send, File, FileText, Image as ImageIcon } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Task, ActivityComment, TaskFile } from '../types';

interface TaskPreviewModalProps {
  taskId: string | null;
  visible: boolean;
  onClose: () => void;
}

const TaskPreviewModal = React.memo(({ taskId, visible, onClose }: TaskPreviewModalProps) => {
  const { profile } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Activity' | 'Attachments'>('Activity');
  
  // Comment state
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [updatingDate, setUpdatingDate] = useState(false);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (visible && taskId) {
      fetchTaskData();
    } else {
      // Reset state on close
      setTask(null);
      setComments([]);
      setFiles([]);
      setActiveTab('Activity');
    }
  }, [visible, taskId]);

  const fetchTaskData = async () => {
    if (!taskId) return;
    setLoading(true);
    
    // Fetch task
    const { data: taskData, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
      
    if (taskError) {
      console.error('Error fetching task:', taskError);
    }
    if (taskData) {
      if (taskData.user_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', taskData.user_id)
          .single();
        taskData.assignee = userData;
      }
      setTask(taskData);
    }

    // Fetch comments
    const { data: commentsData, error: commentsError } = await supabase
      .from('activity_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
      
    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
    }
    if (commentsData) {
      // Fetch users for comments manually
      const userIds = [...new Set(commentsData.map(c => c.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds);
          
        if (usersData) {
          const userMap = usersData.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as any);
          
          commentsData.forEach((c: any) => {
            c.user = userMap[c.user_id];
          });
        }
      }
      setComments(commentsData as any);
    }

    // Fetch files
    const { data: filesData, error: filesError } = await supabase
      .from('task_files')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
      
    if (filesError) {
      console.error('Error fetching files:', filesError);
    }
    if (filesData) setFiles(filesData as any);

    setLoading(false);
  };

  const handleUpdateDeadline = async (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    
    // Support for both (event, date) and (event) with timestamp signatures
    const timestamp = event?.nativeEvent?.timestamp;
    const finalDate = selectedDate || (timestamp ? new Date(timestamp) : undefined);
    
    if (!finalDate || !taskId) return;
    
    if (profile?.role === 'Employee') {
      Alert.alert("Permission Denied", "Employees cannot modify task deadlines.");
      return;
    }
    
    setUpdatingDate(true);
    const { error } = await supabase
      .from('tasks')
      .update({ due_date: finalDate.toISOString() })
      .eq('id', taskId);
      
    if (error) {
      Alert.alert("Update Failed", error.message);
    } else {
      setTask((prev: any) => ({ ...prev, due_date: finalDate.toISOString() }));
    }
    setUpdatingDate(false);
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || !taskId || !profile?.id) return;
    setPostingComment(true);
    
    const { data, error } = await supabase
      .from('activity_comments')
      .insert({
        task_id: taskId,
        user_id: profile.id,
        content: newComment.trim()
      })
      .select('*')
      .single();
      
    if (!error && data) {
      const newCommentData = {
        ...data,
        user: { full_name: profile.full_name || profile.name || 'You' }
      };
      setComments(prev => [...prev, newCommentData as any]);
      setNewComment('');
    } else {
      Alert.alert('Error', 'Failed to post comment.');
    }
    
    setPostingComment(false);
  };

  const handleFileUpload = async () => {
    if (!taskId || !profile?.id) return;
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/*'],
        copyToCacheDirectory: true
      });

      if (result.canceled) return;
      
      setUploadingFile(true);
      const file = result.assets[0];
      
      // Read file as base64 for Supabase upload
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const arrayBuffer = decode(base64);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${taskId}-${Date.now()}.${fileExt}`;
      const filePath = `${profile.id}/${fileName}`;
      
      // Upload to storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('task_attachments')
        .upload(filePath, arrayBuffer, {
          contentType: file.mimeType || 'application/octet-stream',
        });
        
      if (uploadError) {
        throw uploadError;
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task_attachments')
        .getPublicUrl(filePath);
        
      // Save to task_files
      const { data: fileRecord, error: dbError } = await supabase
        .from('task_files')
        .insert({
          task_id: taskId,
          user_id: profile.id,
          file_url: publicUrl,
          file_type: fileExt || 'unknown',
          file_name: file.name
        })
        .select()
        .single();
        
      if (dbError) throw dbError;
      
      if (fileRecord) {
        setFiles(prev => [fileRecord as any, ...prev]);
      }
      
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'An error occurred while uploading.');
    } finally {
      setUploadingFile(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-500';
      case 'High': return 'bg-orange-500';
      case 'Medium': return 'bg-yellow-500';
      default: return 'bg-blue-400';
    }
  };
  
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const getFileIcon = (fileType: string) => {
    if (['png', 'jpg', 'jpeg', 'gif'].includes(fileType.toLowerCase())) {
      return <ImageIcon size={24} color="#e1c37a" />;
    }
    if (['pdf'].includes(fileType.toLowerCase())) {
      return <FileText size={24} color="#ef4444" />;
    }
    return <File size={24} color="#3b82f6" />;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#f7f6f2]">
        {/* Header */}
        <View className="flex-row items-center justify-between p-6 bg-[#0f141a] pt-12">
          <Text className="text-[#f7f6f2] text-xl font-bold">Task Preview</Text>
          <TouchableOpacity onPress={onClose} className="p-2">
            <X size={24} color="#f7f6f2" />
          </TouchableOpacity>
        </View>

        {loading && !task ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#e1c37a" />
          </View>
        ) : task ? (
          <View className="flex-1">
            {/* Task Details Section */}
            <View className="p-6 bg-white border-b border-gray-200">
              <View className="flex-row justify-between items-start mb-4">
                <Text className="text-2xl font-bold text-[#0f141a] flex-1 mr-4">{task.title}</Text>
                <View className="items-end space-y-2">
                  <View className={`px-3 py-1 rounded-full ${getPriorityColor(task.priority)}`}>
                    <Text className="text-white text-xs font-bold">{task.priority}</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full bg-gray-200">
                    <Text className="text-[#0f141a] text-xs font-medium">{task.status}</Text>
                  </View>
                </View>
              </View>

              {/* Metrics: Progress */}
              <View className="mb-6">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-gray-500 text-sm font-medium">Progress</Text>
                  <Text className="text-[#0f141a] text-sm font-bold">{task.progress || 0}%</Text>
                </View>
                <View className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <View 
                    className="h-full bg-[#e1c37a] rounded-full" 
                    style={{ width: `${task.progress || 0}%` }} 
                  />
                </View>
              </View>

              {/* Metrics: Dates & Assignee */}
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-1">
                  <Text className="text-gray-500 text-xs uppercase font-bold mb-1">Date Assigned</Text>
                  <Text className="text-[#0f141a] font-medium">
                    {new Date(task.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-500 text-xs uppercase font-bold mb-1">Deadline</Text>
                  <TouchableOpacity 
                    onPress={() => profile?.role !== 'Employee' && setShowDatePicker(true)}
                    disabled={profile?.role === 'Employee' || updatingDate}
                    className="flex-row items-center space-x-2"
                  >
                    <Calendar size={16} color={profile?.role === 'Employee' ? '#9ca3af' : '#e1c37a'} />
                    <Text className={`font-medium ${profile?.role === 'Employee' ? 'text-gray-400' : 'text-[#0f141a]'}`}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Set Deadline'}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={task.due_date ? new Date(task.due_date) : new Date()}
                      mode="date"
                      display="default"
                      onValueChange={handleUpdateDeadline}
                      onDismiss={() => setShowDatePicker(false)}
                    />
                  )}
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-gray-500 text-xs uppercase font-bold mb-1">Assignee</Text>
                  <View className="w-10 h-10 rounded-full bg-[#0f141a] items-center justify-center">
                    <Text className="text-[#e1c37a] font-bold text-sm">
                      {getInitials(task.assignee?.full_name)}
                    </Text>
                  </View>
                </View>
              </View>
              
              {task.description && (
                <View className="mt-2">
                  <Text className="text-gray-500 text-xs uppercase font-bold mb-1">Description</Text>
                  <Text className="text-gray-700 leading-5">{task.description}</Text>
                </View>
              )}
            </View>

            {/* Tabs */}
            <View className="flex-row border-b border-gray-200">
              <TouchableOpacity 
                className={`flex-1 py-4 items-center ${activeTab === 'Activity' ? 'border-b-2 border-[#e1c37a]' : ''}`}
                onPress={() => setActiveTab('Activity')}
              >
                <Text className={`font-bold ${activeTab === 'Activity' ? 'text-[#0f141a]' : 'text-gray-400'}`}>
                  Activity
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`flex-1 py-4 items-center ${activeTab === 'Attachments' ? 'border-b-2 border-[#e1c37a]' : ''}`}
                onPress={() => setActiveTab('Attachments')}
              >
                <Text className={`font-bold ${activeTab === 'Attachments' ? 'text-[#0f141a]' : 'text-gray-400'}`}>
                  Attachments
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content */}
            <View className="flex-1 bg-[#f7f6f2]">
              {activeTab === 'Activity' ? (
                <View className="flex-1">
                  <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 20 }}>
                    {comments.length === 0 ? (
                      <Text className="text-center text-gray-500 mt-10">No activity yet. Start the conversation!</Text>
                    ) : (
                      comments.map((comment) => (
                        <View key={comment.id} className="mb-4 bg-white p-3 rounded-xl shadow-sm">
                          <View className="flex-row justify-between items-center mb-2">
                            <Text className="font-bold text-[#0f141a]">{comment.user?.full_name || 'User'}</Text>
                            <Text className="text-xs text-gray-400">
                              {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <Text className="text-gray-700">{comment.content}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                  <View className="p-4 bg-white border-t border-gray-200 flex-row items-center mb-8">
                    <TextInput
                      className="flex-1 bg-[#f7f6f2] p-3 rounded-full mr-3 text-[#0f141a]"
                      placeholder="Type a message..."
                      value={newComment}
                      onChangeText={setNewComment}
                      multiline
                    />
                    <TouchableOpacity 
                      onPress={handlePostComment}
                      disabled={postingComment || !newComment.trim()}
                      className={`w-12 h-12 rounded-full items-center justify-center ${newComment.trim() ? 'bg-[#0f141a]' : 'bg-gray-300'}`}
                    >
                      {postingComment ? (
                         <ActivityIndicator size="small" color="#e1c37a" />
                      ) : (
                         <Send size={20} color={newComment.trim() ? '#e1c37a' : '#fff'} style={{ marginLeft: -2 }} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="flex-1 p-4">
                  <TouchableOpacity 
                    className="w-full bg-white border border-dashed border-gray-400 rounded-xl p-6 items-center justify-center mb-6"
                    onPress={handleFileUpload}
                    disabled={uploadingFile}
                  >
                    {uploadingFile ? (
                      <ActivityIndicator size="large" color="#e1c37a" />
                    ) : (
                      <>
                        <Paperclip size={32} color="#0f141a" className="mb-2" />
                        <Text className="font-bold text-[#0f141a]">Upload a File</Text>
                        <Text className="text-sm text-gray-500 mt-1">PDF, DOCX, XLSX, Images</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  <ScrollView>
                    <View className="flex-row flex-wrap justify-between">
                      {files.length === 0 && !uploadingFile ? (
                        <Text className="text-gray-500 w-full text-center mt-4">No attachments yet.</Text>
                      ) : (
                        files.map((file) => (
                          <View key={file.id} className="w-[48%] bg-white p-4 rounded-xl shadow-sm mb-4 items-center">
                            {getFileIcon(file.file_type || '')}
                            <Text className="text-xs text-center font-bold text-[#0f141a] mt-2 mb-1" numberOfLines={1}>
                              {file.file_name || (file.file_type ? `Attachment.${file.file_type}` : 'Attachment')}
                            </Text>
                            <Text className="text-[10px] text-gray-400">
                              {new Date(file.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View className="flex-1 justify-center items-center p-6">
            <Text className="text-gray-500 text-lg text-center mb-4">Task could not be found or failed to load.</Text>
            <TouchableOpacity onPress={onClose} className="px-6 py-3 bg-[#e1c37a] rounded-xl">
              <Text className="text-[#0f141a] font-bold">Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
});

export default TaskPreviewModal;
