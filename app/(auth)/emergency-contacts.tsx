import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Button, ScreenContainer, Header } from '@/components/ui';
import { Colors, Spacing, Typography, Shadows, BorderRadius } from '@/constants/theme';
import { saveEmergencyContacts } from '@/lib/emergency';

type ContactItem = {
  id: string;
  name: string;
  phone: string;
};

export default function EmergencyContactsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selected, setSelected] = useState<Record<string, ContactItem>>({});
  const [saving, setSaving] = useState(false);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  useEffect(() => {
    const loadContacts = async () => {
      setIsLoading(true);
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setIsLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 200,
        pageOffset: 0,
      });

      const normalized = data
        .filter((contact) => contact.phoneNumbers?.length)
        .map((contact) => ({
          id: contact.id,
          name: contact.name ?? 'Unknown',
          phone: contact.phoneNumbers?.[0]?.number ?? '',
        }))
        .filter((contact) => contact.phone.trim().length > 0);

      setContacts(normalized);
      setIsLoading(false);
    };

    loadContacts();
  }, []);

  const toggleSelect = (contact: ContactItem) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[contact.id]) {
        delete next[contact.id];
        return next;
      }

      if (Object.keys(next).length >= 3) {
        return next;
      }

      next[contact.id] = contact;
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedList.length !== 3) return;
    setSaving(true);
    const ok = await saveEmergencyContacts(
      selectedList.map((item) => ({ name: item.name, phone: item.phone }))
    );
    setSaving(false);

    if (ok) {
      router.replace('/(main)/home');
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary[500]} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (permissionDenied) {
    return (
      <ScreenContainer>
        <Header showBack />
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle" size={36} color={Colors.primary[500]} />
          <Text style={styles.emptyTitle}>Contacts permission needed</Text>
          <Text style={styles.emptySubtitle}>
            Please enable contacts access to choose 3 emergency contacts.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Header showBack />
      <View style={styles.header}>
        <Text style={styles.title}>Emergency contacts</Text>
        <Text style={styles.subtitle}>Pick exactly 3 people to notify</Text>
      </View>

      <View style={styles.counterRow}>
        <Text style={styles.counterText}>
          Selected {selectedList.length} / 3
        </Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isSelected = Boolean(selected[item.id]);
          return (
            <TouchableOpacity
              style={[styles.contactCard, isSelected && styles.contactCardSelected]}
              onPress={() => toggleSelect(item)}
              activeOpacity={0.85}
            >
              <View style={styles.contactAvatar}>
                <Ionicons name="person" size={18} color={Colors.background.primary} />
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactPhone}>{item.phone}</Text>
              </View>
              <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color={Colors.background.primary} />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          title="Save contacts"
          onPress={handleSave}
          loading={saving}
          disabled={selectedList.length !== 3}
          size="lg"
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  subtitle: {
    ...Typography.sizes.base,
    color: Colors.neutral[100],
    marginTop: Spacing.xs,
  },
  counterRow: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  counterText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
  list: {
    gap: Spacing.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.lg,
    ...Shadows.md,
  },
  contactCardSelected: {
    borderWidth: 2,
    borderColor: Colors.primary[500],
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: {
    flex: 1,
  },
  contactName: {
    ...Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  contactPhone: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: 2,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: Colors.primary[500],
    borderColor: Colors.primary[500],
  },
  footer: {
    marginTop: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  emptySubtitle: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
