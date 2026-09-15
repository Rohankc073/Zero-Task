import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const View = require('react-native').View;
  const Text = require('react-native').Text;
  const ScrollView = require('react-native').ScrollView;
  return {
    __esModule: true,
    default: {
      View: View,
      Text: Text,
      ScrollView: ScrollView,
      createAnimatedComponent: (c: any) => c,
    },
    FadeInUp: {
      delay: () => ({
        duration: () => ({}),
      }),
    },
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(() => ({})),
    withSpring: jest.fn(),
    withTiming: jest.fn(),
  };
});

// Mock chart libraries and confetti
jest.mock('react-native-gifted-charts', () => ({
  LineChart: () => null,
  PieChart: () => null,
}));

jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('../../src/components/TaskPreviewModal', () => () => null);
jest.mock('../../src/components/dashboards/MetricDrillDownModal', () => ({
  __esModule: true,
  MetricDrillDownModal: () => null,
  default: () => null,
}));
jest.mock('../../src/hooks/useInAppNotifications', () => ({
  useInAppNotifications: () => ({ unreadCount: 0, notifications: [] }),
}));
jest.mock('../../src/context/NotificationContext', () => ({
  useInAppNotificationsContext: () => ({ unreadCount: 0, notifications: [] }),
  NotificationProvider: ({ children }: any) => children,
}));

import DashboardScreen from '../../app/(drawer)/(tabs)/index';
import { ZeroTaskHeader } from '../../src/components/ZeroTaskHeader';
import { UnifiedDashboard } from '../../src/components/dashboards/UnifiedDashboard';

// Mock dashboard data hooks
const mockDashboardData = {
  metrics: {
    assigned: 5,
    inProgress: 2,
    completed: 10,
    overdue: 1,
    progressPercent: 75,
    assignedTrend: 10,
    inProgressTrend: 0,
    completedTrend: 25,
    overdueTrend: -5,
  },
  tasks: [],
  loading: false,
  pendingApprovals: 2,
  markTaskDone: jest.fn(),
  refetch: jest.fn(),
};

jest.mock('../../src/hooks/useDashboards', () => ({
  useEmployeeData: () => mockDashboardData,
  useManagerData: () => mockDashboardData,
  useDepartmentHeadData: () => mockDashboardData,
  useFounderData: () => mockDashboardData,
}));

let mockCurrentRole = 'Employee';
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'fake-token', user: { id: 'test-user', role: mockCurrentRole } },
    user: { id: 'test-user', role: mockCurrentRole },
    profile: { id: 'test-user', role: mockCurrentRole, full_name: 'Test User' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const renderWithProviders = (element: React.ReactElement) => {
  return ReactTestRenderer.create(element);
};

describe('ZeroTask Home Screen Navigation Hierarchy & Navbar Cardinality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  jest.setTimeout(15000);

  it('renders EXACTLY ONE ZeroTaskHeader on Home screen for Employee role', async () => {
    mockCurrentRole = 'Employee';
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = renderWithProviders(<DashboardScreen />);
    });

    const headers = renderer!.root.findAllByType(ZeroTaskHeader);
    expect(headers.length).toBe(1);

    renderer!.unmount();
  });

  it('renders EXACTLY ONE ZeroTaskHeader on Home screen for Manager role', async () => {
    mockCurrentRole = 'Manager';
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = renderWithProviders(<DashboardScreen />);
    });

    const headers = renderer!.root.findAllByType(ZeroTaskHeader);
    expect(headers.length).toBe(1);

    renderer!.unmount();
  });

  it('renders EXACTLY ONE ZeroTaskHeader on Home screen for Department Head role', async () => {
    mockCurrentRole = 'Department Head';
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = renderWithProviders(<DashboardScreen />);
    });

    const headers = renderer!.root.findAllByType(ZeroTaskHeader);
    expect(headers.length).toBe(1);

    renderer!.unmount();
  });

  it('renders EXACTLY ONE ZeroTaskHeader on Home screen for Founder role', async () => {
    mockCurrentRole = 'Founder';
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = renderWithProviders(<DashboardScreen />);
    });

    const headers = renderer!.root.findAllByType(ZeroTaskHeader);
    expect(headers.length).toBe(1);

    renderer!.unmount();
  });

  it('verifies UnifiedDashboard does NOT render an embedded ZeroTaskHeader', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = renderWithProviders(
        <UnifiedDashboard
          assigned={5}
          inProgress={2}
          completed={10}
          overdue={1}
          tasks={[]}
          onViewAllTasks={() => {}}
          progressPercent={75}
          loading={false}
        />
      );
    });

    const embeddedHeaders = renderer!.root.findAllByType(ZeroTaskHeader);
    expect(embeddedHeaders.length).toBe(0);

    renderer!.unmount();
  });
});

