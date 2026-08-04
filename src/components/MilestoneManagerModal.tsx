import React, { useState, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DepartmentMilestone } from '../types';
import { useAuditLog } from '../hooks/useAuditLog';

export interface MilestoneManagerModalRef {
  present: () => void;
  dismiss: () => void;
}

export const MilestoneManagerModal = forwardRef<MilestoneManagerModalRef, {}>((props, ref) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [existingMilestones, setExistingMilestones] = useState<DepartmentMilestone[]>([]);
  const { logAction } = useAuditLog();

  useImperativeHandle(ref, () => ({
    present: () => {
      fetchExisting();
      bottomSheetModalRef.current?.present();
    },
    dismiss: () => bottomSheetModalRef.current?.dismiss()
  }));

  const fetchExisting = async () => {
    if (!profile?.department_id) return;
    const { data, error } = await supabase
      .from('department_milestones')
      .select('*')
      .eq('department_id', profile.department_id)
      .eq('is_achieved', false)
      .order('created_at', { ascending: false });

    if (data) {
      setExistingMilestones(data as DepartmentMilestone[]);
    }
  };

  const handleCreate = async () => {
    if (!profile?.department_id || !title || !targetValue || !unit) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    
    setLoading(true);
    const { error } = await supabase
      .from('department_milestones')
      .insert({
        department_id: profile.department_id,
        title,
        target_value: parseFloat(targetValue),
        unit,
        current_value: 0,
        is_achieved: false
      });
      
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      logAction('MILESTONE_UPDATE', `Created milestone: ${title} with target ${targetValue} ${unit}`);
      setTitle('');
      setTargetValue('');
      setUnit('');
      Keyboard.dismiss();
      fetchExisting();
    }
  };

  const handleUpdate = async (id: string, currentVal: number, newTargetVal: number, newTitle: string) => {
    setLoading(true);
    const { error } = await supabase
      .from('department_milestones')
      .update({
        current_value: currentVal,
        target_value: newTargetVal,
        title: newTitle,
        is_achieved: currentVal >= newTargetVal
      })
      .eq('id', id);
      
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      logAction('MILESTONE_UPDATE', `Updated milestone: ${newTitle} progress to ${currentVal}/${newTargetVal}`);
      fetchExisting();
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={['75%', '90%']}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: '#f7f6f2' }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <BottomSheetScrollView contentContainerStyle={{ padding: 20 }}>
          <Text className="text-2xl font-bold text-dark mb-6">Manage Milestones</Text>
          
          <View className="bg-white p-4 rounded-2xl mb-8 border border-gray-200">
            <Text className="text-lg font-bold text-dark mb-4">Create New Target</Text>
            
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-500 mb-1">Title</Text>
              <TextInput
                className="bg-background px-4 py-3 rounded-xl border border-gray-200 text-dark"
                placeholder="e.g. Q3 Revenue"
                value={title}
                onChangeText={setTitle}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View className="flex-row space-x-4 mb-6">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-500 mb-1">Target</Text>
                <TextInput
                  className="bg-background px-4 py-3 rounded-xl border border-gray-200 text-dark"
                  placeholder="100000"
                  value={targetValue}
                  onChangeText={setTargetValue}
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-500 mb-1">Unit</Text>
                <TextInput
                  className="bg-background px-4 py-3 rounded-xl border border-gray-200 text-dark"
                  placeholder="USD"
                  value={unit}
                  onChangeText={setUnit}
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <TouchableOpacity 
              className="bg-dark py-4 rounded-xl items-center flex-row justify-center"
              onPress={handleCreate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#e1c37a" />
              ) : (
                <Text className="text-primary font-bold text-base">Create Target</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text className="text-lg font-bold text-dark mb-4">Active Milestones</Text>
          
          {existingMilestones.map((milestone) => (
            <View key={milestone.id} className="bg-white p-4 rounded-2xl mb-4 border border-gray-200">
              <TextInput 
                className="font-bold text-dark text-lg mb-2 p-0"
                value={milestone.title}
                onChangeText={(text) => {
                  const updated = [...existingMilestones];
                  const idx = updated.findIndex(m => m.id === milestone.id);
                  if(idx > -1) updated[idx].title = text;
                  setExistingMilestones(updated);
                }}
              />
              
              <View className="flex-row items-center mb-4 space-x-4">
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 mb-1">Current ({milestone.unit})</Text>
                  <TextInput
                    className="bg-background px-3 py-2 rounded-lg border border-gray-200 text-dark"
                    value={milestone.current_value.toString()}
                    keyboardType="numeric"
                    onChangeText={(text) => {
                      const updated = [...existingMilestones];
                      const idx = updated.findIndex(m => m.id === milestone.id);
                      if(idx > -1) updated[idx].current_value = parseFloat(text) || 0;
                      setExistingMilestones(updated);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 mb-1">Target ({milestone.unit})</Text>
                  <TextInput
                    className="bg-background px-3 py-2 rounded-lg border border-gray-200 text-dark"
                    value={milestone.target_value.toString()}
                    keyboardType="numeric"
                    onChangeText={(text) => {
                      const updated = [...existingMilestones];
                      const idx = updated.findIndex(m => m.id === milestone.id);
                      if(idx > -1) updated[idx].target_value = parseFloat(text) || 0;
                      setExistingMilestones(updated);
                    }}
                  />
                </View>
              </View>

              <TouchableOpacity 
                className="bg-primary/20 py-2 rounded-lg items-center border border-primary/50"
                onPress={() => handleUpdate(milestone.id, milestone.current_value, milestone.target_value, milestone.title)}
              >
                <Text className="text-dark font-semibold">Update Progress</Text>
              </TouchableOpacity>
            </View>
          ))}
          {existingMilestones.length === 0 && (
            <Text className="text-gray-500 text-center italic mt-4">No active milestones.</Text>
          )}

          <View className="h-10" />
        </BottomSheetScrollView>
      </KeyboardAvoidingView>
    </BottomSheetModal>
  );
});
