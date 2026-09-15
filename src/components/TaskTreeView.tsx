import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../theme/tokens';
import { Task } from '../types';

interface TaskTreeViewProps {
  task: Task;
  level?: number;
  onTaskPress?: (taskId: string) => void;
  isExpandedDefault?: boolean;
}

export const TaskTreeView: React.FC<TaskTreeViewProps> = ({ 
  task, 
  level = 0, 
  onTaskPress,
  isExpandedDefault = true 
}) => {
  const [expanded, setExpanded] = useState(isExpandedDefault);
  const hasChildren = task.subtasks && task.subtasks.length > 0;
  
  // Letter avatar (first char of title or ID)
  const letter = (task.title ? task.title.charAt(0) : '?').toUpperCase();
  
  // Colors for different levels
  const levelColors = [
    '#e0e7ff', // 0: Indigo light
    '#dbeafe', // 1: Blue light
    '#e0f2fe', // 2: Sky light
    '#f3e8ff', // 3: Purple light
    '#fce7f3', // 4: Pink light
  ];
  
  const levelTextColors = [
    '#4338ca', // 0
    '#1d4ed8', // 1
    '#0369a1', // 2
    '#7e22ce', // 3
    '#be185d', // 4
  ];

  const bgColor = levelColors[level % levelColors.length];
  const txtColor = levelTextColors[level % levelTextColors.length];

  return (
    <View style={styles.nodeContainer}>
      <View style={styles.row}>
        {/* Branch Lines */}
        {level > 0 && (
          <View style={styles.branchContainer}>
            <View style={styles.verticalLine} />
            <View style={styles.horizontalLine} />
            <View style={styles.nodeDot} />
          </View>
        )}
        
        {/* Task Item */}
        <TouchableOpacity 
          style={[styles.taskCard, level > 0 && { flex: 1 }]}
          onPress={() => hasChildren ? setExpanded(!expanded) : (onTaskPress && onTaskPress(task.id))}
          activeOpacity={0.7}
        >
          <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={[styles.avatarText, { color: txtColor }]}>{letter}</Text>
          </View>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {level > 0 && <Text style={{ color: Colors.textMuted }}>{letter} - </Text>}
            {task.title}
          </Text>
          {hasChildren && (
            <Ionicons 
              name={expanded ? "chevron-down" : "chevron-forward"} 
              size={18} 
              color={Colors.textSecondary} 
              style={{ marginLeft: 'auto' }}
            />
          )}
        </TouchableOpacity>
      </View>
      
      {/* Recursive Children */}
      {expanded && hasChildren && (
        <View style={styles.childrenContainer}>
          {/* Connecting line to children */}
          <View style={[styles.childrenVerticalLine, { left: 16 }]} />
          {task.subtasks!.map((subtask) => (
            <TaskTreeView 
              key={subtask.id} 
              task={subtask} 
              level={level + 1} 
              onTaskPress={onTaskPress}
              isExpandedDefault={false}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  nodeContainer: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchContainer: {
    width: 24,
    height: 48,
    position: 'relative',
  },
  verticalLine: {
    position: 'absolute',
    left: -8, // aligns with parent's center
    top: -24,
    bottom: 24,
    width: 2,
    backgroundColor: Colors.borderSubtle,
  },
  horizontalLine: {
    position: 'absolute',
    left: -8,
    top: 23,
    width: 32,
    height: 2,
    backgroundColor: Colors.borderSubtle,
  },
  nodeDot: {
    position: 'absolute',
    left: 20,
    top: 20,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.borderSubtle,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 14,
  },
  taskTitle: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 15,
    color: Colors.textPrimary,
    flex: 1,
  },
  childrenContainer: {
    marginLeft: 32,
    marginTop: 0,
    position: 'relative',
  },
  childrenVerticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 24,
    width: 2,
    backgroundColor: Colors.borderSubtle,
    zIndex: -1,
  }
});
