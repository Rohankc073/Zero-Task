import { useWindowDimensions, Platform, Dimensions, ViewStyle } from 'react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';

// Base guideline dimensions (standard mobile viewport)
const GUIDELINE_BASE_WIDTH = 375;
const GUIDELINE_BASE_HEIGHT = 812;

/**
 * Standalone percentage width calculator
 */
export function wp(percentage: number): number {
  const { width } = Dimensions.get('window');
  return Math.round((percentage * width) / 100);
}

/**
 * Standalone percentage height calculator
 */
export function hp(percentage: number): number {
  const { height } = Dimensions.get('window');
  return Math.round((percentage * height) / 100);
}

/**
 * Moderate scale utility for subtle, proportional sizing
 */
export function moderateScale(size: number, factor = 0.5): number {
  const { width } = Dimensions.get('window');
  const scale = width / GUIDELINE_BASE_WIDTH;
  return Math.round(size + (scale - 1) * size * factor);
}

export interface ResponsiveInfo {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
  isSmallDevice: boolean;    // < 360px (e.g. iPhone SE 1st gen, compact 5")
  isStandardDevice: boolean; // 360px - 399px (e.g. standard 5.5-6" phones)
  isLargeDevice: boolean;    // 400px - 599px (e.g. Pro Max, 6.7"+ phones)
  isTablet: boolean;         // >= 600px (e.g. 7-8"+ tablets, foldables)
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
  containerStyle: ViewStyle;
  modalContainerStyle: ViewStyle;
  sheetContainerStyle: ViewStyle;
  responsivePadding: (base?: number, smallDeviceFactor?: number) => number;
  responsiveFontSize: (base: number, minSize?: number) => number;
  wp: (percentage: number) => number;
  hp: (percentage: number) => number;
  scaleSize: (size: number) => number;
  moderateScale: (size: number, factor?: number) => number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isSmallDevice = width < 360;
  const isStandardDevice = width >= 360 && width < 400;
  const isLargeDevice = width >= 400 && width < 600;
  const isTablet = width >= 600;
  const isLandscape = width > height;

  const contentMaxWidth = isTablet ? 840 : '100%';

  // Safe bounds handling physical bottom chin, navigation buttons or gesture bar
  const safeBottom = Platform.OS === 'android' 
    ? Math.max(insets.bottom, 10) 
    : Math.max(insets.bottom, 8);

  // Safe bounds handling camera cutouts, notches, status bars
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

  const containerStyle: ViewStyle = isTablet
    ? { maxWidth: 840, width: '100%', alignSelf: 'center' }
    : { width: '100%' };

  const modalContainerStyle: ViewStyle = isTablet
    ? { maxWidth: 560, width: '100%', alignSelf: 'center' }
    : { width: '100%' };

  const sheetContainerStyle: ViewStyle = isTablet
    ? { maxWidth: 680, width: '100%', alignSelf: 'center' }
    : { width: '100%' };

  const responsivePadding = (base = 16, smallDeviceFactor = 0.75): number => {
    if (isSmallDevice) return Math.round(base * smallDeviceFactor);
    if (isTablet) return Math.round(base * 1.25);
    return base;
  };

  const responsiveFontSize = (base: number, minSize = base * 0.85): number => {
    if (isSmallDevice) return Math.max(minSize, Math.round(base * 0.92));
    if (isTablet) return Math.round(base * 1.08);
    return base;
  };

  const calcWp = (percentage: number): number => Math.round((percentage * width) / 100);
  const calcHp = (percentage: number): number => Math.round((percentage * height) / 100);
  const calcScaleSize = (size: number): number => Math.round((width / GUIDELINE_BASE_WIDTH) * size);
  const calcModerateScale = (size: number, factor = 0.5): number => {
    const scaleFactor = width / GUIDELINE_BASE_WIDTH;
    return Math.round(size + (scaleFactor - 1) * size * factor);
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
    containerStyle,
    modalContainerStyle,
    sheetContainerStyle,
    responsivePadding,
    responsiveFontSize,
    wp: calcWp,
    hp: calcHp,
    scaleSize: calcScaleSize,
    moderateScale: calcModerateScale,
  };
}
