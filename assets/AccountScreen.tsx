import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Icon } from './src/Icon';
import { C } from './src/Theme';
import type { ShelfItem } from './Libraryscreen';

type Props = {
  displayName: string;
  email: string;
  profilePhotoUri: string | null;
  onProfilePhotoChange: (uri: string) => void;
  onUpdateName: (name: string) => Promise<void>;
  books: ShelfItem[];
  onOpenBook: (book: ShelfItem) => void;
  onAddBooks: () => void;
};

export default function AccountScreen({
  displayName, email, profilePhotoUri, onProfilePhotoChange, onUpdateName, books, onOpenBook, onAddBooks,
}: Props) {
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const initials = displayName.trim().slice(0, 1).toUpperCase() || 'G';

  const saveName = async () => {
    const name = draftName.trim();
    if (!name) {
      setNameError('Enter your name before saving.');
      return;
    }

    setNameError('');
    setNameSaved(false);
    setIsSavingName(true);
    try {
      await onUpdateName(name);
      setDraftName(name);
      setIsEditingName(false);
      setNameSaved(true);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Could not update your name. Try again.');
    } finally {
      setIsSavingName(false);
    }
  };

  const chooseProfilePhoto = async () => {
    setPhotoError('');
    setIsPickingPhoto(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (result.canceled) return;

      const photo = result.assets[0];
      if (photo.mimeType && !photo.mimeType.startsWith('image/')) {
        throw new Error('Choose an image file for your profile picture.');
      }
      onProfilePhotoChange(photo.uri);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not select that photo.');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={books}
        keyExtractor={(item) => item.book.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Account</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileInfo}>
                {profilePhotoUri ? (
                  <Image source={{ uri: profilePhotoUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.initials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.identity}>
                  <Text style={styles.name} numberOfLines={1}>{displayName || 'Guest'}</Text>
                  <Text style={styles.email} numberOfLines={2}>{email || 'Guest session'}</Text>
                </View>
              </View>
              {isEditingName ? (
                <View style={styles.nameEditor}>
                  <TextInput
                    accessibilityLabel="Account name"
                    style={styles.nameInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Your name"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                    editable={!isSavingName}
                  />
                  <TouchableOpacity style={styles.nameSaveButton} onPress={saveName} disabled={isSavingName}>
                    {isSavingName
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.nameSaveText}>Save</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.nameCancelButton}
                    onPress={() => { setIsEditingName(false); setDraftName(displayName); setNameError(''); }}
                    disabled={isSavingName}
                  >
                    <Text style={styles.nameCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.nameEditButton}
                  onPress={() => { setDraftName(displayName); setIsEditingName(true); setNameError(''); setNameSaved(false); }}
                  accessibilityRole="button"
                  accessibilityLabel="Change account name"
                >
                  <Icon name="create-outline" size={17} color={C.cyan} />
                  <Text style={styles.photoButtonText}>Change name</Text>
                </TouchableOpacity>
              )}
              {!!nameError && <Text style={styles.error} accessibilityLiveRegion="polite">{nameError}</Text>}
              {nameSaved && <Text style={styles.success} accessibilityLiveRegion="polite">Name updated.</Text>}
              <TouchableOpacity
                style={styles.photoButton}
                onPress={chooseProfilePhoto}
                disabled={isPickingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Add or change profile picture"
                accessibilityState={{ busy: isPickingPhoto }}
              >
                {isPickingPhoto ? (
                  <ActivityIndicator size="small" color={C.cyan} />
                ) : (
                  <>
                    <Icon name="camera-outline" size={18} color={C.cyan} />
                    <Text style={styles.photoButtonText}>{profilePhotoUri ? 'Change picture' : 'Add picture'}</Text>
                  </>
                )}
              </TouchableOpacity>
              {!!photoError && <Text style={styles.error} accessibilityLiveRegion="polite">{photoError}</Text>}
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Uploaded files</Text>
                <Text style={styles.sectionNote}>Books you added from your device</Text>
              </View>
              <Text style={styles.bookCount}>{books.length}</Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.bookRow}
            onPress={() => onOpenBook(item)}
            accessibilityRole="button"
            accessibilityLabel={`Listen to ${item.book.title}`}
          >
            <View style={styles.bookIcon}>
              <Icon name="document-text-outline" size={20} color={C.cyan} />
            </View>
            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle} numberOfLines={2}>{item.book.title}</Text>
              <Text style={styles.bookAuthor} numberOfLines={1}>{item.book.author}</Text>
            </View>
            <Icon name="play-circle-outline" size={24} color={C.purple} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="library-outline" size={38} color={C.border} />
            <Text style={styles.emptyTitle}>No uploaded books yet</Text>
            <Text style={styles.emptyNote}>Add EPUB, TXT, or Markdown books to see them here.</Text>
            <TouchableOpacity style={styles.addButton} onPress={onAddBooks}>
              <Icon name="add" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Go to my library</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  list: { paddingBottom: 24, flexGrow: 1 },
  heading: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 14 },
  profileCard: {
    backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border,
  },
  profileInfo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.purple },
  initials: { color: C.cyan, fontSize: 28, fontWeight: '800' },
  identity: { flex: 1 },
  name: { color: C.text, fontSize: 18, fontWeight: '800' },
  email: { color: C.textMuted, fontSize: 13, marginTop: 4 },
  photoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 42, marginTop: 14, borderRadius: 12, backgroundColor: C.surfaceAlt,
  },
  photoButtonText: { color: C.cyan, fontSize: 13, fontWeight: '700' },
  nameEditButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, marginTop: 10 },
  nameEditor: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  nameInput: { flex: 1, minWidth: 0, color: C.text, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  nameSaveButton: { minWidth: 56, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.purple, borderRadius: 10, paddingHorizontal: 12 },
  nameSaveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  nameCancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  nameCancelText: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
  error: { color: C.danger, fontSize: 12, marginTop: 10 },
  success: { color: C.cyan, fontSize: 12, marginTop: 8 },
  sectionHeading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 19, fontWeight: '800' },
  sectionNote: { color: C.textMuted, fontSize: 12, marginTop: 4 },
  bookCount: {
    color: C.cyan, fontSize: 13, fontWeight: '800', backgroundColor: C.surfaceAlt,
    minWidth: 30, textAlign: 'center', overflow: 'hidden', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 8,
  },
  bookRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10,
    backgroundColor: C.surface, borderRadius: 15, borderWidth: 1, borderColor: C.border,
  },
  bookIcon: { width: 42, height: 48, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  bookInfo: { flex: 1 },
  bookTitle: { color: C.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  bookAuthor: { color: C.textMuted, fontSize: 12, marginTop: 4 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 30, paddingHorizontal: 20 },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  emptyNote: { color: C.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.purple,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4,
  },
  addButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
