import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, StatusBadge } from '@/components/ui';
import { Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { fetchRecentEvents, SensorEvent, subscribeToEvents } from '@/lib/alerts';
import { notifyMotionEvent } from '@/lib/notifications';
import { useAuthStore } from '@/store/auth';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const deviceId = process.env.EXPO_PUBLIC_DEVICE_ID;
  const [events, setEvents] = useState<SensorEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    lastFetchError: '',
    lastFetchAt: '',
    subscriptionStatus: '',
  });

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    setIsRefreshing(true);
    const { data, error } = await fetchRecentEvents(5, deviceId);
    setEvents(data);
    setDebugInfo((prev) => ({
      ...prev,
      lastFetchError: error ?? '',
      lastFetchAt: new Date().toLocaleTimeString(),
    }));
    setIsRefreshing(false);
  }, [deviceId]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  useEffect(() => {
    const unsubscribe = subscribeToEvents(
      (event) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEvents((prev) => [event, ...prev].slice(0, 5));
        notifyMotionEvent(event.id, event.device_id || 'camera');
      },
      deviceId,
      (status) => {
        setDebugInfo((prev) => ({ ...prev, subscriptionStatus: status }));
      }
    );
    return unsubscribe;
  }, [deviceId]);

  useEffect(() => {
    const poll = setInterval(() => {
      fetchRecentEvents(5, deviceId).then(({ data, error }) => {
        setEvents(data);
        setDebugInfo((prev) => ({
          ...prev,
          lastFetchError: error ?? '',
          lastFetchAt: new Date().toLocaleTimeString(),
        }));
      });
    }, 3000);

    return () => clearInterval(poll);
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
      <View style={styles.header}>
        <View style={styles.logoCrop}>
          <Image
            source={require('../../assets/images/Sentryx (1).png')}
            style={styles.headerLogo}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.email} numberOfLines={1}>
          {user?.email ?? 'Welcome back'}
        </Text>
        <TouchableOpacity
          style={styles.userButton}
          onPress={() => router.push('/(main)/settings')}
          activeOpacity={0.8}
        >
          <Ionicons name="person-circle" size={32} color={Colors.neutral[0]} />
        </TouchableOpacity>
      </View>

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
          <Text style={styles.feedTitle}>Dash Cam</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Latest alerts</Text>
      {/*
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
      */}
      <ScrollView
        style={styles.alertsScroll}
        contentContainerStyle={styles.alertsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshEvents}
            tintColor={Colors.primary[500]}
          />
        }
      >
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
      </ScrollView>

      <View style={styles.addCameraSpacer} />
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
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  logoCrop: {
    width: 180,
    height: 56,
    overflow: 'hidden',
  },
  headerLogo: {
    width: 180,
    height: 180,
    transform: [{ translateX: -18 }, { translateY: -78 }],
  },
  email: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    maxWidth: 180,
    alignSelf: 'center',
  },
  userButton: {
    marginLeft: 'auto',
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
  alertsScroll: {
    maxHeight: 320,
    marginBottom: 0,
  },
  alertsList: {
    gap: Spacing.md,
    paddingBottom: Spacing.xs,
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
  addCameraSpacer: {
    height: Spacing.lg,
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
