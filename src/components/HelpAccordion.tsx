import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { LogBox } from 'react-native';

LogBox.ignoreLogs(['setLayoutAnimationEnabledExperimental is currently a no-op']);

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

interface HelpAccordionProps {
  question: string;
  answer: string;
}

export function HelpAccordion({ question, answer }: HelpAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const progress = useSharedValue(0);

  const toggleAccordion = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    progress.value = withTiming(nextState ? 1 : 0, { duration: 300 });
  };

  const animatedIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(progress.value, [0, 1], [0, 180], Extrapolation.CLAMP);
    return {
      transform: [{ rotate: `${rotate}deg` }],
    };
  });

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.header, !isExpanded && styles.headerCollapsed]} 
        onPress={toggleAccordion}
        activeOpacity={0.7}
      >
        <Text style={styles.question}>{question}</Text>
        <Animated.View style={animatedIconStyle}>
          <Ionicons name="chevron-down" size={24} color="#0f141a" />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.contentContainer}>
          <View style={styles.contentInner}>
            <Text style={styles.answer}>{answer}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  headerCollapsed: {
    borderBottomWidth: 2,
    borderBottomColor: '#0f141a',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  question: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f141a',
    marginRight: 16,
  },
  contentContainer: {
    overflow: 'hidden',
  },
  contentInner: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#f7f6f2',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  answer: {
    fontSize: 15,
    color: 'rgba(15, 20, 26, 0.8)',
    lineHeight: 22,
  },
});
