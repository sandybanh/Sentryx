import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import {
  AlertLog,
  fetchAlertLogs,
  deleteAlert,
  formatAlertTime,
  subscribeToAlertLogs,
} from '@/lib/alertLogs';
import { useAuthStore } from '@/store/auth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;
    player.play();
  });

  return (
    <VideoView
      style={styles.video}
      player={player}
      allowsPictureInPicture
      nativeControls
    />
  );
}

export default function AlertHistoryScreen() {
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AlertLog | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unknown' | 'known'>('all');
  const { session } = useAuthStore();

  const loadAlerts = useCallback(async () => {
    const isKnown = filter === 'all' ? undefined : filter === 'known';
    const { data, error } = await fetchAlertLogs(50, 0, isKnown);
    if (error) {
      console.log('Alert fetch error (table may not exist yet):', error);
    }
    setAlerts(data || []);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const unsubscribe = subscribeToAlertLogs((newAlert) => {
      setAlerts((prev) => {
        // Check if alert already exists (update case)
        const existingIndex = prev.findIndex((a) => a.id === newAlert.id);
        if (existingIndex >= 0) {
          // Update existing alert
          const updated = [...prev];
          updated[existingIndex] = newAlert;
          return updated;
        }
        // Add new alert at the beginning
        return [newAlert, ...prev];
      });
    }, session.user.id);

    return unsubscribe;
  }, [session?.user?.id]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAlerts();
  }, [loadAlerts]);

  const handleDeleteAlert = useCallback(async (alertId: string) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert? This will also delete the associated video and image files.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { ok, error } = await deleteAlert(alertId);
            if (ok) {
              setAlerts((prev) => prev.filter((a) => a.id !== alertId));
              if (selectedAlert?.id === alertId) {
                setVideoModalVisible(false);
                setSelectedAlert(null);
              }
            } else {
              Alert.alert('Error', error || 'Failed to delete alert');
            }
          },
        },
      ]
    );
  }, [selectedAlert?.id]);

  const openVideoModal = useCallback((alert: AlertLog) => {
    setSelectedAlert(alert);
    setVideoModalVisible(true);
  }, []);

  const closeVideoModal = useCallback(() => {
    setVideoModalVisible(false);
    setSelectedAlert(null);
  }, []);

  const renderAlertItem = useCallback(({ item }: { item: AlertLog }) => {
    return (
      <TouchableOpacity
        style={styles.alertCard}
        onPress={() => openVideoModal(item)}
        activeOpacity={0.8}
      >
        <View style={styles.alertCardInner}>
          {/* Thumbnail */}
          <View style={styles.thumbnailContainer}>
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
                <Ionicons name="image-outline" size={32} color={Colors.neutral[400]} />
              </View>
            )}
            {item.video_url && (
              <View style={styles.playIconOverlay}>
                <Ionicons name="play-circle" size={36} color="#fff" />
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.alertContent}>
            <View style={styles.alertHeader}>
              <Text style={styles.alertIdentity} numberOfLines={1}>
                {item.is_known ? item.identity : 'Unknown Person'}
              </Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteAlert(item.id);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>

            <Text style={styles.alertTime}>{formatAlertTime(item.created_at)}</Text>

            <View style={styles.alertMeta}>
              <Text style={styles.deviceId}>{item.device_id}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [openVideoModal, handleDeleteAlert]);

  const renderFilterTabs = () => (
    <View style={styles.filterContainer}>
      {(['all', 'unknown', 'known'] as const).map((f) => (
        <TouchableOpacity
          key={f}
          style={[styles.filterTab, filter === f && styles.filterTabActive]}
          onPress={() => setFilter(f)}
        >
          <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
            {f === 'all' ? 'All' : f === 'unknown' ? 'Unknown' : 'Known'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="shield-checkmark-outline" size={64} color={Colors.neutral[400]} />
      <Text style={styles.emptyTitle}>No Alerts</Text>
      <Text style={styles.emptySubtitle}>
        Your vehicle security history will appear here when motion or unknown persons are detected.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      {renderFilterTabs()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary[500]}
            />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}

      {/* Video Modal */}
      <Modal
        visible={videoModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeVideoModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeVideoModal}
              style={styles.modalCloseBtn}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.7}
            >
              <View style={styles.closeButtonBg}>
                <Ionicons name="close" size={24} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {selectedAlert?.is_known ? selectedAlert.identity : 'Unknown Person'}
            </Text>
            <TouchableOpacity
              onPress={() => selectedAlert && handleDeleteAlert(selectedAlert.id)}
              style={styles.modalDeleteBtn}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={24} color={Colors.error} />
            </TouchableOpacity>
          </View>

          {/* Video Player or Thumbnail */}
          {selectedAlert?.video_url ? (
            <View style={styles.videoContainer}>
              <VideoPlayer videoUrl={selectedAlert.video_url} />
            </View>
          ) : selectedAlert?.thumbnail_url ? (
            <View style={styles.videoContainer}>
              <Image
                source={{ uri: selectedAlert.thumbnail_url }}
                style={styles.video}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.noVideoContainer}>
              <Ionicons name="videocam-off-outline" size={64} color={Colors.neutral[400]} />
              <Text style={styles.noVideoText}>No media available</Text>
            </View>
          )}

          {/* Alert Details */}
          <ScrollView style={styles.modalDetails} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTimestamp}>
              {selectedAlert &&
                new Date(selectedAlert.created_at).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
            </Text>


            {selectedAlert?.gemini_assessment && (
              <View style={styles.assessmentCard}>
                <View style={styles.assessmentHeader}>
                  <Ionicons name="sparkles" size={16} color={Colors.primary[500]} />
                  <Text style={styles.assessmentTitle}>AI Assessment</Text>
                </View>
                <Text style={styles.assessmentText}>{selectedAlert.gemini_assessment}</Text>
              </View>
            )}

            <View style={styles.modalMetaRow}>
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Device</Text>
                <Text style={styles.modalMetaValue}>{selectedAlert?.device_id}</Text>
              </View>
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Confidence</Text>
                <Text style={styles.modalMetaValue}>
                  {selectedAlert?.confidence
                    ? `${(selectedAlert.confidence * 100).toFixed(0)}%`
                    : 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    ...Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.secondary,
  },
  filterTabActive: {
    backgroundColor: Colors.primary[500],
  },
  filterTabText: {
    ...Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.neutral[300],
  },
  filterTabTextActive: {
    color: Colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
    flexGrow: 1,
  },
  alertCard: {
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.md,
  },
  alertCardInner: {
    flexDirection: 'row',
  },
  thumbnailContainer: {
    width: 110,
    height: 110,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderThumbnail: {
    backgroundColor: Colors.neutral[700],
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  alertContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  alertIdentity: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    flex: 1,
  },
  alertTime: {
    ...Typography.sizes.xs,
    color: Colors.neutral[400],
    marginTop: 2,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  deviceId: {
    ...Typography.sizes.xs,
    color: Colors.neutral[400],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['3xl'],
    paddingTop: Spacing['4xl'],
  },
  emptyTitle: {
    ...Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[200],
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    ...Typography.sizes.base,
    color: Colors.neutral[400],
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  modalCloseBtn: {
    padding: Spacing.sm,
    zIndex: 100,
  },
  closeButtonBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  modalDeleteBtn: {
    padding: Spacing.sm,
    zIndex: 100,
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
    backgroundColor: '#000',
    marginTop: 100,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  noVideoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
    backgroundColor: Colors.neutral[800],
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  noVideoText: {
    ...Typography.sizes.base,
    color: Colors.neutral[400],
    marginTop: Spacing.md,
  },
  modalDetails: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  modalTimestamp: {
    ...Typography.sizes.sm,
    color: Colors.neutral[300],
    textAlign: 'center',
  },
  assessmentCard: {
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  assessmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  assessmentTitle: {
    ...Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.primary[500],
  },
  assessmentText: {
    ...Typography.sizes.base,
    color: Colors.neutral[100],
    lineHeight: 22,
  },
  modalMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[700],
  },
  modalMetaItem: {
    alignItems: 'center',
  },
  modalMetaLabel: {
    ...Typography.sizes.xs,
    color: Colors.neutral[400],
    marginBottom: Spacing.xs,
  },
  modalMetaValue: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[100],
  },
  bottomSpacer: {
    height: Spacing['4xl'],
  },
});
