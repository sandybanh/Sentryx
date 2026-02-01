import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ResizeMode, Video } from 'expo-av';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Button, Card, StatusBadge } from '@/components/ui';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { getEmergencyContacts, sendEmergencySms } from '@/lib/emergency';
import { fetchRecentEvents, subscribeToEvents, SensorEvent } from '@/lib/alerts';

// Webcam stream URL - supports:
// - HLS (.m3u8): http://raspberrypi.tail56d975.ts.net:8080/stream.m3u8
// - MediaMTX WebRTC: http://raspberrypi.tail56d975.ts.net:8889/cam/
const VIDEO_STREAM_URL =
  process.env.EXPO_PUBLIC_VIDEO_STREAM_URL ??
  process.env.EXPO_PUBLIC_WEBCAM_URL ??
  'http://raspberrypi.tail56d975.ts.net:8889/cam/';

const isHlsStream = (url: string) =>
  url.includes('.m3u8') || url.includes('stream.m3u8');

const isMediaMTXWebRTC = (url: string) =>
  url.includes('8889') && (url.includes('/cam') || url.includes('/cam/'));

const ensureTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

const isExpoGo = Constants.appOwnership === 'expo';

type StreamStatus = 'connecting' | 'connected' | 'error' | 'offline';
type WebRTCCameraComponent = React.ComponentType<{
  url: string;
  style?: object;
  onConnected?: () => void;
  onError?: (error: string) => void;
}>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [webrtcKey, setWebrtcKey] = useState(0);
  const [lastWebViewError, setLastWebViewError] = useState<string | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<
    { id: string; name: string; phone: string }[]
  >([]);
  const [isSendingHelp, setIsSendingHelp] = useState(false);

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

  const recentEvents = useMemo(() => {
    const motionEvents = events.filter((event) => event.motion);

    if (!motionEvents.length) {
      return [
        {
          id: 'empty',
          title: 'No motion events yet',
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

  const useHls = isHlsStream(VIDEO_STREAM_URL);
  const isMediaMtx = isMediaMTXWebRTC(VIDEO_STREAM_URL);
  const useWebRTC = isMediaMtx && !isExpoGo;
  const useWebView = !useHls && !useWebRTC;
  const webViewUrl = isMediaMtx ? ensureTrailingSlash(VIDEO_STREAM_URL) : VIDEO_STREAM_URL;
  const maxRetries = 5;
  const WebRTCCamera = useMemo<WebRTCCameraComponent | null>(() => {
    if (!useWebRTC) {
      return null;
    }
    // Avoid loading native WebRTC modules in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@/components/WebRTCCamera').WebRTCCamera as WebRTCCameraComponent;
  }, [useWebRTC]);

  // Auto-connect when screen comes into focus (e.g. app startup, tab switch)
  useFocusEffect(
    useCallback(() => {
      setStatus('connecting');
      if (useHls) {
        // HLS will load via Video component
      } else if (useWebView) {
        setWebViewKey((k) => k + 1);
      }
      getEmergencyContacts().then(setEmergencyContacts);
      // WebRTC connects on mount
      return () => {};
    }, [useHls, useWebView])
  );

  const handlePlaybackStatusUpdate = useCallback((playbackStatus: any) => {
    if (playbackStatus.isLoaded) {
      setStatus('connected');
      setRetryCount(0);
    } else if (playbackStatus.error) {
      setStatus('error');
    }
  }, []);

  const handleError = useCallback((error: string) => {
    setStatus('error');
  }, []);

  const handleWebViewLoad = useCallback(() => {
    setStatus('connected');
    setRetryCount(0);
    setLastWebViewError(null);
  }, []);

  const handleWebViewError = useCallback((error?: string) => {
    setStatus('error');
    if (error) {
      setLastWebViewError(error);
    }
  }, []);

  const openInBrowser = useCallback(async () => {
    await WebBrowser.openBrowserAsync(webViewUrl);
  }, [webViewUrl]);

  const handleRetry = useCallback(async () => {
    if (retryCount >= maxRetries) {
      setStatus('offline');
      return;
    }

    setStatus('connecting');
    setRetryCount((prev) => prev + 1);

    if (useHls && videoRef.current) {
      try {
        await videoRef.current.unloadAsync();
        await videoRef.current.loadAsync(
          { uri: VIDEO_STREAM_URL },
          { shouldPlay: true, isMuted }
        );
      } catch (err) {
        console.error('Retry failed:', err);
        setStatus('error');
      }
    } else if (useWebRTC) {
      setWebrtcKey((k) => k + 1);
    } else {
      setWebViewKey((k) => k + 1);
    }
  }, [retryCount, isMuted, useHls, useWebRTC]);

  const handleContactHelp = useCallback(() => {
    if (!emergencyContacts.length) {
      Alert.alert(
        'No emergency contacts',
        'Please add 3 emergency contacts first.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Contact help',
      'This will text your emergency contacts and open the 911 dialer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            try {
              setIsSendingHelp(true);
              const message =
                'Emergency alert from Sentryx. Please check my car camera feed and contact me.';

              await sendEmergencySms(message);

              const numbers = emergencyContacts.map((c) => c.phone).join(',');
              const smsUrl =
                Platform.OS === 'ios'
                  ? `sms:${numbers}&body=${encodeURIComponent(message)}`
                  : `sms:${numbers}?body=${encodeURIComponent(message)}`;

              await Linking.openURL(smsUrl);

              setTimeout(() => {
                Linking.openURL('tel:911');
              }, 800);
            } catch (err) {
              console.error('Contact help failed:', err);
            } finally {
              setIsSendingHelp(false);
            }
          },
        },
      ]
    );
  }, [emergencyContacts]);

  const toggleMute = useCallback(async () => {
    if (useHls && videoRef.current) {
      await videoRef.current.setIsMutedAsync(!isMuted);
      setIsMuted(!isMuted);
    }
  }, [isMuted, useHls]);

  const toggleFullscreen = useCallback(async () => {
    if (useHls && videoRef.current) {
      if (isFullscreen) {
        await videoRef.current.dismissFullscreenPlayer();
      } else {
        await videoRef.current.presentFullscreenPlayer();
      }
      setIsFullscreen(!isFullscreen);
    }
  }, [isFullscreen, useHls]);

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls && status === 'connected') {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showControls, status]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Live Camera</Text>
          <Text style={styles.subtitle}>Front Dashboard</Text>
        </View>
        <StatusBadge
          label={getStatusLabel(status)}
          variant={getStatusVariant(status)}
          pulse={status === 'connected'}
        />
      </View>

      {/* Video Container */}
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={() => setShowControls(!showControls)}
      >
        {status === 'connecting' && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary[500]} />
            <Text style={styles.loadingText}>Connecting to camera...</Text>
          </View>
        )}

        {(status === 'error' || status === 'offline') && (
          <View style={styles.errorOverlay}>
            <Ionicons
              name={status === 'offline' ? 'cloud-offline' : 'warning'}
              size={48}
              color={Colors.neutral[400]}
            />
            <Text style={styles.errorTitle}>
              {status === 'offline' ? 'Camera Offline' : 'Connection Error'}
            </Text>
            <Text style={styles.errorDescription}>
              {status === 'offline'
                ? 'The camera is not responding. Please check the Pi and camera.'
                : `Unable to connect. Make sure your phone is on the same network as the Pi, or connected to Tailscale. (${retryCount}/${maxRetries})`}
            </Text>
            <View style={styles.errorActions}>
              {status === 'error' && retryCount < maxRetries && (
                <Button
                  title="Try Again"
                  onPress={handleRetry}
                  variant="outline"
                  size="sm"
                  style={{ marginTop: Spacing.lg }}
                />
              )}
              <Button
                title="Open in Safari"
                onPress={openInBrowser}
                variant="outline"
                size="sm"
                style={{ marginTop: Spacing.md }}
              />
            </View>
          </View>
        )}

        {(status === 'connected' || status === 'connecting') && useHls && (
          <Video
            ref={videoRef}
            source={{ uri: VIDEO_STREAM_URL }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            isMuted={isMuted}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onError={handleError}
          />
        )}

        {(status === 'connected' || status === 'connecting') && useWebRTC && WebRTCCamera && (
          <WebRTCCamera
            key={webrtcKey}
            url={VIDEO_STREAM_URL}
            style={styles.webView}
            onConnected={() => {
              setStatus('connected');
              setRetryCount(0);
            }}
            onError={() => setStatus('error')}
          />
        )}

        {(status === 'connected' || status === 'connecting') && useWebView && (
          <WebView
            key={webViewKey}
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            style={styles.webView}
            scrollEnabled={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onLoad={handleWebViewLoad}
            onError={(event) => {
              const msg = event.nativeEvent?.description ?? 'WebView error';
              handleWebViewError(msg);
            }}
            onHttpError={(event) => {
              const msg = `HTTP ${event.nativeEvent.statusCode} for ${event.nativeEvent.url}`;
              handleWebViewError(msg);
            }}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="compatibility"
            allowsFullscreenVideo
            originWhitelist={['*']}
            cacheEnabled={false}
            incognito={false}
          />
        )}

        {status === 'error' && useWebView && lastWebViewError && (
          <View style={styles.webViewErrorOverlay}>
            <Text style={styles.webViewErrorText}>{lastWebViewError}</Text>
          </View>
        )}

        {/* Video Controls Overlay */}
        {showControls && status === 'connected' && (
          <View style={styles.controlsOverlay}>
            <View style={styles.topControls}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveCircle} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={styles.timestamp}>
                {new Date().toLocaleTimeString()}
              </Text>
            </View>

            <View style={styles.bottomControls}>
              <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={24}
                  color={Colors.neutral[0]}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlButton} onPress={handleRetry}>
                <Ionicons name="refresh" size={24} color={Colors.neutral[0]} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlButton} onPress={toggleFullscreen}>
                <Ionicons name="expand" size={24} color={Colors.neutral[0]} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Recent Events */}
      <View style={styles.eventsSection}>
        <Text style={styles.sectionTitle}>Recent events</Text>
        {__DEV__ && (
          <View style={styles.debugRow}>
            <Text style={styles.debugText}>
              device: {deviceId ?? 'all'} • events: {events.length}
            </Text>
            <Text style={styles.debugText}>
              fetch: {debugInfo.lastFetchAt || '-'} • sub: {debugInfo.subscriptionStatus || '-'}
            </Text>
            {!!debugInfo.lastFetchError && (
              <Text style={styles.debugError}>error: {debugInfo.lastFetchError}</Text>
            )}
          </View>
        )}
        <Button
          title="Contact help"
          onPress={handleContactHelp}
          variant="primary"
          size="lg"
          loading={isSendingHelp}
          fullWidth
          leftIcon={<Ionicons name="call" size={18} color={Colors.background.primary} />}
          style={styles.helpButton}
          textStyle={styles.helpButtonText}
        />
        <View style={styles.eventsList}>
          {recentEvents.map((event) => (
            <Card key={event.id} style={styles.eventCard} variant="filled">
              <View style={styles.eventIcon}>
                <Ionicons name="alert-circle" size={20} color={Colors.primary[500]} />
              </View>
              <View style={styles.eventText}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventDetail}>{event.detail}</Text>
              </View>
              {!!event.time && <Text style={styles.eventTime}>{event.time}</Text>}
            </Card>
          ))}
        </View>
      </View>
    </View>
  );
}

