import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Icon } from './src/Icon';
import { C } from './src/Theme';
import { importBookFile } from './src/BookImport';
import { BookResult } from './src/Books';

export interface ShelfItem {
  book: BookResult;
  text: string;
}

interface Props {
  shelf: ShelfItem[];
  onImport: (book: BookResult, text: string) => void;
  onOpen: (item: ShelfItem) => void;
}

export default function LibraryScreen({ shelf, onImport, onOpen }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBook = async () => {
    setError(null);
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (result.canceled) return;

      const imported = await importBookFile(result.assets[0]);
      onImport(imported.book, imported.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this book.');
    } finally {
      setImporting(false);
    }
  };

  const renderBook = (item: ShelfItem) => (
    <View style={styles.card}>
      {item.book.cover ? (
        <Image source={{ uri: item.book.cover }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Icon name="book" size={26} color={C.purple} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.book.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>{item.book.author}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpen(item)}>
          <Icon name="headset" size={16} color="#fff" />
          <Text style={styles.actionText}>Listen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingGroup}>
          <Text style={styles.heading}>My library</Text>
          <Text style={styles.note}>Add books you have downloaded: EPUB, TXT, or Markdown.</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={addBook}
          disabled={importing}
          accessibilityRole="button"
          accessibilityLabel="Add a book from this device"
          accessibilityState={{ busy: importing }}
        >
          {importing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="add" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add book</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}

      <FlatList
        data={shelf}
        keyExtractor={(item) => item.book.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => renderBook(item)}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="bookmarks-outline" size={44} color={C.border} />
            <Text style={styles.emptyText}>Your library is empty.</Text>
            <Text style={styles.emptyHint}>Choose Add book to import a file from your device.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  headingGroup: { flex: 1 },
  heading: { color: C.text, fontSize: 26, fontWeight: '800' },
  note: { color: C.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    minHeight: 42, paddingHorizontal: 12, borderRadius: 13, backgroundColor: C.purple,
  },
  addButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  error: { color: C.danger, fontSize: 13, marginTop: 8 },
  list: { paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  card: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 18, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  cover: { width: 66, height: 96, borderRadius: 10, backgroundColor: C.surfaceAlt },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, marginLeft: 14, minHeight: 96 },
  bookTitle: { color: C.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  bookAuthor: { color: C.textMuted, fontSize: 12, marginTop: 3 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: C.purple, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, minWidth: 128,
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 60, gap: 10, paddingHorizontal: 24 },
  emptyText: { color: C.textMuted, fontSize: 14, textAlign: 'center' },
  emptyHint: { color: C.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
