import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f7f6f2]">
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  if (session) {
    return <Redirect href={"/(drawer)/(tabs)" as any} />;
  }

  return <Redirect href={"/(auth)/login" as any} />;
}
