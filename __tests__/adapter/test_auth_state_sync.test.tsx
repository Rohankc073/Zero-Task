import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.unmock('../../src/context/AuthContext');

import { apiClient, SESSION_STORAGE_KEY, UserSession } from '../../src/services/api/apiClient';
import { httpClient } from '../../src/adapter/fastapi/httpClient';
import { AuthService } from '../../src/services/auth/AuthService';
import { AuthProvider, useAuth, AuthProps } from '../../src/context/AuthContext';

const mockUserA = {
  id: 'user-aaa-1111',
  email: 'userA@zerotask.com',
  name: 'User Alpha',
  full_name: 'User Alpha',
  role: 'Employee',
  company_id: 'comp-111',
  department_id: 'dept-111',
  designation_id: 'desig-111',
  is_approved: true,
  is_active: true,
};

const mockUserB = {
  id: 'user-bbb-2222',
  email: 'userB@zerotask.com',
  name: 'User Beta',
  full_name: 'User Beta',
  role: 'Founder',
  company_id: 'comp-222',
  department_id: null,
  designation_id: null,
  is_approved: true,
  is_active: true,
};

const mockSessionA: UserSession = {
  access_token: 'token-alpha-12345',
  refresh_token: 'refresh-alpha-67890',
  token_type: 'bearer',
  user: mockUserA,
};

const mockSessionB: UserSession = {
  access_token: 'token-beta-99999',
  refresh_token: 'refresh-beta-88888',
  token_type: 'bearer',
  user: mockUserB,
};

// Helper component to observe AuthContext in React 19
let currentAuth: AuthProps;
function AuthObserver() {
  const auth = useAuth();
  currentAuth = auth;
  return null;
}

const renderAuthApp = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <AuthProvider>
        <AuthObserver />
      </AuthProvider>
    );
  });
  return renderer!;
};

