import React from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';

interface ZeroInputProps extends TextInputProps {
  label?: string;
  error?: string;
  className?: string;
}

export function ZeroInput({ label, error, className = '', ...props }: ZeroInputProps) {
  return (
    <View className={`w-full mb-4 ${className}`}>
      {label && (
        <Text className="text-[#0f141a] mb-2 font-bold ml-1">
          {label}
        </Text>
      )}
      <TextInput
        className={`w-full bg-[#ffffff] p-[14px] rounded-lg border ${error ? 'border-red-500' : 'border-gray-200'} text-[#0f141a]`}
        placeholderTextColor="#9ca3af"
        {...props}
      />
      {error && (
        <Text className="text-red-500 text-sm mt-1 ml-1">
          {error}
        </Text>
      )}
    </View>
  );
}
