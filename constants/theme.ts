export const Colors = {
  // Primary palette - yellow pop
  primary: {
    50: '#FFFDF1',
    100: '#FFF9D6',
    200: '#FFF0A3',
    300: '#FFE56E',
    400: '#FFDB4B',
    500: '#FFF9A5', // Main primary
    600: '#EBD86B',
    700: '#C3AD4A',
    800: '#9B8734',
    900: '#6F5F23',
  },

  // Secondary palette - muted teal/green
  secondary: {
    50: '#E9EEF0',
    100: '#D0D9DE',
    200: '#B7C4CA',
    300: '#9FADB6',
    400: '#879FA6',
    500: '#7D98A1', // Main secondary
    600: '#6B838B',
    700: '#576D74',
    800: '#44575C',
    900: '#2F3D41',
  },

  // Accent - cool gray lift
  accent: {
    50: '#F5F7F9',
    100: '#EEF1EF',
    200: '#D6DEE6',
    300: '#BECAD4',
    400: '#A9B4C2',
    500: '#9AA6B4',
    600: '#7F8A97',
    700: '#67707B',
    800: '#505760',
    900: '#3A4047',
  },

  // Neutral palette - cool grays
  neutral: {
    0: '#EEF1EF',
    50: '#E6EBEA',
    100: '#D8DEE1',
    200: '#C8D0D6',
    300: '#B6C0C8',
    400: '#A9B4C2',
    500: '#8E99A6',
    600: '#76808C',
    700: '#616A75',
    800: '#4E5560',
    900: '#5E6572',
  },

  // Semantic colors
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Background colors
  background: {
    primary: '#5E6572',
    secondary: '#7D98A1',
    tertiary: '#A9B4C2',
  },
};

export const Typography = {
  // Font families - using system fonts for reliability
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },

  // Font sizes with line heights
  sizes: {
    xs: { fontSize: 12, lineHeight: 16 },
    sm: { fontSize: 14, lineHeight: 20 },
    base: { fontSize: 16, lineHeight: 24 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 28 },
    '2xl': { fontSize: 24, lineHeight: 32 },
    '3xl': { fontSize: 30, lineHeight: 36 },
    '4xl': { fontSize: 36, lineHeight: 40 },
  },

  // Font weights
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
};

export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Dark mode colors
export const DarkColors = {
  ...Colors,
  background: {
    primary: '#5E6572',
    secondary: '#4E5662',
    tertiary: '#3F4650',
  },
  neutral: {
    ...Colors.neutral,
    0: '#3C434D',
    50: '#4A525D',
    100: '#5E6572',
    200: '#6E7684',
    300: '#808A98',
    400: '#A9B4C2',
    500: '#C1C9D3',
    600: '#D4DAE1',
    700: '#E2E6EA',
    800: '#EEF1EF',
    900: '#F5F7F9',
  },
};
