// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useNavigation: () => ({
    dispatch: jest.fn(),
    getParent: jest.fn(),
    getState: jest.fn(),
  }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

// Mock Supabase
jest.mock('./src/lib/supabase', () => {
  const supabase = {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ data: { session: null, user: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { supabase };
});

// Mock AuthContext
jest.mock('./src/context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'test-user-id', user_metadata: { name: 'Test User' } } },
    user: { id: 'test-user-id', user_metadata: { name: 'Test User' } },
    isLoading: false,
  }),
}));

// Mock Notifications
jest.mock('./src/lib/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn().mockResolvedValue('mock-push-token'),
}));

// Mock DateTimePicker
jest.mock('@react-native-community/datetimepicker', () => {
  const mockReact = require('react');
  return function MockDateTimePicker(props) {
    return mockReact.createElement('DateTimePicker', props, props.children);
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const Provider = ({ children }) => children;
  Provider.displayName = 'SafeAreaProvider';
  const SafeArea = ({ children }) => children;
  SafeArea.displayName = 'SafeAreaView';
  return {
    SafeAreaProvider: Provider,
    SafeAreaConsumer: ({ children }) => children(inset),
    SafeAreaView: SafeArea,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

