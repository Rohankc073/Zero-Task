

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

// Mock Supabase
jest.mock('./src/lib/supabase', () => {
  const supabase = {
    auth: {
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
