import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Card, Button } from '@/components/ui';
import { useAuthStore } from '@/store/auth';
import { sendTestNotification, registerForPushNotifications } from '@/lib/notifications';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, isLoading } = useAuthStore();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [motionAlerts, setMotionAlerts] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/welcome');
          },
        },
      ]
    );
  };

  const handleTestNotification = async () => {
    await sendTestNotification();
    Alert.alert('Notification Sent', 'A test notification will appear shortly.');
  };

  const handleReregisterPush = async () => {
    const token = await registerForPushNotifications();
    if (token) {
      Alert.alert('Success', 'Push notifications re-registered successfully.');
    } else {
      Alert.alert('Error', 'Could not register for push notifications. Make sure you are on a physical device.');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <Card style={styles.profileCard}>
        <View style={styles.profileInfo}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={Colors.primary[500]} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email ?? 'user@example.com'}
            </Text>
            <Text style={styles.profileId}>
              ID: {user?.id?.slice(0, 8) ?? '••••••••'}
            </Text>
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Safety</Text>
      <Card style={styles.settingsGroup}>
        <SettingRow
          icon="people-outline"
          label="Emergency Contacts"
          description="Choose at least 3 contacts"
          onPress={() => router.push('/(main)/emergency-contacts')}
          showArrow
        />
      </Card>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <Card style={styles.settingsGroup}>
        <SettingRow
          icon="notifications-outline"
          label="Push Notifications"
          description="Receive alerts on your device"
          rightElement={
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: Colors.neutral[200], true: Colors.primary[300] }}
              thumbColor={pushEnabled ? Colors.primary[500] : Colors.neutral[400]}
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          icon="walk-outline"
          label="Motion Alerts"
          description="Alert when motion is detected"
          rightElement={
            <Switch
              value={motionAlerts}
              onValueChange={setMotionAlerts}
              trackColor={{ false: Colors.neutral[200], true: Colors.primary[300] }}
              thumbColor={motionAlerts ? Colors.primary[500] : Colors.neutral[400]}
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          icon="volume-high-outline"
          label="Sound Alerts"
          description="Alert when loud sounds are detected"
          rightElement={
            <Switch
              value={soundAlerts}
              onValueChange={setSoundAlerts}
              trackColor={{ false: Colors.neutral[200], true: Colors.primary[300] }}
              thumbColor={soundAlerts ? Colors.primary[500] : Colors.neutral[400]}
            />
          }
        />
      </Card>

      {/*
      <Text style={styles.sectionTitle}>Camera</Text>
      <Card style={styles.settingsGroup}>
        <SettingRow
          icon="videocam-outline"
          label="Stream Quality"
          description="HD 720p"
          onPress={() => Alert.alert('Quality', 'Quality settings coming soon')}
          showArrow
        />
        <View style={styles.divider} />
        <SettingRow
          icon="server-outline"
          label="Stream URL"
          description="Configure video source"
          onPress={() => Alert.alert('Stream URL', 'Set EXPO_PUBLIC_VIDEO_STREAM_URL in your environment')}
          showArrow
        />
      </Card>
      */}

      {/*
      <Text style={styles.sectionTitle}>Developer</Text>
      <Card style={styles.settingsGroup}>
        <SettingRow
          icon="bug-outline"
          label="Test Notification"
          description="Send a test push notification"
          onPress={handleTestNotification}
          showArrow
        />
        <View style={styles.divider} />
        <SettingRow
          icon="refresh-outline"
          label="Re-register Push Token"
          description="Update push notification token"
          onPress={handleReregisterPush}
          showArrow
        />
      </Card>
      */}

      <Text style={styles.sectionTitle}>About</Text>
      <Card style={styles.settingsGroup}>
        <SettingRow
          icon="information-circle-outline"
          label="Version"
          description="1.0.0"
        />
        <View style={styles.divider} />
        <SettingRow
          icon="document-text-outline"
          label="Privacy Policy"
          onPress={() => {}}
          showArrow
        />
        <View style={styles.divider} />
        <SettingRow
          icon="help-circle-outline"
          label="Help & Support"
          onPress={() => {}}
          showArrow
        />
      </Card>

      <View style={styles.signOutContainer}>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="primary"
          fullWidth
          loading={isLoading}
          textStyle={{ color: Colors.primary[500] }}
          style={{ backgroundColor: Colors.background.secondary }}
        />
      </View>

      <View style={{ height: insets.bottom + Spacing['3xl'] }} />
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  description,
  onPress,
  rightElement,
  showArrow = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showArrow?: boolean;
}) {
  const content = (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={22} color={Colors.neutral[600]} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      {rightElement}
      {showArrow && (
        <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },
  header: {
    paddingVertical: Spacing.xl,
  },
  title: {
    ...Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  sectionTitle: {
    ...Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[100],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    marginLeft: Spacing.xs,
  },
  profileCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.background.secondary,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
  },
  profileEmail: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  profileId: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  settingsGroup: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.medium,
    color: Colors.neutral[0],
  },
  settingDescription: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.background.tertiary,
    marginLeft: Spacing.lg + 36 + Spacing.md,
  },
  signOutContainer: {
    marginTop: Spacing['3xl'],
  },
});
