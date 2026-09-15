import { useWindowDimensions, Platform, ScaledSize } from 'react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';

export interface ResponsiveInfo {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
  isSmallDevice: boolean;    // < 360px
  isStandardDevice: boolean; // 360px - 399px
  isLargeDevice: boolean;    // 400px - 599px
  isTablet: boolean;         // >= 600px
  isLandscape: boolean;
  contentMaxWidth: number | '100%';
  insets: EdgeInsets;
  safeBottom: number;
  safeTop: number;
  tabletContainerStyle: {
    maxWidth: number;
    width: '100%';
    alignSelf: 'center';
  };
}

export function useResponsive(): ResponsiveInfo {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isSmallDevice = width < 360;
  const isStandardDevice = width >= 360 && width < 400;
  const isLargeDevice = width >= 400 && width < 600;
  const isTablet = width >= 600;
  const isLandscape = width > height;

  const contentMaxWidth = isTablet ? 768 : '100%';

  const safeBottom = Platform.OS === 'android' ? Math.max(insets.bottom, 10) : Math.max(insets.bottom, 8);
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? 12 : 16);

  const tabletContainerStyle: {
    maxWidth: number;
    width: '100%';
    alignSelf: 'center';
  } = {
    maxWidth: 768,
    width: '100%',
    alignSelf: 'center',
  };

  return {
    width,
    height,
    scale,
    fontScale,
    isSmallDevice,
    isStandardDevice,
    isLargeDevice,
    isTablet,
    isLandscape,
    contentMaxWidth,
    insets,
    safeBottom,
    safeTop,
    tabletContainerStyle,
  };
}
