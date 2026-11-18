/**
 * EchoReader TTS module. Provider credentials stay in the authenticated
 * Firebase Functions backend; the client only receives its public endpoint.
 */
import { Platform } from 'react-native';
import type { Voice as ExpoVoice } from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from './FirebaseAuth';

export type Provider = 'google' | 'eleven';
export type VoiceTier = 'Premium' | 'Enhanced' | 'Standard';
export type CloudVoice = {
  provider: Provider;
  id: string;
  label: string;
  gender: 'Male' | 'Female' | 'Unknown';
  lang: string;
  tier: VoiceTier;
};
export type DeviceVoice = {
  identifier: string;
  label: string;
  language: string;
  tier: VoiceTier;
};
export type Keys = { google: boolean; eleven: boolean };

export const GOOGLE_VOICES: CloudVoice[] = [
  { provider: 'google', id: 'en-US-Neural2-F', label: 'US English — Neural2 F', gender: 'Female', lang: 'en-US', tier: 'Premium' },
  { provider: 'google', id: 'en-US-Neural2-D', label: 'US English — Neural2 D', gender: 'Male', lang: 'en-US', tier: 'Premium' },
  { provider: 'google', id: 'en-GB-Neural2-A', label: 'British English — Neural2 A', gender: 'Female', lang: 'en-GB', tier: 'Premium' },
  { provider: 'google', id: 'en-AU-Neural2-A', label: 'Australian English — Neural2 A', gender: 'Female', lang: 'en-AU', tier: 'Premium' },
];

export const DEFAULT_ELEVEN_VOICE: CloudVoice = {
  provider: 'eleven', id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George',
  gender: 'Male', lang: 'en', tier: 'Premium',
};

const PROXY_URL = (process.env.EXPO_PUBLIC_TTS_PROXY_URL || '').trim().replace(/\/+$/, '');
const temporaryUris = new Set<string>();

export function langLabel(code: string): string {
  if (!code) return 'Unknown language';
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    return displayNames.of(code) || code;
  } catch {
    return code;
  }
}

export function tierColor(tier: string): string {
  if (tier === 'Premium') return '#B88CFF';
  if (tier === 'Enhanced') return '#41D7E8';
  return '#9BA2B4';
}

export function rankDeviceVoices(voices: ExpoVoice[]): DeviceVoice[] {
  const converted: DeviceVoice[] = voices.map((voice) => {
    const name = voice.name || voice.identifier;
    const premium = /neural|natural|enhanced|premium/i.test(name);
    const enhanced = premium || String(voice.quality).toLowerCase().includes('enhanced');
    return {
      identifier: voice.identifier,
      label: name,
      language: voice.language || 'en-US',
      tier: premium ? 'Premium' : enhanced ? 'Enhanced' : 'Standard',
    };
  });
  const score = (v: DeviceVoice) =>
    (/^en\b/i.test(v.language) ? 10 : 0) +
    (v.tier === 'Premium' ? 3 : v.tier === 'Enhanced' ? 2 : 1);
  return converted.sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label));
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to use cloud narration. Device voices work without signing in.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function proxyRequest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!PROXY_URL) throw new Error('Secure cloud narration is not configured. Device voices remain available.');
  const response = await fetch(`${PROXY_URL}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers as Record<string, string> || {}) },
  });
  if (!response.ok) {
    let message = `Cloud narration failed (${response.status})`;
    try {
      const body: { error?: string } = await response.json();
      if (body.error) message = body.error;
    } catch {
      // Some proxies return a non-JSON error body.
    }
    throw new Error(message);
  }
  return response;
}

export async function fetchTtsStatus(): Promise<Keys> {
  const response = await proxyRequest('/status');
  const body = (await response.json()) as { providers?: Partial<Keys> };
  if (typeof body.providers?.google !== 'boolean' || typeof body.providers.eleven !== 'boolean') {
    throw new Error('The secure narration service returned an invalid status.');
  }
  return { google: body.providers.google, eleven: body.providers.eleven };
}

async function fetchCloudVoices(provider: Provider): Promise<CloudVoice[]> {
  const response = await proxyRequest(`/voices?provider=${provider}`);
  const body = (await response.json()) as { voices?: CloudVoice[] };
  if (!Array.isArray(body.voices)) throw new Error('The secure narration service returned an invalid voice list.');
  return body.voices;
}

export async function fetchElevenVoices(): Promise<CloudVoice[]> {
  return fetchCloudVoices('eleven');
}

export async function fetchGoogleVoices(): Promise<CloudVoice[]> {
  return fetchCloudVoices('google');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    result += alphabet[(triple >>> 18) & 63];
    result += alphabet[(triple >>> 12) & 63];
    result += hasB ? alphabet[(triple >>> 6) & 63] : '=';
    result += hasC ? alphabet[triple & 63] : '=';
  }
  return result;
}

async function audioUriFromResponse(response: Response): Promise<string> {
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The speech service returned empty audio.');
  if (Platform.OS === 'web') {
    const uri = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    temporaryUris.add(uri);
    return uri;
  }
  if (!FileSystem.cacheDirectory) throw new Error('Audio cache is unavailable on this device.');
  const uri = `${FileSystem.cacheDirectory}echoreader-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  temporaryUris.add(uri);
  return uri;
}

