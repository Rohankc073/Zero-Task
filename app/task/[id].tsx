import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import TaskDetailModal from '../../src/components/TaskDetailModal';

export default function TaskDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  if (!id) return <View className="flex-1 bg-[#f7f6f2]" />;

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(drawer)/(tabs)' as any);
    }
  };

  return (
    <View className="flex-1 bg-transparent">
      <TaskDetailModal 
        taskId={id as string} 
        visible={true} 
        onClose={handleClose} 
      />
    </View>
  );
}
