import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TaskCard } from '../../src/components/tasks/TaskCard';

describe('TaskCard', () => {
  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: 'To Do' as any,
    priority: 'High' as any,
    user_id: '123',
    due_date: '2026-08-01T00:00:00Z',
  };

  it('renders task details correctly', async () => {
    const { getByText } = await render(<TaskCard task={mockTask} onPress={() => {}} />);
    
    expect(getByText('Test Task')).toBeTruthy();
    expect(getByText('To Do')).toBeTruthy();
  });

  it('handles onPress event', async () => {
    const onPressMock = jest.fn();
    const { getByText } = await render(<TaskCard task={mockTask} onPress={onPressMock} />);
    
    fireEvent.press(getByText('Test Task'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
