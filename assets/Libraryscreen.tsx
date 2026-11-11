import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Image, ActivityIndicator, Platform,
} from 'react-native';
import { Icon } from './src/Icon';
import { C } from './src/Theme';
import { BookResult, BookSource, searchGutenberg, searchOpenLibrary, fetchBookText } from './src/Books';

export interface ShelfItem {
  book: BookResult;
  text: string;
}

type Tab = BookSource | 'shelf';

interface Props {
  shelf: ShelfItem[];
  onBorrow: (book: BookResult, text: string) => void;
  onOpen: (item: ShelfItem) => void;
}

export default function LibraryScreen({ shelf, onBorrow, onOpen }: Props) {
  const [tab, setTab] = useState<Tab>(Platform.OS === 'web' ? 'openlibrary' : 'gutenberg');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [borrowingId, setBorrowingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (source: BookSource, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = source === 'gutenberg' ? await searchGutenberg(q) : await searchOpenLibrary(q);
      setResults(data);
      if (data.length === 0) setError('No readable books found. Try another title or author.');
    } catch (e: any) {
      setResults([]);
      setError(e?.message || 'Could not reach the library. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'shelf') search(tab, query);
  }, [tab]);

  const borrow = async (book: BookResult) => {
    setBorrowingId(book.id);
    setError(null);
    try {
      const text = await fetchBookText(book);
      onBorrow(book, text);
    } catch (e: any) {
      setError(e?.message || 'Could not borrow this book.');
    } finally {
      setBorrowingId(null);
    }
  };

  const onShelf = (id: string) => shelf.some((s) => s.book.id === id);

  const renderBook = (book: BookResult, action: React.ReactNode) => (
    <View style={styles.card}>
      {book.cover ? (
        <Image source={{ uri: book.cover }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Icon name="book" size={26} color={C.purple} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text>
        <View style={{ flex: 1 }} />
        {action}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Library</Text>

      <View style={styles.tabs}>
        {(Platform.OS === 'web'
          ? [['openlibrary', 'Open Library'], ['shelf', `My shelf${shelf.length ? ` (${shelf.length})` : ''}`]] as [Tab, string][]
          : [['gutenberg', 'Gutenberg'], ['openlibrary', 'Open Library'], ['shelf', `My shelf${shelf.length ? ` (${shelf.length})` : ''}`]] as [Tab, string][]
        ).map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab !== 'shelf' && (
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search a title or author"
            placeholderTextColor={C.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => search(tab, query)}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); search(tab, ''); }}>
              <Icon name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {tab !== 'shelf' && (
        <Text style={styles.note}>
          {tab === 'gutenberg'
            ? 'Free public-domain classics from Project Gutenberg.'
            : 'Public-domain scans from the Internet Archive. Scanned text can contain OCR errors.'}
        </Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {tab === 'shelf' ? (
        <FlatList
          data={shelf}
          keyExtractor={(i) => i.book.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            renderBook(
              item.book,
              <TouchableOpacity style={styles.actionBtn} onPress={() => onOpen(item)}>
                <Icon name="headset" size={16} color="#fff" />
                <Text style={styles.actionText}>Listen</Text>
              </TouchableOpacity>
            )
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="bookmarks-outline" size={44} color={C.border} />
              <Text style={styles.emptyText}>Books you borrow show up here.</Text>
            </View>
          }
        />
      ) : loading ? (
        <ActivityIndicator color={C.cyan} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            renderBook(
              item,
              <TouchableOpacity
                style={[styles.actionBtn, onShelf(item.id) && styles.actionBtnDone]}
                disabled={borrowingId !== null}
                onPress={() => borrow(item)}
              >
                {borrowingId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name={onShelf(item.id) ? 'checkmark-circle' : 'download-outline'} size={16} color="#fff" />
                    <Text style={styles.actionText}>{onShelf(item.id) ? 'On shelf · Listen' : 'Borrow & listen'}</Text>
                  </>
                )}
              </TouchableOpacity>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  heading: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.border },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: C.purple },
  tabText: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 11 },
  note: { color: C.textMuted, fontSize: 12, marginTop: 10, lineHeight: 17 },
  error: { color: C.danger, fontSize: 13, marginTop: 10 },
  list: { paddingTop: 12, paddingBottom: 24 },
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
  actionBtnDone: { backgroundColor: C.blue },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: C.textMuted, fontSize: 14 },
});