/** Rate for playback. Google API renders the speed during synthesis. */
export function playbackRateFor(voice: CloudVoice, rate: number): number {
  return voice.provider === 'google' ? 1 : Math.min(2, Math.max(0.5, rate));
}

export async function synthesize(text: string, voice: CloudVoice, rate: number): Promise<string> {
  if (!text.trim()) throw new Error('There is no text to narrate.');
  if (text.length > 1800) throw new Error('Narration chunk is too long. Split it into pieces of up to 1,800 characters.');
  // All cloud requests, including native, go through the authenticated backend.
  const response = await proxyRequest('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, provider: voice.provider, voiceId: voice.id, rate }),
  });
  return audioUriFromResponse(response);
}

export function releaseAudioUri(uri: string): void {
  if (!temporaryUris.has(uri)) return;
  temporaryUris.delete(uri);
  if (Platform.OS === 'web') {
    URL.revokeObjectURL(uri);
  } else {
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

/** Call from the user's play/tap event, before the asynchronous TTS fetch. */
export function prepareAudioPlayback(): void {
  if (Platform.OS !== 'web') {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }
}

/** Plays an mp3 URI and returns a synchronous cancellation function. */
export function playUri(
  uri: string,
  onDone: () => void,
  rate = 1,
  onError: (error: Error) => void = () => undefined,
): () => void {
  const speed = Math.max(0.5, Math.min(2, rate));
  if (Platform.OS === 'web') {
    const player = new Audio(uri);
    player.playbackRate = speed;
    player.onended = () => { cleanup(); onDone(); };
    player.onerror = () => { cleanup(); onError(new Error('Audio could not be played in this browser.')); };
    const cleanup = () => { player.onended = null; player.onerror = null; };
    void player.play().catch((err: unknown) => {
      cleanup();
      onError(new Error(err instanceof Error ? err.message : 'Browser blocked audio playback. Press Play again.'));
    });
    return () => { cleanup(); player.pause(); player.src = ''; };
  }

  let cancelled = false;
  let finished = false;
  let player: AudioPlayer | undefined;
  let statusSubscription: { remove: () => void } | undefined;
  const cleanup = () => {
    statusSubscription?.remove();
    statusSubscription = undefined;
    player?.remove();
    player = undefined;
  };

  try {
    player = createAudioPlayer({ uri }, { updateInterval: 100 });
    statusSubscription = player.addListener('playbackStatusUpdate', (status) => {
      if (cancelled || finished) return;
      if (status.error) {
        cancelled = true;
        cleanup();
        onError(new Error(status.error));
      } else if (status.didJustFinish) {
        finished = true;
        cleanup();
        onDone();
      }
    });
    player.setPlaybackRate(speed, 'high');
    player.play();
  } catch (err) {
    cleanup();
    onError(err instanceof Error ? err : new Error('Could not play audio.'));
  }

  return () => {
    cancelled = true;
    if (player) {
      try {
        player.pause();
      } finally {
        cleanup();
      }
    } else {
      cleanup();
    }
  };
}