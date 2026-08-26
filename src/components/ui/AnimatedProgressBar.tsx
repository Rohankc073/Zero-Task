import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Layout } from '../../theme/tokens';

interface AnimatedProgressBarProps {
  progress: number; // 0 - 100
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}

export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  progress,
  height = 6,
  trackColor = Colors.borderSubtle,
  fillColor = Colors.primary,
  style,
  borderRadius = Layout.radius.full,
}) => {
  const animatedWidth = useSharedValue(Math.min(100, Math.max(0, progress)));

  useEffect(() => {
    animatedWidth.value = withTiming(Math.min(100, Math.max(0, progress)), {
      duration: 450,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress]);

  const animatedFillStyle = useAnimatedStyle(() => {
    return {
      width: `${animatedWidth.value}%`,
    };
  });

  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: trackColor, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          { height, backgroundColor: fillColor, borderRadius },
          animatedFillStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
