import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Settings2 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useGamification } from '../context/GamificationContext';
import { DepartmentMilestone } from '../types';
import { MilestoneManagerModal, MilestoneManagerModalRef } from './MilestoneManagerModal';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

interface ROIWidgetProps {
  overrideDepartmentId?: string;
}

export const ROIWidget = ({ overrideDepartmentId }: ROIWidgetProps = {}) => {
  const { profile } = useAuth();
  const { triggerConfetti } = useGamification();
  const [milestones, setMilestones] = useState<DepartmentMilestone[]>([]);
  const modalRef = useRef<MilestoneManagerModalRef>(null);

  const isManagerOrFounder = ['Founder', 'Department Head', 'Manager'].includes(profile?.role || '');

  const targetDepartmentId = overrideDepartmentId || profile?.department_id;

  useEffect(() => {
    if (!targetDepartmentId) return;

    fetchMilestones();

    const subscription = supabase
      .channel('department_milestones_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'department_milestones',
          filter: `department_id=eq.${targetDepartmentId}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const newDoc = payload.new as DepartmentMilestone;
            const oldDoc = payload.old as DepartmentMilestone;
            
            // Trigger confetti if we just crossed the target value in this session
            if (newDoc.current_value >= newDoc.target_value && oldDoc.current_value < oldDoc.target_value) {
              triggerConfetti();
            }
          }
          fetchMilestones();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [targetDepartmentId, triggerConfetti]);

  const fetchMilestones = async () => {
    if (!targetDepartmentId) return;
    const { data } = await supabase
      .from('department_milestones')
      .select('*')
      .eq('department_id', targetDepartmentId)
      .eq('is_achieved', false)
      .order('created_at', { ascending: false })
      .limit(3);

    if (data) {
      setMilestones(data as DepartmentMilestone[]);
    }
  };

  if (milestones.length === 0 && !isManagerOrFounder) {
    return null; // Hide if nothing to show for employees
  }

  return (
    <View className="bg-white m-4 rounded-3xl p-6 shadow-sm shadow-dark/5 border border-gray-100">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-xl font-extrabold text-dark tracking-tight">ROI & Milestones</Text>
        {isManagerOrFounder && (
          <TouchableOpacity 
            onPress={() => modalRef.current?.present()}
            className="bg-primary/20 p-2 rounded-full border border-primary/30"
          >
            <Settings2 size={20} color="#0f141a" />
          </TouchableOpacity>
        )}
      </View>

      {milestones.length === 0 ? (
        <View className="py-4 items-center">
          <Text className="text-gray-400 italic">No active milestones yet.</Text>
        </View>
      ) : (
        milestones.map(milestone => (
          <MilestoneBar key={milestone.id} milestone={milestone} />
        ))
      )}
      
      <MilestoneManagerModal ref={modalRef} />
    </View>
  );
};

const MilestoneBar = ({ milestone }: { milestone: DepartmentMilestone }) => {
  const overDelivered = milestone.current_value > milestone.target_value;
  const isAchieved = milestone.current_value >= milestone.target_value;
  
  const percentage = Math.min(100, Math.max(0, (milestone.current_value / milestone.target_value) * 100));

  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(`${percentage}%`, { duration: 1000, easing: Easing.out(Easing.exp) }),
      backgroundColor: overDelivered || isAchieved ? '#e1c37a' : '#0f141a',
    };
  });

  return (
    <View className="mb-6 last:mb-0">
      <View className="flex-row justify-between items-end mb-2">
        <Text className="text-dark font-bold text-base flex-1 mr-2">{milestone.title}</Text>
        <Text className="text-gray-500 font-semibold text-xs">
          {milestone.current_value} / {milestone.target_value} {milestone.unit}
        </Text>
      </View>
      
      <View className="h-4 bg-background rounded-full overflow-hidden border border-gray-200">
        <Animated.View className="h-full rounded-full shadow-sm" style={animatedStyle} />
      </View>
      
      {overDelivered && (
        <View className="mt-2 flex-row justify-end">
          <Text className="text-primary font-black text-xs uppercase tracking-wider">
            OVER-DELIVERED: +{milestone.current_value - milestone.target_value} {milestone.unit}
          </Text>
        </View>
      )}
    </View>
  );
};
