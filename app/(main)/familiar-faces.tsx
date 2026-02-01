import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Input } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import {
  addFamiliarFace,
  deleteFamiliarFace,
  FamiliarFace,
  fetchFamiliarFaces,
} from '@/lib/faces';

export default function FamiliarFacesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [faces, setFaces] = useState<FamiliarFace[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchFamiliarFaces();
    setFaces(data);
    setLoadError(data.length ? null : error);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setPendingUri(result.assets[0].uri);
    setNameInput('');
    setModalVisible(true);
  }, []);

  const handleUploadPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to upload photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setPendingUri(result.assets[0].uri);
    setNameInput('');
    setModalVisible(true);
  }, []);

  const handleSaveFace = useCallback(async () => {
    const name = nameInput.trim();
    const uri = pendingUri;
    if (!name || !uri) return;

    setAdding(true);
    const { ok, error } = await addFamiliarFace(name, uri);
    setAdding(false);
    setModalVisible(false);
    setPendingUri(null);
    setNameInput('');
    if (ok) {
      load();
    } else {
      Alert.alert('Error', error ?? 'Failed to add face');
    }
  }, [nameInput, pendingUri, load]);

  const handleDelete = useCallback(
    (face: FamiliarFace) => {
      Alert.alert('Delete', `Remove ${face.name} from familiar faces?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteFamiliarFace(face.id);
            if (ok) load();
          },
        },
      ]);
    },
    [load]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[0]} />
        </TouchableOpacity>
        <Text style={styles.title}>Familiar Faces</Text>
      </View>

      <Text style={styles.subtitle}>
        Known faces are recognized by the camera. Add profiles to reduce false
        alerts.
      </Text>

      <View style={styles.buttonRow}>
        <Button
          title="Take Photo"
          onPress={handleTakePhoto}
          disabled={adding}
          variant="primary"
          loading={adding}
          leftIcon={
            <Ionicons name="camera" size={20} color={Colors.background.primary} />
          }
          style={styles.addButton}
        />
        <Button
          title="Upload"
          onPress={handleUploadPhoto}
          disabled={adding}
          variant="outline"
          leftIcon={
            <Ionicons name="images" size={20} color={Colors.primary[500]} />
          }
          style={styles.addButton}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary[500]} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle" size={48} color={Colors.error} />
          <Text style={styles.emptyText}>{loadError}</Text>
          <Text style={styles.emptyHint}>
            Check that the backend is running and EXPO_PUBLIC_BACKEND_URL is set.
          </Text>
        </View>
      ) : faces.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={64} color={Colors.neutral[300]} />
          <Text style={styles.emptyText}>No familiar faces yet</Text>
        </View>
      ) : null}

      {!loading && faces.length > 0 && (
        <FlatList
          data={faces}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.faceCard} variant="filled">
              {item.image_uri ? (
                <Image source={{ uri: item.image_uri }} style={styles.faceThumbnail} />
              ) : (
                <View style={styles.faceIcon}>
                  <Ionicons name="person" size={24} color={Colors.primary[500]} />
                </View>
              )}
              <Text style={styles.faceName}>{item.name}</Text>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={22} color={Colors.error} />
              </TouchableOpacity>
            </Card>
          )}
        />
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add face</Text>
            <Input
              label="Name"
              placeholder="Enter name"
              value={nameInput}
              onChangeText={setNameInput}
              autoCapitalize="words"
              autoComplete="name"
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => {
                  setModalVisible(false);
                  setPendingUri(null);
                }}
                variant="outline"
                style={styles.modalBtn}
              />
              <Button
                title={adding ? 'Saving...' : 'Save'}
                onPress={handleSaveFace}
                disabled={adding || !nameInput.trim()}
                variant="primary"
                loading={adding}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

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
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  back: {
    padding: Spacing.xs,
  },
  title: {
    ...Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  subtitle: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginBottom: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  addButton: {
    flex: 1,
  },
  list: {
    gap: Spacing.md,
  },
  faceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  faceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  faceName: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
    flex: 1,
  },
  faceThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: Spacing.md,
  },
  deleteBtn: {
    padding: Spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
  emptyHint: {
    ...Typography.sizes.xs,
    color: Colors.neutral[300],
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.background.primary,
    borderRadius: 16,
    padding: Spacing.xl,
  },
  modalTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
    marginBottom: Spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  modalBtn: {
    flex: 1,
  },
});
