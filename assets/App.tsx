import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TouchableWithoutFeedback, TextInput, Modal,
  Animated, Easing, Dimensions, StatusBar, FlatList, Image, Platform, LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';

import { C } from './src/Theme';
import { Icon } from './src/Icon';
import { cleanDocumentText, buildChunks, findNarrationStart } from './src/Text';
import {
  GOOGLE_VOICES, DEFAULT_ELEVEN_VOICE, CloudVoice, DeviceVoice, Keys, rankDeviceVoices, synthesize, fetchElevenVoices,
  playbackRateFor, playUri, tierColor, langLabel, releaseAudioUri, prepareAudioPlayback,
} from './src/Tts';
import { BookResult } from './src/Books';
import LibraryScreen, { ShelfItem } from './Libraryscreen';

const { width } = Dimensions.get('window');

const WAVE_BARS = 11;
const WAVE_COLORS = [C.magenta, '#C34BFB', C.purple, '#6F78FA', C.blue, '#2BB6F2', C.cyan, '#2BB6F2', C.blue, C.purple, C.magenta];
const SPEEDS = [0.8, 1.0, 1.25, 1.5, 2.0];

export default function App() {
  const defaultBook =
    `Chapter 1: The Modern Audiobook\n\n` +
    `Welcome to EchoReader. Open the Library tab to borrow a classic book, then press play. ` +
    `Notice how bracket citations [1] and footnotes [2, 3] are cleaned out automatically, so the narration flows uninterrupted.\n\n` +
    `Tap the narrator button to choose a natural cloud voice, adjust the speed, or switch to Read-Along mode in the top right.`;

  // --- content
  const [title, setTitle] = useState('The Modern Audiobook');
  const [author, setAuthor] = useState('EchoReader Edition');
  const [documentText, setDocumentText] = useState(cleanDocumentText(defaultBook));
  const [shelf, setShelf] = useState<ShelfItem[]>([]);

  // --- ui
  const [screen, setScreen] = useState<'listen' | 'library'>('listen');
  const [viewMode, setViewMode] = useState<'player' | 'reader'>('player');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [voiceTab, setVoiceTab] = useState<'cloud' | 'device'>('cloud');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [trackWidth, setTrackWidth] = useState(1);

  // --- playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [wordRange, setWordRange] = useState({ start: 0, length: 0 });
  const [error, setError] = useState<string | null>(null);

  // --- voices
  const envGoogle = (process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY as string | undefined) || '';
  const envEleven = (process.env.EXPO_PUBLIC_ELEVENLABS_KEY as string | undefined) || '';
  const [keys, setKeys] = useState<Keys>({ google: envGoogle, eleven: envEleven });
  const [keyInput, setKeyInput] = useState('');
  const [cloudTab, setCloudTab] = useState<'eleven' | 'google'>(envEleven || !envGoogle ? 'eleven' : 'google');
  const [elevenVoices, setElevenVoices] = useState<CloudVoice[]>([]);
  const [elevenLoading, setElevenLoading] = useState(false);
  const [engine, setEngine] = useState<'cloud' | 'device'>(envEleven || envGoogle ? 'cloud' : 'device');
  const [cloudVoice, setCloudVoice] = useState<CloudVoice>(envEleven ? DEFAULT_ELEVEN_VOICE : GOOGLE_VOICES[0]);
  const [deviceVoices, setDeviceVoices] = useState<DeviceVoice[]>([]);
  const [deviceVoice, setDeviceVoice] = useState<DeviceVoice | undefined>(undefined);

  const useCloud = engine === 'cloud' && keys[cloudVoice.provider].length > 0;
  const voiceName = useCloud ? cloudVoice.label : deviceVoice?.label || 'System voice';

  const sessionRef = useRef(0);
  const stopAudioRef = useRef<null | (() => void)>(null);
  const cacheRef = useRef<Map<string, Promise<string>>>(new Map());
  const clearAudioCache = () => {
    cacheRef.current.forEach((uri) => { void uri.then(releaseAudioUri).catch(() => {}); });
    cacheRef.current.clear();
  };
  const chunks = useMemo(() => buildChunks(documentText), [documentText]);
  const firstChapterIndex = useMemo(() => {
    const narrationStart = findNarrationStart(documentText);
    if (narrationStart === null) return 0;
    const index = chunks.findIndex((chunk) => chunk.end > narrationStart);
    return index < 0 ? 0 : index;
  }, [documentText, chunks]);
  const bookIntroPendingRef = useRef(true);

  const bars = useRef(Array.from({ length: WAVE_BARS }, () => new Animated.Value(8))).current;
  const ringPulse = useRef(new Animated.Value(0)).current;

  // load device voices
  useEffect(() => {
    (async () => {
      try {
        const ranked = rankDeviceVoices(await Speech.getAvailableVoicesAsync());
        setDeviceVoices(ranked);
        if (ranked[0]) setDeviceVoice(ranked[0]);
      } catch (e) { console.log('Voice load error', e); }
    })();
    return () => { stopAll(); };
  }, []);

  // load the ElevenLabs voices for this account
  useEffect(() => {
    if (!keys.eleven) { setElevenVoices([]); return; }
    setElevenLoading(true);
    fetchElevenVoices(keys.eleven)
      .then((v) => {
        setElevenVoices(v);
        setCloudVoice((cur) => (cur.provider === 'eleven' && v.some((x) => x.id === cur.id) ? cur : cur.provider === 'eleven' && v[0] ? v[0] : cur));
      })
      .catch((e) => setError(e?.message || 'Could not load ElevenLabs voices.'))
      .finally(() => setElevenLoading(false));
  }, [keys.eleven]);

  // new document -> reset
  useEffect(() => () => clearAudioCache(), [documentText]);

  // animations
  useEffect(() => {
    if (isPlaying) {
      const loops = bars.map((anim, i) => {
        const max = 20 + ((i * 7) % 5) * 9 + (i === 5 ? 14 : 0);
        const dur = 300 + ((i * 53) % 5) * 70;
        return Animated.loop(Animated.sequence([
          Animated.timing(anim, { toValue: max, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          Animated.timing(anim, { toValue: 8, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        ]));
      });
      const ring = Animated.loop(Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
      loops.forEach((l) => l.start());
      ring.start();
      return () => { loops.forEach((l) => l.stop()); ring.stop(); };
    }
    bars.forEach((a, i) => a.setValue(6 + (i === 5 ? 4 : 0)));
    ringPulse.setValue(0);
  }, [isPlaying]);

  // progress
  const currentChunk = chunks[chunkIndex];
  const currentOffset = currentChunk ? currentChunk.start : 0;
  const totalWords = documentText.split(/\s+/).filter(Boolean).length;
  const totalMinutes = Math.max(1, Math.round(totalWords / (160 * speechRate)));
  const progressPercent = Math.min(100, Math.round((currentOffset / Math.max(1, documentText.length)) * 100));

  // -------------------------------------------------------------------------
  // PLAYBACK ENGINE
  // -------------------------------------------------------------------------
  const stopAll = () => {
    sessionRef.current += 1;
    Speech.stop();
    stopAudioRef.current?.();
    stopAudioRef.current = null;
  };

  const playFrom = (
    startIdx: number,
    o: { rate?: number; cloudVoice?: CloudVoice; deviceVoice?: DeviceVoice; cloud?: boolean } = {}
  ) => {
    prepareAudioPlayback();
    stopAll();
    const session = sessionRef.current;
    const rate = o.rate ?? speechRate;
    const cv = o.cloudVoice ?? cloudVoice;
    const dv = o.deviceVoice ?? deviceVoice;
    const cloud = o.cloud ?? useCloud;
    const playbackStartIdx = startIdx === 0 ? firstChapterIndex : startIdx;

    setIsPlaying(true);
    setError(null);
    setWordRange({ start: 0, length: 0 });

    const synth = (i: number): Promise<string> => {
      const c = chunks[i];
      const key = `${cv.provider}|${cv.id}|${rate}|${i}`;
      if (!cacheRef.current.has(key)) {
        const p = synthesize(documentText.slice(c.start, c.end), cv, rate, keys);
        cacheRef.current.set(key, p);
        p.catch(() => cacheRef.current.delete(key));
      }
      return cacheRef.current.get(key)!;
    };

    const run = async (idx: number) => {
      if (session !== sessionRef.current) return;
      if (idx >= chunks.length) {
        setIsPlaying(false);
        setChunkIndex(firstChapterIndex);
        return;
      }
      if (idx === firstChapterIndex && bookIntroPendingRef.current) {
        bookIntroPendingRef.current = false;
        setChunkIndex(idx);
        const intro = `${title}, by ${author}.`;
        if (cloud) {
          setIsBuffering(true);
          try {
            const uri = await synthesize(intro, cv, rate, keys);
            if (session !== sessionRef.current) return;
            setIsBuffering(false);
            stopAudioRef.current = playUri(
              uri,
              () => { void run(idx); },
              playbackRateFor(cv, rate),
              (e) => {
                if (session !== sessionRef.current) return;
                setIsPlaying(false);
                setError(e instanceof Error ? e.message : 'Could not play generated audio.');
              }
            );
          } catch (e: any) {
            if (session !== sessionRef.current) return;
            setIsBuffering(false);
            setIsPlaying(false);
            setError(e?.message || 'Could not generate speech.');
          }
        } else {
          Speech.speak(intro, {
            voice: dv?.identifier,
            rate,
            pitch: 1.0,
            onDone: () => { void run(idx); },
            onError: () => { if (session === sessionRef.current) setIsPlaying(false); },
          });
        }
        return;
      }
      const c = chunks[idx];
      setChunkIndex(idx);
      setWordRange({ start: 0, length: 0 });

      if (cloud) {
        setIsBuffering(true);
        try {
          const uri = await synth(idx);
          if (session !== sessionRef.current) return;
          setIsBuffering(false);
          if (idx + 1 < chunks.length) synth(idx + 1).catch(() => {}); // prefetch next
          stopAudioRef.current = playUri(
            uri,
            () => run(idx + 1),
            playbackRateFor(cv, rate),
            (e) => {
              if (session !== sessionRef.current) return;
              setIsPlaying(false);
              setError(e instanceof Error ? e.message : 'Could not play generated audio.');
            }
          );
        } catch (e: any) {
          if (session !== sessionRef.current) return;
          setIsBuffering(false);
          setIsPlaying(false);
          setError(e?.message || 'Could not generate speech.');
        }
      } else {
        Speech.speak(documentText.slice(c.start, c.end), {
          voice: dv?.identifier,
          rate,
          pitch: 1.0,
          onBoundary: (ev: any) => {
            if (session !== sessionRef.current) return;
            if (ev?.charIndex !== undefined) setWordRange({ start: c.start + ev.charIndex, length: ev.charLength || 4 });
          },
          onDone: () => { void run(idx + 1); },
          onError: () => { if (session === sessionRef.current) setIsPlaying(false); },
        });
      }
    };
    run(playbackStartIdx);
  };

  const pause = () => {
    stopAll();
    setIsPlaying(false);
    setIsBuffering(false);
  };

  const togglePlayPause = () => (isPlaying ? pause() : playFrom(chunkIndex));

  const chunkAt = (pos: number) => {
    const i = chunks.findIndex((c) => c.end >= pos);
    return i === -1 ? Math.max(0, chunks.length - 1) : i;
  };

  const jumpTo = (idx: number) => {
    setChunkIndex(idx);
    if (isPlaying) playFrom(idx);
  };

  const skipSeconds = (s: number) => {
    const delta = Math.round(s * 15 * speechRate);
    jumpTo(chunkAt(Math.max(0, Math.min(documentText.length, currentOffset + delta))));
  };

  const seekToFraction = (f: number) => jumpTo(chunkAt(Math.round(Math.max(0, Math.min(1, f)) * documentText.length)));

  const handleSpeedChange = (rate: number) => {
    setSpeechRate(rate);
    if (isPlaying) playFrom(chunkIndex, { rate });
  };

  // -------------------------------------------------------------------------
  // VOICE SELECTION
  // -------------------------------------------------------------------------
  const audition = async (v: CloudVoice) => {
    prepareAudioPlayback();
    stopAll();
    setError(null);
    try {
      const uri = await synthesize('Hello, I will be your narrator.', v, speechRate, keys);
      const session = sessionRef.current;
      stopAudioRef.current = playUri(
        uri,
        () => {},
        playbackRateFor(v, speechRate),
        (e) => {
          if (session === sessionRef.current) setError(e instanceof Error ? e.message : 'Could not play a sample.');
        }
      );
    } catch (e: any) {
      setError(e?.message || 'Could not play a sample.');
    }
  };

  const pickCloudVoice = (v: CloudVoice) => {
    setCloudVoice(v);
    setEngine('cloud');
    if (!keys[v.provider]) return;
    if (isPlaying) playFrom(chunkIndex, { cloudVoice: v, cloud: true });
    else audition(v);
  };

  const pickDeviceVoice = (v: DeviceVoice) => {
    setDeviceVoice(v);
    setEngine('device');
    if (isPlaying) {
      playFrom(chunkIndex, { deviceVoice: v, cloud: false });
    } else {
      stopAll();
      Speech.speak('Hello, I will be your narrator.', { voice: v.identifier, rate: speechRate });
    }
  };

  const saveKey = () => {
    const key = keyInput.trim();
    if (!key) return;
    setKeys((prev) => ({ ...prev, [cloudTab]: key }));
    setCloudVoice(cloudTab === 'google' ? GOOGLE_VOICES[0] : DEFAULT_ELEVEN_VOICE);
    setEngine('cloud');
    setKeyInput('');
    setError(null);
  };

  // -------------------------------------------------------------------------
  // LIBRARY / TEXT
  // -------------------------------------------------------------------------
  const openText = (t: string, ttl: string, auth: string) => {
    pause();
    setDocumentText(cleanDocumentText(t));
    setTitle(ttl);
    setAuthor(auth);
    bookIntroPendingRef.current = true;
    setChunkIndex(0);
    setWordRange({ start: 0, length: 0 });
    setScreen('listen');
    setViewMode('player');
  };

  const onBorrow = (book: BookResult, text: string) => {
    setShelf((s) => (s.some((i) => i.book.id === book.id) ? s : [{ book, text }, ...s]));
    openText(text, book.title, book.author);
  };

  const onOpenShelf = (item: ShelfItem) => openText(item.text, item.book.title, item.book.author);

  const loadCustomText = () => {
    if (customInput.trim()) {
      openText(customInput, 'Custom note', 'Pasted text');
      setCustomInput('');
    }
    setIsEditModalOpen(false);
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  const logoSize = Math.min(width * 0.62, 270);

  const renderReader = () => {
    if (!currentChunk || (!isPlaying && chunkIndex === 0)) {
      return <Text style={[styles.readerParagraph, { color: C.text }]}>{documentText}</Text>;
    }
    const before = documentText.slice(0, currentChunk.start);
    const sentence = documentText.slice(currentChunk.start, currentChunk.end);
    const after = documentText.slice(currentChunk.end);
    const wStart = wordRange.start - currentChunk.start;
    const hasWord = wordRange.length > 0 && wStart >= 0 && wStart < sentence.length;
    return (
      <Text style={styles.readerParagraph}>
        <Text style={styles.readWords}>{before}</Text>
        {hasWord ? (
          <Text style={styles.activeSentence}>
            {sentence.slice(0, wStart)}
            <Text style={styles.activeWord}>{sentence.slice(wStart, wStart + wordRange.length)}</Text>
            {sentence.slice(wStart + wordRange.length)}
          </Text>
        ) : (
          <Text style={styles.activeSentence}>{sentence}</Text>
        )}
        <Text style={styles.unreadWords}>{after}</Text>
      </Text>
    );
  };

  const playBtnIcon = isBuffering ? null : isPlaying ? 'pause' : 'play';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* TOP BAR */}
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.roundBtn} onPress={() => setIsEditModalOpen(true)}>
          <Icon name="clipboard-outline" size={19} color={C.cyan} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Image source={require('./EchoReaderLogo.jpeg')} style={styles.headerLogo} />
          <View style={{ marginLeft: 10, flexShrink: 1 }}>
            <Text style={styles.headerBrand}>EchoReader</Text>
            <Text style={styles.headerBookTitle} numberOfLines={1}>{title}</Text>
          </View>
        </View>

        {screen === 'listen' ? (
          <TouchableOpacity
            style={[styles.modeToggle, viewMode === 'reader' && styles.modeToggleActive]}
            onPress={() => setViewMode(viewMode === 'player' ? 'reader' : 'player')}
          >
            <Icon name={viewMode === 'player' ? 'book-outline' : 'disc-outline'} size={16} color={viewMode === 'reader' ? '#fff' : C.cyan} />
            <Text style={[styles.modeToggleText, viewMode === 'reader' && { color: '#fff' }]}>
              {viewMode === 'player' ? 'Read' : 'Listen'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      {/* BODY */}
      {screen === 'library' ? (
        <LibraryScreen shelf={shelf} onBorrow={onBorrow} onOpen={onOpenShelf} />
      ) : viewMode === 'player' ? (
        <View style={styles.playerContainer}>
          <View style={styles.heroWrap}>
            <Animated.View
              pointerEvents="none"
              style={[styles.pulseRing, {
                width: logoSize, height: logoSize, borderRadius: logoSize / 2,
                opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) }],
              }]}
            />
            <View style={[styles.logoGlow, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
              <Image
                source={require('./EchoReaderLogo.jpeg')}
                style={{ width: logoSize, height: logoSize, borderRadius: logoSize / 2 }}
              />
            </View>
          </View>

          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.bookAuthor} numberOfLines={1}>{author}</Text>
          </View>

          <TouchableOpacity style={styles.voiceSelectorBtn} onPress={() => { setVoiceTab(useCloud ? 'cloud' : voiceTab); setIsVoiceModalOpen(true); }} activeOpacity={0.8}>
            <Icon name={useCloud ? 'sparkles' : 'phone-portrait-outline'} size={15} color={C.magenta} />
            <Text style={styles.voiceSelectorText} numberOfLines={1}>
              Narrator: <Text style={styles.voiceSelectorName}>{voiceName}</Text>
            </Text>
            <Icon name="chevron-forward" size={16} color={C.textMuted} />
          </TouchableOpacity>

          <View style={styles.waveformContainer}>
            {bars.map((anim, i) => (
              <Animated.View key={i} style={[styles.waveBar, { height: anim, backgroundColor: WAVE_COLORS[i] }]} />
            ))}
          </View>

          <View>
            <TouchableWithoutFeedback onPress={(e) => seekToFraction(e.nativeEvent.locationX / trackWidth)}>
              <View style={styles.trackHitArea} onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width || 1)}>
                <View style={styles.trackBackground}>
                  <View style={[styles.trackFill, { width: `${progressPercent}%` }]} />
                </View>
                <View style={[styles.trackThumb, { left: `${progressPercent}%` }]} />
              </View>
            </TouchableWithoutFeedback>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>{isBuffering ? 'Preparing voice…' : `${progressPercent}% listened`}</Text>
              <Text style={styles.timeLabel}>about {totalMinutes} min</Text>
            </View>
            {error && <Text style={styles.errorText} numberOfLines={3}>{error}</Text>}
          </View>

          <View style={styles.speedRow}>
            {SPEEDS.map((r) => (
              <TouchableOpacity key={r} style={[styles.speedChip, speechRate === r && styles.speedChipActive]} onPress={() => handleSpeedChange(r)}>
                <Text style={[styles.speedChipText, speechRate === r && { color: '#fff' }]}>{r}x</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.mainControls}>
            <TouchableOpacity style={styles.skipBtn} onPress={() => skipSeconds(-15)}>
              <Icon mci name="rewind-15" size={38} color={C.textDim} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.largePlayBtn} onPress={togglePlayPause} activeOpacity={0.85}>
              {playBtnIcon ? (
                <Icon name={playBtnIcon} size={36} color="#fff" style={{ marginLeft: isPlaying ? 0 : 4 }} />
              ) : (
                <ActivityIndicator color="#fff" size="large" />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={() => skipSeconds(15)}>
              <Icon mci name="fast-forward-15" size={38} color={C.textDim} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.readerScroll} showsVerticalScrollIndicator={false}>
            {renderReader()}
          </ScrollView>
          <View style={styles.miniPlayerBar}>
            <TouchableOpacity style={styles.miniPlayBtn} onPress={togglePlayPause}>
              {playBtnIcon ? <Icon name={playBtnIcon} size={22} color="#fff" style={{ marginLeft: isPlaying ? 0 : 2 }} /> : <ActivityIndicator color="#fff" />}
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.miniTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.miniSubtitle} numberOfLines={1}>
                {isBuffering ? 'Preparing voice…' : isPlaying ? 'Reading aloud' : 'Paused'} · {speechRate}x · {voiceName}
              </Text>
            </View>
            <TouchableOpacity style={{ padding: 6 }} onPress={() => skipSeconds(15)}>
              <Icon mci name="fast-forward-15" size={28} color={C.textDim} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* BOTTOM TABS */}
      <View style={styles.tabBar}>
        {([
          ['listen', 'Listen', 'headset'],
          ['library', 'Library', 'library'],
        ] as const).map(([key, label, icon]) => {
          const active = screen === key;
          return (
            <TouchableOpacity key={key} style={styles.tabItem} onPress={() => setScreen(key)}>
              <Icon name={active ? icon : `${icon}-outline`} size={22} color={active ? C.cyan : C.textMuted} />
              <Text style={[styles.tabLabel, active && { color: C.cyan }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* VOICE MODAL */}
      <Modal visible={isVoiceModalOpen} animationType="slide" transparent onRequestClose={() => setIsVoiceModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Choose a narrator</Text>
              <TouchableOpacity onPress={() => setIsVoiceModalOpen(false)} style={styles.closeBtn}>
                <Icon name="close" size={20} color={C.textDim} />
              </TouchableOpacity>
            </View>

            <View style={styles.segment}>
              {([['cloud', 'Natural (cloud)'], ['device', 'On this device']] as const).map(([k, l]) => (
                <TouchableOpacity key={k} style={[styles.segmentItem, voiceTab === k && styles.segmentActive]} onPress={() => setVoiceTab(k)}>
                  <Text style={[styles.segmentText, voiceTab === k && { color: '#fff' }]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {voiceTab === 'cloud' ? (
              <>
                <View style={styles.segment}>
                  {([['eleven', 'ElevenLabs'], ['google', 'Google']] as const).map(([k, l]) => (
                    <TouchableOpacity key={k} style={[styles.segmentItem, cloudTab === k && styles.segmentActive]} onPress={() => setCloudTab(k)}>
                      <Text style={[styles.segmentText, cloudTab === k && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!keys[cloudTab] && (
                  <View style={styles.tipCard}>
                    <Text style={styles.tipTitle}>Cloud voice not configured</Text>
                    <Text style={styles.tipText}>
                      {Platform.OS === 'web'
                        ? 'Enter your API key for this browser session. It stays in memory and is cleared when you reload or close the page.'
                        : `Add EXPO_PUBLIC_${cloudTab === 'eleven' ? 'ELEVENLABS' : 'GOOGLE_TTS'}_KEY to Api.env and restart the demo. You can also choose “On this device”.`}
                    </Text>
                    {Platform.OS === 'web' && (
                      <View style={styles.keyRow}>
                        <TextInput
                          style={styles.keyInput}
                          placeholder="API key (this session only)"
                          placeholderTextColor={C.textMuted}
                          value={keyInput}
                          onChangeText={setKeyInput}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry
                        />
                        <TouchableOpacity style={styles.keyBtn} onPress={saveKey}>
                          <Text style={styles.keyBtnText}>Use key</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {keys[cloudTab] && cloudTab === 'eleven' && elevenLoading && <ActivityIndicator color={C.cyan} style={{ marginVertical: 20 }} />}

                {keys[cloudTab] ? (
                  <FlatList
                    data={cloudTab === 'eleven' ? elevenVoices : GOOGLE_VOICES}
                    keyExtractor={(v) => v.provider + v.id}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const sel = useCloud && item.id === cloudVoice.id && item.provider === cloudVoice.provider;
                      return (
                        <TouchableOpacity style={[styles.voiceItem, sel && styles.voiceItemActive]} onPress={() => pickCloudVoice(item)} activeOpacity={0.8}>
                          <View style={[styles.voiceAvatar, sel && { backgroundColor: C.purple }]}>
                            <Icon name={item.gender === 'Female' ? 'woman-outline' : item.gender === 'Male' ? 'man-outline' : 'mic-outline'} size={20} color={sel ? '#fff' : C.textMuted} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.voiceName, sel && { color: C.cyan }]} numberOfLines={1}>{item.label}</Text>
                            <Text style={styles.voiceMeta} numberOfLines={1}>{item.gender} · {langLabel(item.lang)}</Text>
                          </View>
                          <View style={[styles.tierBadge, { borderColor: tierColor(item.tier) }]}>
                            <Text style={[styles.tierText, { color: tierColor(item.tier) }]}>{item.tier}</Text>
                          </View>
                          {sel && <Icon name="checkmark-circle" size={20} color={C.cyan} style={{ marginLeft: 8 }} />}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={!elevenLoading ? <Text style={styles.emptyText}>No voices found on this account.</Text> : undefined}
                  />
                ) : null}
              </>
            ) : (
              <FlatList
                data={deviceVoices}
                keyExtractor={(v) => v.identifier}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const sel = !useCloud && item.identifier === deviceVoice?.identifier;
                  return (
                    <TouchableOpacity style={[styles.voiceItem, sel && styles.voiceItemActive]} onPress={() => pickDeviceVoice(item)} activeOpacity={0.8}>
                      <View style={[styles.voiceAvatar, sel && { backgroundColor: C.purple }]}>
                        <Icon name="mic-outline" size={20} color={sel ? '#fff' : C.textMuted} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.voiceName, sel && { color: C.cyan }]} numberOfLines={1}>{item.label}</Text>
                        <Text style={styles.voiceMeta}>{langLabel(item.language)}</Text>
                      </View>
                      <View style={[styles.tierBadge, { borderColor: tierColor(item.tier) }]}>
                        <Text style={[styles.tierText, { color: tierColor(item.tier) }]}>{item.tier}</Text>
                      </View>
                      {sel && <Icon name="checkmark-circle" size={20} color={C.cyan} style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyText}>No extra voices found. EchoReader will use the system default.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* PASTE MODAL */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent onRequestClose={() => setIsEditModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { marginBottom: 14 }]}>Paste text to listen to</Text>
            <TextInput
              style={styles.modalTextInput}
              multiline
              placeholder="Paste an article, notes, or chapter text here…"
              placeholderTextColor={C.textMuted}
              value={customInput}
              onChangeText={setCustomInput}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsEditModalOpen(false)}>
                <Text style={{ color: C.textDim, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={loadCustomText}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Load text</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },

  topNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  roundBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', maxWidth: width * 0.5 },
  headerLogo: { width: 34, height: 34, borderRadius: 17 },
  headerBrand: { color: C.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  headerBookTitle: { color: C.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
  modeToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  modeToggleActive: { backgroundColor: C.purple, borderColor: C.magenta },
  modeToggleText: { color: C.cyan, fontSize: 12, fontWeight: '700' },

  playerContainer: { flex: 1, paddingHorizontal: 26, justifyContent: 'space-between', paddingTop: 14, paddingBottom: 10 },
  heroWrap: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', borderWidth: 2, borderColor: C.cyan },
  logoGlow: {
    shadowColor: C.purple, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 28,
    elevation: 24, backgroundColor: C.bg,
  },
  bookInfo: { alignItems: 'center' },
  bookTitle: { color: C.text, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  bookAuthor: { color: C.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4 },

  voiceSelectorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface,
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 22, alignSelf: 'center', maxWidth: '100%',
    borderWidth: 1, borderColor: C.border,
  },
  voiceSelectorText: { color: C.textDim, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  voiceSelectorName: { color: C.text, fontWeight: '800' },

  waveformContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, height: 58 },
  waveBar: { width: 6, borderRadius: 3 },

  trackHitArea: { height: 26, justifyContent: 'center' },
  trackBackground: { height: 6, backgroundColor: C.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: C.purple, borderRadius: 3 },
  trackThumb: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: C.cyan,
    shadowColor: C.cyan, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeLabel: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  errorText: { color: C.danger, fontSize: 12, marginTop: 6, textAlign: 'center' },

  speedRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  speedChip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  speedChipActive: { backgroundColor: C.purple, borderColor: C.magenta },
  speedChipText: { color: C.textMuted, fontSize: 12, fontWeight: '700' },

  mainControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 34 },
  skipBtn: { padding: 8 },
  largePlayBtn: {
    width: 78, height: 78, borderRadius: 39, backgroundColor: C.purple, borderWidth: 2, borderColor: C.magenta,
    justifyContent: 'center', alignItems: 'center', shadowColor: C.magenta, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 14,
  },

  readerScroll: { padding: 24, paddingBottom: 120 },
  readerParagraph: { fontSize: 20, lineHeight: 34, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  readWords: { color: C.textMuted },
  activeSentence: { color: C.text, backgroundColor: 'rgba(155, 92, 255, 0.22)' },
  activeWord: { backgroundColor: C.cyan, color: '#000', fontWeight: '800' },
  unreadWords: { color: C.textDim },
  miniPlayerBar: {
    position: 'absolute', bottom: 12, left: 16, right: 16, backgroundColor: C.surface, borderRadius: 22,
    flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: C.border,
    shadowColor: C.purple, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  miniPlayBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.purple, justifyContent: 'center', alignItems: 'center' },
  miniTitle: { color: C.text, fontWeight: '700', fontSize: 14 },
  miniSubtitle: { color: C.textMuted, fontSize: 12, marginTop: 2 },

  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg, paddingVertical: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: C.surface, borderRadius: 26, padding: 20, maxHeight: '86%', borderWidth: 1, borderColor: C.border },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: C.text, fontSize: 19, fontWeight: '800' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  segment: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 12, padding: 3, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: C.purple },
  segmentText: { color: C.textMuted, fontSize: 12, fontWeight: '700' },

  tipCard: { backgroundColor: C.surfaceAlt, borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.cyan },
  tipTitle: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  tipText: { color: C.textDim, fontSize: 12, lineHeight: 18 },
  keyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  keyInput: { flex: 1, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, color: C.text, borderWidth: 1, borderColor: C.border },
  keyBtn: { backgroundColor: C.purple, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  keyBtnText: { color: '#fff', fontWeight: '800' },

  voiceItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: C.bg,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
  },
  voiceItemActive: { borderColor: C.magenta, backgroundColor: C.surfaceAlt },
  voiceAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  voiceName: { color: C.text, fontSize: 15, fontWeight: '700' },
  voiceMeta: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  tierBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  tierText: { fontSize: 10, fontWeight: '800' },
  emptyText: { color: C.textMuted, textAlign: 'center', marginVertical: 20 },

  modalTextInput: {
    backgroundColor: C.bg, borderRadius: 14, padding: 16, color: C.text, fontSize: 15, height: 200,
    textAlignVertical: 'top', borderWidth: 1, borderColor: C.border,
  },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalCancelBtn: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.surfaceAlt },
  modalSaveBtn: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: 12, backgroundColor: C.purple },
});