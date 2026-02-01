import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const iconSizes = {
    sm: 56,
    md: 80,
    lg: 120,
  };

  const wordmarkSizes = {
    sm: { width: 140, height: 48 },
    md: { width: 200, height: 68 },
    lg: { width: 280, height: 96 },
  };

  return (
    <View style={styles.container}>
      {showText ? (
        <Image
          source={require('../../assets/images/3.png')}
          style={wordmarkSizes[size]}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.iconMask, { width: iconSizes[size], height: iconSizes[size], borderRadius: iconSizes[size] / 2 }]}>
          <Image
            source={require('../../assets/images/Sentryx.png')}
            style={styles.iconImage}
            resizeMode="cover"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconMask: {
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
});
