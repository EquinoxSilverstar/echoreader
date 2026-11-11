import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';
import { C } from './Theme';

// ---------------------------------------------------------------------------
// CLOUD VOICES — Google Cloud Text-to-Speech (free monthly allowance)
// ---------------------------------------------------------------------------
export type Provider = 'google' | 'eleven';
export type Keys = { google: string; eleven: string };

export interface CloudVoice {
  id: string;
  label: string;
  lang: string; // e.g. en-US, or an accent label for ElevenLabs
  tier: string;
  gender: string;
  provider: Provider;
}

const GOOGLE_RAW: Omit<CloudVoice, 'provider'>[] = [
  { id: 'en-US-Chirp3-HD-Aoede', label: 'Aoede', lang: 'en-US', tier: 'Chirp 3 HD', gender: 'Female' },
  { id: 'en-US-Chirp3-HD-Charon', label: 'Charon', lang: 'en-US', tier: 'Chirp 3 HD', gender: 'Male' },
  { id: 'en-US-Chirp3-HD-Kore', label: 'Kore', lang: 'en-US', tier: 'Chirp 3 HD', gender: 'Female' },
  { id: 'en-US-Chirp3-HD-Puck', label: 'Puck', lang: 'en-US', tier: 'Chirp 3 HD', gender: 'Male' },
  { id: 'en-US-Chirp3-HD-Leda', label: 'Leda', lang: 'en-US', tier: 'Chirp 3 HD', gender: 'Female' },
  { id: 'en-US-Chirp3-HD-Fenrir', label: 'Fenrir', lang: 'en-US', tier: 'Chirp 3 HD', gender: 'Male' },
  { id: 'en-US-Neural2-F', label: 'Neural US · Female', lang: 'en-US', tier: 'Neural2', gender: 'Female' },
  { id: 'en-US-Neural2-J', label: 'Neural US · Male', lang: 'en-US', tier: 'Neural2', gender: 'Male' },
  { id: 'en-GB-Neural2-A', label: 'Neural UK · Female', lang: 'en-GB', tier: 'Neural2', gender: 'Female' },
  { id: 'en-GB-Neural2-B', label: 'Neural UK · Male', lang: 'en-GB', tier: 'Neural2', gender: 'Male' },
];
export const GOOGLE_VOICES: CloudVoice[] = GOOGLE_RAW.map((v) => ({ ...v, provider: 'google' as const }));

// ---------------------------------------------------------------------------
// ELEVENLABS — https://elevenlabs.io  (free plan: 10k credits/month, non-commercial)
// Flash v2.5 costs 0.5 credit per character (~20 min free audio per month).
// Swap to 'eleven_multilingual_v2' for richer narration at 2x the credits.
// ---------------------------------------------------------------------------
const ELEVEN_MODEL = 'eleven_flash_v2_5';
export const DEFAULT_ELEVEN_VOICE: CloudVoice = {
  id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George', lang: 'British', tier: 'ElevenLabs', gender: 'Male', provider: 'eleven',
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toBase64 = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
};

const fromBase64 = (value: string) => {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const saveAudio = async (base64: string, fileName: string): Promise<string> => {
  if (Platform.OS === 'web') {
    const bytes = fromBase64(base64);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }));
  }

  // expo-file-system moved its classic API to /legacy in SDK 54.
  let FS: any;
  try { FS = require('expo-file-system/legacy'); } catch { FS = require('expo-file-system'); }
  const uri = `${FS.cacheDirectory}${fileName}`;
  await FS.writeAsStringAsync(uri, base64, { encoding: 'base64' });
  return uri;
};

export const releaseAudioUri = (uri: string) => {
  if (Platform.OS === 'web' && uri.startsWith('blob:')) URL.revokeObjectURL(uri);
};

const clampEleven = (r: number) => Math.min(1.2, Math.max(0.7, r));

/** Voices available on the user's ElevenLabs account. */
export async function fetchElevenVoices(apiKey: string): Promise<CloudVoice[]> {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(res.status === 401 ? 'Invalid ElevenLabs API key.' : `ElevenLabs error (${res.status})`);
  const json = await res.json();
  return (json.voices || []).map((v: any): CloudVoice => {
    const g = String(v.labels?.gender || '');
    return {
      id: v.voice_id,
      label: v.name,
      lang: v.labels?.accent ? String(v.labels.accent) : 'English',
      tier: 'ElevenLabs',
      gender: g ? g[0].toUpperCase() + g.slice(1) : 'Voice',
      provider: 'eleven',
    };
  });
}

