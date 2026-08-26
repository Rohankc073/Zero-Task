import React from 'react';
import { TouchableOpacityProps, StyleProp, TextStyle } from 'react-native';
import { Button } from './ui/Button';

interface ZeroButtonProps extends Omit<TouchableOpacityProps, 'onPress'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning';
  textStyle?: StyleProp<TextStyle>;
  onPress?: () => void;
  style?: any;
}

export function ZeroButton({ 
  title, 
  loading = false, 
  variant = 'primary', 
  textStyle,
  style,
  onPress,
  ...props 
}: ZeroButtonProps) {
  let mappedVariant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary';
  
  if (variant === 'secondary' || variant === 'outline') {
    mappedVariant = 'secondary';
  } else if (variant === 'destructive') {
    mappedVariant = 'danger';
  }

  return (
    <Button
      title={title}
      loading={loading}
      variant={mappedVariant}
      textStyle={textStyle as any}
      style={style}
      disabled={props.disabled}
      onPress={onPress || (() => {})}
    />
  );
}
