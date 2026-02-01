import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Logo, ScreenContainer } from '@/components/ui';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.topSection, { paddingTop: insets.top + Spacing['4xl'] }]}>
        <Logo size="lg" />

        <View style={styles.features}>
          <FeatureItem
            icon="videocam"
            title="Live Camera Feed"
            description="Watch your car in real-time from anywhere"
          />
          <FeatureItem
            icon="notifications"
            title="Instant Alerts"
            description="Get notified when something happens"
          />
          <FeatureItem
            icon="shield-checkmark"
            title="Peace of Mind"
            description="Your car, always in sight"
          />
        </View>
      </View>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Button
          title="Get Started"
          onPress={() => router.push('/(auth)/signup')}
          size="lg"
          fullWidth
        />
        <Button
          title="I already have an account"
          onPress={() => router.push('/(auth)/login')}
          variant="ghost"
          size="lg"
          fullWidth
        />
      </View>
    </View>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  const Ionicons = require('@expo/vector-icons').Ionicons;

  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={24} color={Colors.primary[500]} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  topSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  features: {
    marginTop: Spacing['4xl'],
    gap: Spacing.xl,
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.background.secondary,
    padding: Spacing.lg,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    marginBottom: 2,
  },
  featureDescription: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
  bottomSection: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
});