describe('ZeroTask Auth State Synchronization & Session Restoration Suite', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await apiClient.saveSession(null);
    await httpClient.saveSession(null);
  });

  afterEach(async () => {
    await apiClient.saveSession(null);
    await httpClient.saveSession(null);
    await AsyncStorage.clear();
  });

  it('TEST 1: Successful login immediately changes canonical auth state (API success -> isAuthenticated=true -> currentUser populated -> isLoading=false)', async () => {
    jest.spyOn(AuthService, 'login').mockResolvedValueOnce({
      data: mockSessionA,
      error: null,
    });

    const renderer = await renderAuthApp();
    expect(currentAuth.isLoading).toBe(false);
    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.user).toBeNull();

    // Perform login
    let loginRes: any;
    await act(async () => {
      loginRes = await currentAuth.signIn({
        email: 'userA@zerotask.com',
        password: 'Password123!',
      });
    });

    // Verify immediate state change without requiring app restart
    expect(loginRes.error).toBeNull();
    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.user?.email).toBe('userA@zerotask.com');
    expect(currentAuth.user?.id).toBe('user-aaa-1111');
    expect(currentAuth.session?.access_token).toBe('token-alpha-12345');
    expect(currentAuth.isLoading).toBe(false);

    renderer.unmount();
  });

  it('TEST 2: Successful login immediately populates profile so router guards can render protected app without restart', async () => {
    jest.spyOn(AuthService, 'login').mockResolvedValueOnce({
      data: mockSessionA,
      error: null,
    });

    const renderer = await renderAuthApp();

    await act(async () => {
      await currentAuth.signIn({
        email: 'userA@zerotask.com',
        password: 'Password123!',
      });
    });

    // Both session and profile are synchronously populated from login response
    expect(currentAuth.session).not.toBeNull();
    expect(currentAuth.profile).not.toBeNull();
    expect(currentAuth.profile?.role).toBe('Employee');
    expect(currentAuth.profile?.is_approved).toBe(true);
    expect(currentAuth.profile?.company_id).toBe('comp-111');

    renderer.unmount();
  });

  it('TEST 3: Fresh app launch with persisted valid session restores authenticated state identically', async () => {
    // Seed storage with persisted session
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(mockSessionA));

    const renderer = await renderAuthApp();

    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.user?.email).toBe('userA@zerotask.com');
    expect(currentAuth.profile?.id).toBe('user-aaa-1111');
    expect(apiClient.getAccessToken()).toBe('token-alpha-12345');
    expect(httpClient.getAccessToken()).toBe('token-alpha-12345');

    renderer.unmount();
  });

  it('TEST 4: Fresh app launch with no session remains unauthenticated and shows login', async () => {
    await AsyncStorage.clear();

    const renderer = await renderAuthApp();

    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.user).toBeNull();
    expect(currentAuth.profile).toBeNull();
    expect(currentAuth.session).toBeNull();
    expect(apiClient.getAccessToken()).toBeNull();
    expect(httpClient.getAccessToken()).toBeNull();

    renderer.unmount();
  });

  it('TEST 5: Invalid credentials remain unauthenticated and never update canonical state', async () => {
    jest.spyOn(AuthService, 'login').mockResolvedValueOnce({
      data: null,
      error: { message: 'Incorrect email or password', status: 401 },
    });

    const renderer = await renderAuthApp();

    let res: any;
    await act(async () => {
      res = await currentAuth.signIn({
        email: 'invalid@zerotask.com',
        password: 'WrongPassword',
      });
    });

    expect(res.error).toBeDefined();
    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.user).toBeNull();
    expect(currentAuth.session).toBeNull();
    expect(apiClient.getAccessToken()).toBeNull();
    expect(await AsyncStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    renderer.unmount();
  });

  it('TEST 6: Logout immediately clears in-memory tokens, storage, and returns to unauthenticated state', async () => {
    jest.spyOn(AuthService, 'login').mockResolvedValueOnce({
      data: mockSessionA,
      error: null,
    });
    jest.spyOn(AuthService, 'logout').mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const renderer = await renderAuthApp();

    await act(async () => {
      await currentAuth.signIn({
        email: 'userA@zerotask.com',
        password: 'Password123!',
      });
    });
    expect(currentAuth.isAuthenticated).toBe(true);

    // Logout
    await act(async () => {
      await currentAuth.signOut();
    });

    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.user).toBeNull();
    expect(currentAuth.profile).toBeNull();
    expect(currentAuth.session).toBeNull();
    expect(apiClient.getAccessToken()).toBeNull();
    expect(httpClient.getAccessToken()).toBeNull();
    expect(await AsyncStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    renderer.unmount();
  });

  it('TEST 7: User switching (User A -> Logout -> User B) never leaks User A state', async () => {
    const renderer = await renderAuthApp();

    // 1. User A logs in
    jest.spyOn(AuthService, 'login').mockResolvedValueOnce({
      data: mockSessionA,
      error: null,
    });
    await act(async () => {
      await currentAuth.signIn({ email: 'userA@zerotask.com', password: 'passwordA' });
    });
    expect(currentAuth.user?.email).toBe('userA@zerotask.com');
    expect(apiClient.getAccessToken()).toBe('token-alpha-12345');

    // 2. User A logs out
    jest.spyOn(AuthService, 'logout').mockResolvedValueOnce({ data: null, error: null });
    await act(async () => {
      await currentAuth.signOut();
    });
    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.user).toBeNull();

    // 3. User B logs in
    jest.spyOn(AuthService, 'login').mockResolvedValueOnce({
      data: mockSessionB,
      error: null,
    });
    await act(async () => {
      await currentAuth.signIn({ email: 'userB@zerotask.com', password: 'passwordB' });
    });
    expect(currentAuth.user?.email).toBe('userB@zerotask.com');
    expect(currentAuth.user?.id).toBe('user-bbb-2222');
    expect(currentAuth.user?.role).toBe('Founder');
    expect(apiClient.getAccessToken()).toBe('token-beta-99999');
    expect(httpClient.getAccessToken()).toBe('token-beta-99999');

    renderer.unmount();
  });

  it('TEST 8: Rapid double login does not cause duplicate auth transitions or corrupt state', async () => {
    jest.spyOn(AuthService, 'login').mockImplementation(async () => {
      return { data: mockSessionA, error: null };
    });

    const renderer = await renderAuthApp();

    // Fire two concurrent login actions
    await act(async () => {
      await Promise.all([
        currentAuth.signIn({ email: 'userA@zerotask.com', password: 'pass' }),
        currentAuth.signIn({ email: 'userA@zerotask.com', password: 'pass' }),
      ]);
    });

    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.user?.id).toBe('user-aaa-1111');
    expect(apiClient.getAccessToken()).toBe('token-alpha-12345');
    expect(httpClient.getAccessToken()).toBe('token-alpha-12345');

    renderer.unmount();
  });

  it('TEST 9: API client uses newly stored token immediately after login without reload', async () => {
    await apiClient.saveSession(mockSessionA);

    // Verify in-memory client immediately sees the token
    expect(apiClient.getAccessToken()).toBe('token-alpha-12345');

    // Test request method headers
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementationOnce(async (url, init: any) => {
      expect(init.headers['Authorization']).toBe('Bearer token-alpha-12345');
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as any;
    });

    const res = await apiClient.get('/test-endpoint');
    expect(res.data).toEqual({ status: 'ok' });
    fetchMock.mockRestore();
  });

  it('TEST 10: No Supabase authentication path is required; 100% self-hosted adapter', async () => {
    const { createFastApiClient } = require('../../src/adapter/fastapi/fastApiClient');
    const realClient = createFastApiClient();

    expect(typeof realClient.auth.signInWithPassword).toBe('function');
    expect(typeof realClient.auth.signOut).toBe('function');
    expect(typeof realClient.auth.getSession).toBe('function');

    await httpClient.saveSession(mockSessionA as any);
    const { data } = await realClient.auth.getSession();
    expect(data.session?.user.email).toBe('userA@zerotask.com');
    expect(data.session?.access_token).toBe('token-alpha-12345');
  });
});
