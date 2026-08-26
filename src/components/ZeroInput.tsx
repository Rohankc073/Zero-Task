import React from 'react';
import { TextInputProps, StyleProp, TextStyle } from 'react-native';
import { Input } from './ui/Input';

interface ZeroInputProps extends TextInputProps {
  label?: string;
  error?: string;
  style?: StyleProp<TextStyle>;
}

export function ZeroInput({ label, error, style, ...props }: ZeroInputProps) {
  return (
    <Input
      label={label}
      error={error}
      style={style as any}
      {...props}
    />
  );
}
