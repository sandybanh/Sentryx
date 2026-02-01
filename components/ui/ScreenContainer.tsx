import React from 'react';
import { View, StyleSheet, ScrollView, ViewStyle, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  avoidKeyboard?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  backgroundColor?: string;
}

export function ScreenContainer({
  children,
  scroll = false,
  padded = true,
  avoidKeyboard = false,
  style,
  contentStyle,
  backgroundColor = Colors.background.primary,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  const containerStyle = [
    styles.container,
    { backgroundColor },
    style,
  ];

  const innerStyle = [
    styles.content,
    padded && styles.padded,
    { paddingBottom: insets.bottom + Spacing.lg },
    contentStyle,
  ];

  const content = scroll ? (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[innerStyle, styles.scrollContent]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={innerStyle}>{children}</View>
  );

  if (avoidKeyboard) {
    return (
      <KeyboardAvoidingView
        style={containerStyle}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return <View style={containerStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: Spacing.xl,
  },
});