export async function synthesizeEleven(text: string, voiceId: string, rate: number, apiKey: string): Promise<string> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: clampEleven(rate) },
    }),
  });
  if (!res.ok) {
    let msg = `ElevenLabs error (${res.status})`;
    try {
      const j = await res.json();
      const d = j?.detail;
      msg = typeof d === 'string' ? d : d?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return saveAudio(toBase64(bytes), `echo11_${hash(`${voiceId}|${rate}|${text}`)}.mp3`);
}

/** One entry point for any cloud voice. */
export const synthesize = (text: string, v: CloudVoice, rate: number, keys: Keys) =>
  v.provider === 'eleven'
    ? synthesizeEleven(text, v.id, rate, keys.eleven)
    : synthesizeToFile(text, v.id, rate, keys.google);

/** ElevenLabs only speeds up to 1.2x natively; the player covers the rest. */
export const playbackRateFor = (v: CloudVoice, rate: number) =>
  v.provider === 'eleven' ? rate / clampEleven(rate) : 1;

let audioReady = false;
let browserAudioContext: AudioContext | null = null;
let browserAudioReady: Promise<void> = Promise.resolve();

export const prepareAudioPlayback = () => {
  if (Platform.OS !== 'web') return;
  try {
    browserAudioContext ??= new AudioContext();
    browserAudioReady = browserAudioContext.state === 'suspended'
      ? browserAudioContext.resume()
      : Promise.resolve();
    browserAudioReady.catch(() => {});
  } catch (e) {
    browserAudioReady = Promise.reject(e);
    browserAudioReady.catch(() => {});
  }
};

const ensureAudioMode = async () => {
  if (audioReady) return;
  audioReady = true;
  try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
};

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Calls Google TTS, saves the MP3 to cache, returns the file uri. */
export async function synthesizeToFile(text: string, voiceId: string, rate: number, apiKey: string): Promise<string> {
  const lang = voiceId.split('-').slice(0, 2).join('-');
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang, name: voiceId },
      audioConfig: { audioEncoding: 'MP3', speakingRate: Math.min(2, Math.max(0.5, rate)) },
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.audioContent) {
    throw new Error(json?.error?.message || `Text-to-speech failed (${res.status})`);
  }
  return saveAudio(json.audioContent, `echo_${hash(`${voiceId}|${rate}|${text}`)}.mp3`);
}

/** Plays an audio file once. Returns a stop() function. */
export function playUri(
  uri: string,
  onDone: () => void,
  playbackRate = 1,
  onError: (error: unknown) => void = (error) => console.error('Audio playback failed', error)
): () => void {
  if (Platform.OS === 'web') {
    const context = browserAudioContext ?? new AudioContext();
    browserAudioContext = context;
    let stopped = false;
    let source: AudioBufferSourceNode | null = null;
    void (async () => {
      try {
        await browserAudioReady;
        const response = await fetch(uri);
        if (!response.ok) throw new Error(`Could not load generated audio (${response.status})`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (stopped) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        source.connect(context.destination);
        source.onended = () => {
          if (stopped) return;
          stopped = true;
          onDone();
        };
        source.start();
      } catch (e) {
        if (!stopped) {
          stopped = true;
          onError(e);
        }
      }
    })();
    return () => {
      stopped = true;
      try { source?.stop(); source?.disconnect(); } catch {}
    };
  }

  ensureAudioMode();
  const player = createAudioPlayer({ uri });
  let finished = false;
  const sub = player.addListener('playbackStatusUpdate', (s: any) => {
    if (s?.didJustFinish && !finished) {
      finished = true;
      try { sub.remove(); player.remove(); } catch {}
      onDone();
    }
  });
  if (playbackRate !== 1) { try { player.setPlaybackRate(playbackRate); } catch {} }
  player.play();
  return () => {
    finished = true;
    try { sub.remove(); player.remove(); } catch {}
  };
}

// ---------------------------------------------------------------------------
// ON-DEVICE VOICES (fallback, works offline)
// ---------------------------------------------------------------------------
export interface DeviceVoice {
  identifier: string;
  name: string;
  language: string;
  label: string;
  tier: 'Premium' | 'Enhanced' | 'Natural' | 'Standard';
  score: number;
}

const LANG_LABELS: Record<string, string> = {
  'en-us': 'US English', 'en-gb': 'British English', 'en-au': 'Australian English',
  'en-in': 'Indian English', 'en-za': 'South African English', 'en-ie': 'Irish English',
  'en-ca': 'Canadian English', 'en-nz': 'New Zealand English',
};
export const langLabel = (l: string) => LANG_LABELS[l.replace('_', '-').toLowerCase()] || l;

export const rankDeviceVoices = (raw: Speech.Voice[]): DeviceVoice[] => {
  const counters: Record<string, number> = {};
  return raw
    .filter((v) => v.language?.toLowerCase().startsWith('en'))
    .filter((v) => {
      const id = v.identifier.toLowerCase();
      return !id.includes('com.apple.speech.synthesis.voice') && !id.includes('eloquence');
    })
    .map((v) => {
      const id = v.identifier.toLowerCase();
      const q = String(v.quality || '').toLowerCase();
      const lang = v.language.replace('_', '-').toLowerCase();
      let tier: DeviceVoice['tier'] = 'Standard';
      let score = 10;
      if (id.includes('premium')) { tier = 'Premium'; score = 100; }
      else if (id.includes('siri')) { tier = 'Natural'; score = 90; }
      else if (id.includes('neural')) { tier = 'Natural'; score = 85; }
      else if (q === 'enhanced' || id.includes('enhanced')) { tier = 'Enhanced'; score = 80; }
      else if (id.includes('network')) { tier = 'Natural'; score = 70; }
      else if (id.includes('compact')) score = 5;
      if (lang === 'en-us') score += 3; else if (lang === 'en-gb') score += 2; else if (lang === 'en-au') score += 1;
      return { v, tier, score, lang };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ v, tier, score, lang }) => {
      const cryptic = v.name.includes('-x-') || v.name === v.identifier || /^[a-z]{2}-[a-z]{2}/i.test(v.name);
      let label = v.name;
      if (cryptic) {
        counters[lang] = (counters[lang] || 0) + 1;
        label = `${langLabel(lang)} · Voice ${counters[lang]}`;
      }
      return { identifier: v.identifier, name: v.name, language: v.language, label, tier, score };
    });
};

export const tierColor = (tier: string) =>
  tier === 'Premium' || tier === 'Chirp 3 HD' ? C.magenta
  : tier === 'ElevenLabs' ? C.cyan
  : tier === 'Enhanced' || tier === 'Neural2' ? C.purple
  : tier === 'Natural' ? C.cyan
  : C.textMuted;