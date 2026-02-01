import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Card, StatusBadge, Logo } from '@/components/ui';
import { useAuthStore } from '@/store/auth';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { fetchRecentEvents, subscribeToEvents, SensorEvent } from '@/lib/alerts';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const deviceId = process.env.EXPO_PUBLIC_DEVICE_ID;
  const [events, setEvents] = useState<SensorEvent[]>([]);
  const [debugInfo, setDebugInfo] = useState({
    lastFetchError: '',
    lastFetchAt: '',
    subscriptionStatus: '',
  });

  useEffect(() => {
    fetchRecentEvents(5, deviceId).then(({ data, error }) => {
      setEvents(data);
      setDebugInfo((prev) => ({
        ...prev,
        lastFetchError: error ?? '',
        lastFetchAt: new Date().toLocaleTimeString(),
      }));
    });
  }, [deviceId]);

  useEffect(() => {
    const unsubscribe = subscribeToEvents(
      (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 5));
      },
      deviceId,
      (status) => {
        setDebugInfo((prev) => ({ ...prev, subscriptionStatus: status }));
      }
    );
    return unsubscribe;
  }, [deviceId]);

  const latestAlerts = useMemo(() => {
    const motionEvents = events.filter((event) => event.motion);

    if (!motionEvents.length) {
      return [
        {
          id: 'empty',
          title: 'No motion alerts yet',
          time: '',
          detail: 'Waiting for motion detection',
        },
      ];
    }

    return motionEvents.map((event) => {
      const created = new Date(event.ts);
      const time = created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const title = 'Motion detected';
      const detail = event.device_id || 'Camera';
      return { id: event.id, title, time, detail };
    });
  }, [events]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey there!</Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email ?? 'Welcome back'}
          </Text>
        </View>
        <Logo size="sm" showText={false} />
      </View>

      {/* Live Feed Preview */}
      <TouchableOpacity
        style={styles.feedPreview}
        onPress={() => router.push('/(main)/camera')}
        activeOpacity={0.9}
      >
        <View style={styles.feedPlaceholder}>
          <Ionicons name="videocam" size={48} color={Colors.neutral[200]} />
          <Text style={styles.feedPlaceholderText}>Tap to view live feed</Text>
        </View>
        <View style={styles.feedOverlay}>
          <StatusBadge label="Live" variant="success" pulse />
          <Text style={styles.feedTitle}>Front Camera</Text>
        </View>
      </TouchableOpacity>

      {/* Latest Alerts */}
      <Text style={styles.sectionTitle}>Latest alerts</Text>
      {__DEV__ && (
        <View style={styles.debugRow}>
          <Text style={styles.debugText}>
            auth: {user ? 'yes' : 'no'} • device: {deviceId ?? 'all'} • events: {events.length}
          </Text>
          <Text style={styles.debugText}>
            fetch: {debugInfo.lastFetchAt || '-'} • sub: {debugInfo.subscriptionStatus || '-'}
          </Text>
          {!!debugInfo.lastFetchError && (
            <Text style={styles.debugError}>error: {debugInfo.lastFetchError}</Text>
          )}
        </View>
      )}
      <View style={styles.alertsList}>
        {latestAlerts.map((alert) => (
          <Card key={alert.id} style={styles.alertCard} variant="filled">
            <View style={styles.alertIcon}>
              <Ionicons name="alert-circle" size={20} color={Colors.primary[500]} />
            </View>
            <View style={styles.alertText}>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertDetail}>{alert.detail}</Text>
            </View>
            {!!alert.time && <Text style={styles.alertTime}>{alert.time}</Text>}
          </Card>
        ))}
      </View>

      <TouchableOpacity
        style={styles.addCameraButton}
        onPress={() => router.push('/(main)/settings')}
        activeOpacity={0.9}
      >
        <View style={styles.addCameraIcon}>
          <Ionicons name="add" size={22} color={Colors.background.primary} />
        </View>
        <Text style={styles.addCameraText}>Configure new camera</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  greeting: {
    ...Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  email: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: Spacing.xs,
    maxWidth: 200,
  },
  feedPreview: {
    height: 200,
    borderRadius: 20,
    backgroundColor: Colors.background.secondary,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    ...Shadows.lg,
  },
  feedPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  feedPlaceholderText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
  feedOverlay: {
    position: 'absolute',
    top: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedTitle: {
    ...Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.neutral[0],
  },
  sectionTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    marginBottom: Spacing.lg,
  },
  alertsList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  debugRow: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.background.secondary,
  },
  debugText: {
    ...Typography.sizes.xs,
    color: Colors.neutral[100],
  },
  debugError: {
    ...Typography.sizes.xs,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  alertDetail: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  alertTime: {
    ...Typography.sizes.xs,
    color: Colors.neutral[100],
  },
  addCameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.neutral[0],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 16,
    ...Shadows.md,
  },
  addCameraIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCameraText: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.background.primary,
  },
});
