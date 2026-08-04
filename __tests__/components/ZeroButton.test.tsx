import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ZeroButton } from '../../src/components/ZeroButton';

describe('ZeroButton', () => {
  it('renders correctly with default primary variant', async () => {
    const { getByText, getByTestId } = await render(<ZeroButton title="Click Me" onPress={() => {}} testID="zero-btn" />);
    
    expect(getByText('Click Me')).toBeTruthy();
    
    // Check primary background color
    const button = getByTestId('zero-btn');
    expect(button.props.className).toContain('bg-[#0f141a]');
  });

  it('renders correctly with secondary variant', async () => {
    const { getByTestId } = await render(
      <ZeroButton title="Secondary" variant="secondary" onPress={() => {}} testID="zero-btn" />
    );
    
    const button = getByTestId('zero-btn');
    expect(button.props.className).toContain('bg-[#e1c37a]');
  });

  it('renders correctly with outline variant', async () => {
    const { getByTestId } = await render(
      <ZeroButton title="Outline" variant="outline" onPress={() => {}} testID="zero-btn" />
    );
    
    const button = getByTestId('zero-btn');
    expect(button.props.className).toContain('border-[#0f141a]');
  });

  it('handles onPress event', async () => {
    const onPressMock = jest.fn();
    const { getByText } = await render(<ZeroButton title="Press Me" onPress={onPressMock} />);
    
    fireEvent.press(getByText('Press Me'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
