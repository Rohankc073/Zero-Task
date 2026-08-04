import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ZeroInput } from '../../src/components/ZeroInput';

describe('ZeroInput', () => {
  it('renders correctly with placeholder', async () => {
    const { getByPlaceholderText } = await render(<ZeroInput placeholder="Enter email" />);
    expect(getByPlaceholderText('Enter email')).toBeTruthy();
  });

  it('handles onChangeText event', async () => {
    const onChangeTextMock = jest.fn();
    const { getByPlaceholderText } = await render(
      <ZeroInput placeholder="Type here" onChangeText={onChangeTextMock} />
    );
    
    const input = getByPlaceholderText('Type here');
    fireEvent.changeText(input, 'hello');
    expect(onChangeTextMock).toHaveBeenCalledWith('hello');
  });

  it('renders securely when secureTextEntry is true', async () => {
    const { getByPlaceholderText } = await render(
      <ZeroInput placeholder="Password" secureTextEntry={true} />
    );
    const input = getByPlaceholderText('Password');
    expect(input.props.secureTextEntry).toBe(true);
  });
});
