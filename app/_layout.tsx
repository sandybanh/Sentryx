import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import {
    addNotificationReceivedListener,
    addNotificationResponseListener,
    getLastNotificationResponse,
} from '@/lib/notifications';
import { useAuthStore } from '@/store/auth';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const splashFrames = [
  require('../assets/images/Sentryx.png'),
  require('../assets/images/3.png'),
  require('../assets/images/4.png'),
];

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // User is not authenticated and not on auth screen
      router.replace('/(auth)/welcome');
    } else if (user && inAuthGroup) {
      // User is authenticated but on auth screen
      router.replace('/(main)/camera');
    }
  }, [user, isInitialized, segments]);
}

function useNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    // Handle notification when app is foregrounded
    const receivedSubscription = addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content);
    });

    // Handle notification tap
    const responseSubscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped:', data);

      // Navigate based on notification data
      if (data?.screen === 'camera') {
        router.push('/(main)/camera');
      }
    });

    // Check for notification that opened the app
    getLastNotificationResponse().then((response) => {
      if (response) {
        const data = response.notification.request.content.data;
        if (data?.screen === 'camera') {
          router.push('/(main)/camera');
        }
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);
}

export default function RootLayout() {
  const { initialize, isInitialized } = useAuthStore();
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    initialize().then(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  useEffect(() => {
    if (!isInitialized || !showAnimatedSplash) return;

    const frameInterval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % splashFrames.length);
    }, 450);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(splashScale, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(900),
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setShowAnimatedSplash(false);
      }
    });

    const hideTimer = setTimeout(() => {
      setShowAnimatedSplash(false);
    }, 2000);

    return () => {
      clearInterval(frameInterval);
      clearTimeout(hideTimer);
    };
  }, [isInitialized, showAnimatedSplash, splashOpacity, splashScale]);

  useProtectedRoute();
  useNotificationHandler();

  if (!isInitialized) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
      {showAnimatedSplash && (
        <Animated.View
          pointerEvents="auto"
          style={[
            styles.splashOverlay,
            { opacity: splashOpacity },
          ]}
        >
          <Animated.Image
            source={splashFrames[frameIndex]}
            resizeMode="contain"
            style={[
              styles.splashImage,
              { transform: [{ scale: splashScale }] },
            ]}
          />
        </Animated.View>
      )}
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#7D98A1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    width: '78%',
    height: '32%',
    maxWidth: 360,
    maxHeight: 240,
  },
});
