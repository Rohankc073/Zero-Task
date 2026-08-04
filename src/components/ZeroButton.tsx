import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps } from 'react-native';
import { StyleProp, TextStyle } from 'react-native';

interface ZeroButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  textStyle?: StyleProp<TextStyle>;
}

export function ZeroButton({ 
  title, 
  loading = false, 
  variant = 'primary', 
  className = '', 
  textStyle,
  ...props 
}: ZeroButtonProps) {
  
  const baseClasses = "w-full p-[14px] rounded-lg flex-row justify-center items-center my-2";
  
  let variantClasses = "";
  let textClasses = "text-base font-bold";

  switch (variant) {
    case 'primary':
      variantClasses = "bg-[#0f141a]";
      textClasses += " text-white";
      break;
    case 'secondary':
      variantClasses = "bg-gray-200";
      textClasses += " text-[#0f141a]";
      break;
    case 'outline':
      variantClasses = "bg-transparent";
      textClasses += " text-[#e1c37a]";
      break;
  }

  return (
    <TouchableOpacity 
      className={`${baseClasses} ${variantClasses} ${props.disabled ? 'opacity-50' : ''} ${className}`}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0f141a' : '#e1c37a'} />
      ) : (
        <Text className={textClasses} style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
