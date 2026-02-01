import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  pulse?: boolean;
}

export function StatusBadge({ label, variant = 'neutral', pulse = false }: StatusBadgeProps) {
  const variantColors = {
    success: { bg: Colors.accent[100], text: Colors.accent[700], dot: Colors.accent[500] },
    warning: { bg: '#FEF3C7', text: '#B45309', dot: Colors.warning },
    error: { bg: '#FEE2E2', text: '#B91C1C', dot: Colors.error },
    info: { bg: '#DBEAFE', text: '#1D4ED8', dot: Colors.info },
    neutral: { bg: Colors.neutral[100], text: Colors.neutral[600], dot: Colors.neutral[400] },
  };

  const colors = variantColors[variant];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.dot, { backgroundColor: colors.dot }]}>
        {pulse && <View style={[styles.pulse, { backgroundColor: colors.dot }]} />}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pulse: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.4,
  },
  label: {
    ...Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
});
