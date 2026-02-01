import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  LayoutAnimation,
  Linking,
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
import { WebView } from 'react-native-webview';

import { Button, Card, StatusBadge } from '@/components/ui';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { fetchRecentEvents, SensorEvent, subscribeToEvents } from '@/lib/alerts';
import { AlertLog, fetchAlertLogs, formatAlertTime, subscribeToAlertLogs } from '@/lib/alertLogs';
import { getEmergencyContacts, sendEmergencySms } from '@/lib/emergency';
import { notifyMotionEvent, notifyAlertEvent } from '@/lib/notifications';
import { useAuthStore } from '@/store/auth';
import * as Location from 'expo-location';

const VIDEO_STREAM_URL =
  process.env.EXPO_PUBLIC_VIDEO_STREAM_URL ??
  process.env.EXPO_PUBLIC_WEBCAM_URL ??
  'http://raspberrypi.tail56d975.ts.net:8889/cam/';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:5000';
const BACKEND_URL_CLEAN = BACKEND_URL.endsWith('/')
  ? BACKEND_URL.slice(0, -1)
  : BACKEND_URL;

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

function HLSVideoPlayer({
  url,
  style,
  onStatusChange,
  isMuted,
}: {
  url: string;
  style?: object;
  onStatusChange?: (status: 'connecting' | 'connected' | 'error') => void;
  isMuted?: boolean;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = isMuted ?? false;
    p.play();
  });

  useEffect(() => {
    player.muted = isMuted ?? false;
  }, [isMuted, player]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', (event) => {
      if (event.status === 'readyToPlay') {
        onStatusChange?.('connected');
      } else if (event.status === 'error') {
        onStatusChange?.('error');
      } else if (event.status === 'loading') {
        onStatusChange?.('connecting');
      }
    });
    return () => subscription.remove();
  }, [player, onStatusChange]);

  return (
    <VideoView
      style={style}
      player={player}
      nativeControls={false}
      contentFit="contain"
    />
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  const [status, setStatus] = useState<StreamStatus>('connecting');
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
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
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

  useFocusEffect(
    useCallback(() => {
      setStatus('connecting');
      if (useHls) {
      } else if (useWebRTC) {
        setWebrtcKey((k) => k + 1);
      } else if (useWebView) {
        setWebViewKey((k) => k + 1);
      }
      getEmergencyContacts().then(setEmergencyContacts);
      return () => {};
    }, [useHls, useWebRTC, useWebView])
  );

  const refreshHome = useCallback(async () => {
    setIsRefreshing(true);
    const [eventsResult, alertsResult] = await Promise.all([
      fetchRecentEvents(5, deviceId),
      fetchAlertLogs(5, 0),
    ]);
    setEvents(eventsResult.data);
    setAlertLogs(alertsResult.data || []);
    setDebugInfo((prev) => ({
      ...prev,
      lastFetchError: eventsResult.error ?? '',
      lastFetchAt: new Date().toLocaleTimeString(),
    }));
    setIsRefreshing(false);
  }, [deviceId]);

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

  useEffect(() => {
    refreshHome();
  }, [refreshHome]);

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

  // Subscribe to alert_logs for notifications and preview list
  useEffect(() => {
    if (!user?.id) return;

    try {
      const unsubscribe = subscribeToAlertLogs(
        (alert: AlertLog) => {
          setAlertLogs((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === alert.id);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = alert;
              return updated.slice(0, 5);
            }
            return [alert, ...prev].slice(0, 5);
          });
          // Only notify for unknown persons (intruders)
          if (!alert.is_known) {
            notifyAlertEvent({
              alertId: alert.id,
              identity: alert.identity,
              isKnown: alert.is_known,
              geminiAssessment: alert.gemini_assessment,
              threatLevel: alert.threat_level,
              thumbnailUrl: alert.thumbnail_url,
              deviceId: alert.device_id,
            });
          }
        },
        user.id
      );

      return unsubscribe;
    } catch (error) {
      console.log('Alert subscription error (table may not exist yet):', error);
    }
  }, [user?.id]);

  useEffect(() => {
    const poll = setInterval(() => {
      Promise.all([fetchRecentEvents(5, deviceId), fetchAlertLogs(5, 0)]).then(
        ([eventsResult, alertsResult]) => {
          setEvents(eventsResult.data);
          setAlertLogs(alertsResult.data || []);
          setDebugInfo((prev) => ({
            ...prev,
            lastFetchError: eventsResult.error ?? '',
            lastFetchAt: new Date().toLocaleTimeString(),
          }));
        }
      );
    }, 3000);

    return () => clearInterval(poll);
  }, [deviceId]);

  const handleHlsStatusChange = useCallback((newStatus: 'connecting' | 'connected' | 'error') => {
    setStatus(newStatus);
    if (newStatus === 'connected') {
      setRetryCount(0);
    }
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

    if (useHls) {
      setWebViewKey((k) => k + 1);
    } else if (useWebRTC) {
      setWebrtcKey((k) => k + 1);
    } else {
      setWebViewKey((k) => k + 1);
    }
  }, [retryCount, useHls, useWebRTC]);

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
              let locationText = '';
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === 'granted') {
                const position = await Location.getCurrentPositionAsync({});
                const { latitude, longitude } = position.coords;
                locationText = ` https://maps.google.com/?q=${latitude},${longitude}`;
              }

              const name =
                user?.user_metadata?.full_name ||
                user?.email?.split('@')[0] ||
                'A Sentryx user';
              const message = `${name} has sent you an alert: here is their live location${locationText}`;

              const ok = await sendEmergencySms(message);
              if (!ok) {
                Alert.alert(
                  'SMS failed',
                  'Emergency SMS failed. Check your Supabase Edge Function logs or Twilio settings.'
                );
              }

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
  }, [emergencyContacts, user?.email, user?.user_metadata?.full_name]);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (showControls && status === 'connected') {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showControls, status]);

  const recentEvents = useMemo(() => {
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

  const recentDetections = useMemo(() => {
    if (!alertLogs.length) {
      return [];
    }
    return alertLogs.slice(0, 3);
  }, [alertLogs]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing['3xl'] },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refreshHome}
          tintColor={Colors.primary[500]}
        />
      }
    >
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

      <View style={styles.liveHeader}>
        <View>
          <Text style={styles.liveTitle}>Live Camera</Text>
          <Text style={styles.liveSubtitle}>Dash Cam</Text>
        </View>
        <StatusBadge
          label={getStatusLabel(status)}
          variant={getStatusVariant(status)}
          pulse={status === 'connected'}
        />
      </View>

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
          <HLSVideoPlayer
            key={webViewKey}
            url={VIDEO_STREAM_URL}
            style={styles.video}
            isMuted={isMuted}
            onStatusChange={handleHlsStatusChange}
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

        {showControls && status === 'connected' && (
          <View style={styles.controlsOverlay}>
            <View style={styles.topControls}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveCircle} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={styles.timestamp}>{new Date().toLocaleTimeString()}</Text>
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
            </View>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.alertPreviewSection}>
        <View style={styles.alertPreviewHeader}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <TouchableOpacity
            onPress={() => router.push('/(main)/alert-history')}
            activeOpacity={0.7}
          >
            <Text style={styles.alertPreviewLink}>View history</Text>
          </TouchableOpacity>
        </View>
        {recentDetections.length === 0 ? (
          <Card style={styles.emptyAlertCard} variant="filled">
            <Ionicons name="shield-checkmark-outline" size={28} color={Colors.neutral[400]} />
            <Text style={styles.emptyAlertText}>No detections yet</Text>
          </Card>
        ) : (
          recentDetections.map((alert) => {
            const thumbnailUrl =
              alert.thumbnail_url ||
              (alert.thumbnail_filename
                ? `${BACKEND_URL_CLEAN}/api/alerts/media/${alert.thumbnail_filename}`
                : null);
            const statusText = alert.is_known ? `Known • ${alert.identity}` : 'Unknown';
            return (
              <TouchableOpacity
                key={alert.id}
                onPress={() => router.push('/(main)/alert-history')}
                activeOpacity={0.85}
              >
                <Card style={styles.alertPreviewCard} variant="filled">
                  {thumbnailUrl ? (
                    <Image
                      source={{ uri: thumbnailUrl }}
                      style={styles.alertThumbnail}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.alertThumbnailPlaceholder}>
                      <Ionicons name="image-outline" size={26} color={Colors.neutral[400]} />
                    </View>
                  )}
                  <View style={styles.alertPreviewText}>
                    <View style={styles.alertPreviewRow}>
                      <Text
                        style={[
                          styles.alertPreviewStatus,
                          alert.is_known ? styles.alertPreviewKnown : styles.alertPreviewUnknown,
                        ]}
                        numberOfLines={1}
                      >
                        {statusText}
                      </Text>
                      <Text style={styles.alertPreviewTime}>
                        {formatAlertTime(alert.created_at)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.neutral[400]} />
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={styles.eventsSection}>
        <Text style={styles.sectionTitle}>Recent events</Text>
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
        <View style={styles.alertsList}>
          {recentEvents.map((event) => (
            <Card key={event.id} style={styles.alertCard} variant="filled">
              <View style={styles.alertIcon}>
                <Ionicons name="alert-circle" size={20} color={Colors.primary[500]} />
              </View>
              <View style={styles.alertText}>
                <Text style={styles.alertTitle}>{event.title}</Text>
                <Text style={styles.alertDetail}>{event.detail}</Text>
              </View>
              {!!event.time && <Text style={styles.alertTime}>{event.time}</Text>}
            </Card>
          ))}
        </View>
      </View>

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
    </ScrollView>
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
  content: {
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
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  liveTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  liveSubtitle: {
    ...Typography.sizes.xs,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  videoContainer: {
    height: (SCREEN_WIDTH - Spacing.xl * 2) * 0.5625,
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
    marginTop: Spacing.xl,
  },
  alertPreviewSection: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  alertPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertPreviewLink: {
    ...Typography.sizes.sm,
    color: Colors.primary[300],
    fontWeight: Typography.weights.semibold,
  },
  alertPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  alertThumbnail: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
  },
  alertThumbnailPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.neutral[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertPreviewText: {
    flex: 1,
  },
  alertPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  alertPreviewStatus: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    flex: 1,
  },
  alertPreviewKnown: {
    color: Colors.success,
  },
  alertPreviewUnknown: {
    color: Colors.error,
  },
  alertPreviewTime: {
    ...Typography.sizes.sm,
    color: Colors.neutral[200],
  },
  emptyAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  emptyAlertText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[200],
  },
  sectionTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    marginBottom: Spacing.lg,
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
  helpButton: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.primary[500],
  },
  helpButtonText: {
    color: Colors.background.primary,
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
