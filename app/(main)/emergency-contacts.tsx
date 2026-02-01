import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { Colors, Spacing, Typography, BorderRadius } from '@/constants/theme';
import { getEmergencyContacts, replaceEmergencyContacts } from '@/lib/emergency';

type ContactItem = {
  id: string;
  name: string;
  phone: string;
};

export default function EmergencyContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selected, setSelected] = useState<ContactItem[]>([]);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const sortByName = useCallback((items: ContactItem[]) => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const demoContacts: ContactItem[] = [
        { id: 'demo-1', name: 'Aaliyah Williams', phone: '(416) 555-0132' },
        { id: 'demo-2', name: 'Brooke Chen', phone: '(416) 555-0178' },
        { id: 'demo-3', name: 'Carla Johnson', phone: '(416) 555-0129' },
        { id: 'demo-4', name: 'Daria Singh', phone: '(416) 555-0144' },
        { id: 'demo-5', name: 'Elena Park', phone: '(416) 555-0191' },
        { id: 'demo-6', name: 'Fatima Noor', phone: '(416) 555-0156' },
        { id: 'demo-7', name: 'Grace Alvarez', phone: '(416) 555-0117' },
        { id: 'demo-8', name: 'Hana Kim', phone: '(416) 555-0183' },
        { id: 'demo-9', name: 'Isabelle Martin', phone: '(416) 555-0162' },
        { id: 'demo-10', name: 'Jade Patel', phone: '(416) 555-0108' },
        { id: 'demo-11', name: 'Kylie Brown', phone: '(416) 555-0139' },
        { id: 'demo-12', name: 'Layla Brooks', phone: '(416) 555-0170' },
      ];

      setContacts(sortByName(demoContacts));

      const existing = await getEmergencyContacts();
      const existingContacts = existing.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
      }));
      setSelected(sortByName(existingContacts));
      setIsLoading(false);
    };

    load();
  }, [sortByName]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const term = search.toLowerCase();
    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(term) ||
        contact.phone.replace(/\s+/g, '').includes(term)
    );
  }, [contacts, search]);

  const handleAddContact = (contact: ContactItem) => {
    const exists = selected.some((item) => item.phone === contact.phone);
    if (exists) return;
    setSelected((prev) => sortByName([...prev, contact]));
  };

  const handleRemoveContact = (contact: ContactItem) => {
    if (selected.length <= 2) {
      Alert.alert('Minimum 2 contacts', 'You must keep at least 2 emergency contacts.');
      return;
    }
    setSelected((prev) => prev.filter((item) => item.phone !== contact.phone));
  };

  const handleSave = async () => {
    if (selected.length < 2) {
      Alert.alert('Add at least 2', 'Please add at least 2 emergency contacts.');
      return;
    }
    setSaving(true);
    const ok = await replaceEmergencyContacts(
      selected.map((item) => ({ name: item.name, phone: item.phone }))
    );
    setSaving(false);
    if (ok) {
      Alert.alert('Saved', 'Emergency contacts updated.');
      router.back();
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary[500]} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color={Colors.neutral[0]} />
      </TouchableOpacity>
      <View style={styles.header}>
        <Text style={styles.title}>Emergency Contacts</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color={Colors.background.primary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Add at least 2 contacts. You can add more.</Text>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {selected.map((contact) => (
          <Card key={`${contact.phone}`} style={styles.contactCard} variant="filled">
            <View style={styles.contactIcon}>
              <Ionicons name="person" size={18} color={Colors.background.primary} />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactPhone}>{contact.phone}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.removeButton,
                selected.length <= 2 && styles.removeButtonDisabled,
              ]}
              onPress={() => handleRemoveContact(contact)}
              disabled={selected.length <= 2}
            >
              <Ionicons name="trash" size={16} color={Colors.neutral[0]} />
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Save contacts"
          onPress={handleSave}
          loading={saving}
          disabled={selected.length < 2}
          size="lg"
          fullWidth
        />
      </View>

      <Modal visible={pickerOpen} animationType="slide">
        <View style={[styles.modalFullscreen, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add contacts</Text>
            <TouchableOpacity
              onPress={() => setPickerOpen(false)}
              style={styles.modalCloseButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={Colors.neutral[0]} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.neutral[300]} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts"
              placeholderTextColor={Colors.neutral[300]}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalList}>
            {filteredContacts.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>No contacts found</Text>
              </View>
            ) : (
              filteredContacts.map((contact) => {
                const alreadyAdded = selected.some((item) => item.phone === contact.phone);
                return (
                  <TouchableOpacity
                    key={`${contact.id}-${contact.phone}`}
                    style={styles.modalItem}
                    onPress={() => handleAddContact(contact)}
                    disabled={alreadyAdded}
                  >
                    <View style={styles.modalAvatar}>
                      <Ionicons name="person" size={16} color={Colors.background.primary} />
                    </View>
                    <View style={styles.modalText}>
                      <Text style={styles.modalName}>{contact.name}</Text>
                      <Text style={styles.modalPhone}>{contact.phone}</Text>
                    </View>
                    <Ionicons
                      name={alreadyAdded ? 'checkmark' : 'add'}
                      size={18}
                      color={alreadyAdded ? Colors.primary[500] : Colors.neutral[0]}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  title: {
    ...Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
  },
  subtitle: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    marginTop: Spacing.sm,
  },
  listScroll: {
    flex: 1,
    marginTop: Spacing.md,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  contactIcon: {
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
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonDisabled: {
    opacity: 0.4,
  },
  footer: {
    paddingBottom: Spacing.xl,
  },
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
  modalFullscreen: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.neutral[0],
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  searchInput: {
    ...Typography.sizes.base,
    color: Colors.neutral[0],
    flex: 1,
  },
  modalList: {
    gap: Spacing.md,
  },
  modalEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  modalEmptyText: {
    ...Typography.sizes.sm,
    color: Colors.neutral[200],
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  modalAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalText: {
    flex: 1,
  },
  modalName: {
    ...Typography.sizes.base,
    color: Colors.neutral[0],
    fontWeight: Typography.weights.semibold,
  },
  modalPhone: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
  },
});
