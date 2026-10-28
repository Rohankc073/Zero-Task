import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NewDirectChatModal } from '../../src/components/chat/NewDirectChatModal';
import { ZeroTaskHeader } from '../../src/components/ZeroTaskHeader';
import { UserService } from '../../src/services/users/UserService';

// Mock responsive hook
jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isSmallDevice: false, isTablet: false }),
}));

// Mock AuthContext
let mockProfile: any = {
  id: 'user-founder-1',
  role: 'Founder',
  company_id: 'comp-1',
  full_name: 'Founder User',
  email: 'founder@test.com',
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    profile: mockProfile,
    user: mockProfile,
  }),
}));

// Mock ZeroTaskHeader
jest.mock('../../src/components/ZeroTaskHeader', () => ({
  ZeroTaskHeader: jest.fn(() => null),
}));

// Mock UserService
jest.mock('../../src/services/users/UserService', () => ({
  UserService: {
    getUsers: jest.fn(),
    getDepartments: jest.fn(),
  },
}));

// Mock Supabase
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

describe('NewDirectChatModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  it('renders ZeroTaskHeader with includeSafeArea and close handler', async () => {
    (UserService.getUsers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'user-2', full_name: 'Alice Employee', role: 'Employee', company_id: 'comp-1', is_active: true, is_deleted: false },
      ],
      error: null,
    });
    (UserService.getDepartments as jest.Mock).mockResolvedValue({
      data: [{ id: 'dept-1', name: 'Engineering' }],
      error: null,
    });

    const onCloseMock = jest.fn();
    const onSelectUserMock = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <NewDirectChatModal
          visible={true}
          onClose={onCloseMock}
          onSelectUser={onSelectUserMock}
        />
      );
    });

    // Verify ZeroTaskHeader was rendered with safe-area props
    const headerInstances = renderer!.root.findAllByType(ZeroTaskHeader);
    expect(headerInstances.length).toBe(1);
    expect(headerInstances[0].props.includeSafeArea).toBe(true);
    expect(headerInstances[0].props.showClose).toBe(true);
    expect(headerInstances[0].props.showDrawer).toBe(false);

    // Verify "New Private Chat" subheader text exists
    const titleNodes = renderer!.root
      .findAllByType(Text)
      .filter((node) => node.props.children === 'New Private Chat');
    expect(titleNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('filters out current user and super admins for non-superadmin caller', async () => {
    (UserService.getUsers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'user-founder-1', full_name: 'Founder User', role: 'Founder', company_id: 'comp-1', is_active: true, is_deleted: false },
        { id: 'user-sa', full_name: 'Super Admin', role: 'Super Admin', is_active: true, is_deleted: false },
        { id: 'user-colleague', full_name: 'Colleague Bob', role: 'Employee', company_id: 'comp-1', is_active: true, is_deleted: false },
      ],
      error: null,
    });
    (UserService.getDepartments as jest.Mock).mockResolvedValue({ data: [], error: null });

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <NewDirectChatModal
          visible={true}
          onClose={jest.fn()}
          onSelectUser={jest.fn()}
        />
      );
    });

    // Check rendered users: should show Bob, not Founder User (self) or Super Admin
    const names = renderer!.root
      .findAllByType(Text)
      .filter((node) => node.props.children === 'Colleague Bob');
    expect(names.length).toBeGreaterThanOrEqual(1);

    const selfNames = renderer!.root
      .findAllByType(Text)
      .filter((node) => node.props.children === 'Founder User');
    expect(selfNames.length).toBe(0);

    const saNames = renderer!.root
      .findAllByType(Text)
      .filter((node) => node.props.children === 'Super Admin');
    expect(saNames.length).toBe(0);
  });

  it('hydrates colleagues from cache immediately on open', async () => {
    const cacheKey = `@zerotask_colleagues_${mockProfile.company_id}_${mockProfile.id}`;
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        users: [{ id: 'user-cached', full_name: 'Cached Colleague', role: 'Employee', company_id: 'comp-1' }],
        departments: {},
      })
    );

    let resolveUsers: any;
    (UserService.getUsers as jest.Mock).mockImplementation(() => new Promise((res) => { resolveUsers = res; }));
    (UserService.getDepartments as jest.Mock).mockResolvedValue({ data: [], error: null });

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <NewDirectChatModal
          visible={true}
          onClose={jest.fn()}
          onSelectUser={jest.fn()}
        />
      );
    });

    // Cached colleague should be visible
    const cachedNames = renderer!.root
      .findAllByType(Text)
      .filter((node) => node.props.children === 'Cached Colleague');
    expect(cachedNames.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolveUsers({ data: [], error: null });
    });
  });
});
