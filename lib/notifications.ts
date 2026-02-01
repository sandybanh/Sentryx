import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { savePushToken } from './supabase';

/**
 * Push Notification Configuration
 *
 * Handles:
 * - Permission requests
 * - Token registration
 * - Notification display settings
 * - Tap handling
 */

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Get the Expo push token
export async function registerForPushNotifications(): Promise<string | null> {
  let token: string | null = null;

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check current permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  // Get the Expo push token (requires EAS project ID)
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || projectId === 'your-eas-project-id') {
      console.log('Push notifications: EAS project ID not configured');
      return null;
    }
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = tokenResponse.data;

    // Save token to Supabase for the authenticated user
    await savePushToken(token);

    console.log('Push token registered:', token);
  } catch (error) {
    console.error('Error getting push token:', error);
  }

  // Android-specific channel setup
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B52',
    });

    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#EF4444',
      sound: 'default',
    });
  }

  return token;
}

// Schedule a local notification (for testing)
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  seconds: number = 1
): Promise<string> {
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });

  return identifier;
}

// Cancel a scheduled notification
export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

// Cancel all notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Get the last notification response (for handling taps when app was closed)
export async function getLastNotificationResponse() {
  return await Notifications.getLastNotificationResponseAsync();
}

// Add listeners for notification events
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Send a test notification (mock - in production this would be server-side)
export async function sendTestNotification(): Promise<void> {
  await scheduleLocalNotification(
    'Camera Alert',
    'Motion detected on your camera feed!',
    { screen: 'camera', type: 'motion_alert' },
    2
  );
}

const motionNotificationCache = new Set<string>();

export async function notifyMotionEvent(eventId: string, deviceId: string) {
  if (motionNotificationCache.has(eventId)) {
    return;
  }
  motionNotificationCache.add(eventId);

  await scheduleLocalNotification(
    'Motion detected',
    `Motion detected on ${deviceId}`,
    { screen: 'camera', type: 'motion_alert', device_id: deviceId },
    1
  );
}