function getStatusLabel(status: StreamStatus): string {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Live';
    case 'error':
      return 'Error';
    case 'offline':
      return 'Offline';
  }
}

function getStatusVariant(status: StreamStatus): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'connecting':
      return 'warning';
    case 'connected':
      return 'success';
    case 'error':
      return 'error';
    case 'offline':
      return 'neutral';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  title: {
    ...Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  subtitle: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  videoContainer: {
    marginHorizontal: Spacing.xl,
    height: (SCREEN_WIDTH - Spacing.xl * 2) * 0.5625, // 16:9 aspect ratio
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  video: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  errorTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    marginTop: Spacing.md,
  },
  errorDescription: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  errorActions: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  webViewErrorOverlay: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: BorderRadius.md,
  },
  webViewErrorText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[0],
    textAlign: 'center',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  liveCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.neutral[0],
  },
  liveText: {
    ...Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  timestamp: {
    ...Typography.sizes.sm,
    color: Colors.neutral[0],
    fontWeight: Typography.weights.medium,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventsSection: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    marginBottom: Spacing.lg,
  },
  eventsList: {
    gap: Spacing.md,
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
  helpButton: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.primary[500],
  },
  helpButtonText: {
    color: Colors.background.primary,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventText: {
    flex: 1,
  },
  eventTitle: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  eventDetail: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  eventTime: {
    ...Typography.sizes.xs,
    color: Colors.neutral[100],
  },
});
