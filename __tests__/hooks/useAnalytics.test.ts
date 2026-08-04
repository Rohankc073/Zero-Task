import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useEmployeeMetrics } from '../../src/hooks/useAnalytics';
import { supabase } from '../../src/lib/supabase';

describe('useEmployeeMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with loading state', async () => {
    const { result } = await renderHook(() => useEmployeeMetrics());
    expect(result.current.loading).toBe(true);
    expect(result.current.metrics).toBeNull();
    expect(result.current.tasksForToday).toEqual([]);
  });

  it('fetches metrics and tasks successfully', async () => {
    const mockMetrics = { total_open_tasks: 5, tasks_due_this_week: 2, completion_percentage: 50 };
    const mockTasks = [{ id: '1', title: 'Task 1' }];

    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockMetrics, error: null });
    
    // The hook chains .select().eq().neq().order().limit(), we need to mock this chain
    const mockLimit = jest.fn().mockResolvedValue({ data: mockTasks, error: null });
    const mockOrder = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockNeq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockEq = jest.fn().mockReturnValue({ neq: mockNeq });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const { result } = await renderHook(() => useEmployeeMetrics());

    act(() => {
      result.current.fetchMetrics();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.metrics).toEqual(mockMetrics);
    expect(result.current.tasksForToday).toEqual(mockTasks);
    expect(supabase.rpc).toHaveBeenCalledWith('get_employee_dashboard_metrics', { user_uuid: 'test-user-id' });
  });

  it('handles errors gracefully', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: new Error('Network error') });
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = await renderHook(() => useEmployeeMetrics());

    act(() => {
      result.current.fetchMetrics();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.metrics).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching employee metrics:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });
});
