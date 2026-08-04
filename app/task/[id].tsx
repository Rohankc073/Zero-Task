import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import TaskPreviewModal from '../../src/components/TaskPreviewModal';

export default function TaskDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  if (!id) return <View className="flex-1 bg-[#f7f6f2]" />;

  return (
    <View className="flex-1 bg-transparent">
      <TaskPreviewModal 
        taskId={id as string} 
        visible={true} 
        onClose={() => router.back()} 
      />
    </View>
  );
}
