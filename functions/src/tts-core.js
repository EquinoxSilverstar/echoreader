const MAX_TEXT_LENGTH = 1800;
const MAX_DAILY_REQUESTS = 100;
const MAX_DAILY_CHARACTERS = 100_000;
const ALLOWED_ORIGINS = new Set([
  'https://equinoxsilverstar.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function respond(res, status, body, headers = {}) {
  Object.entries(headers).forEach(([name, value]) => res.set(name, value));
  return res.status(status).json(body);
}

function languageFromVoice(voice) {
  return voice.languageCodes?.[0] || 'en-US';
}

function googleVoices(data) {
  return (data.voices || []).map((voice) => {
    const name = voice.name || '';
    const premium = /neural2|studio|journey|chirp3/i.test(name);
    const enhanced = premium || /wavenet/i.test(name);
    return {
      provider: 'google',
      id: name,
      label: name,
      gender: voice.ssmlGender === 'FEMALE' ? 'Female' : voice.ssmlGender === 'MALE' ? 'Male' : 'Unknown',
      lang: languageFromVoice(voice),
      tier: premium ? 'Premium' : enhanced ? 'Enhanced' : 'Standard',
    };
  }).filter((voice) => voice.id);
}

function elevenVoices(data) {
  return (data.voices || []).map((voice) => {
    const labels = voice.labels || {};
    const category = voice.category || '';
    const premium = /professional|high_quality/i.test(category);
    const enhanced = premium || /cloned|generated/i.test(category);
    const gender = String(labels.gender || '').toLowerCase();
    const language = labels.language || voice.verified_languages?.[0]?.language || 'en';
    return {
      provider: 'eleven',
      id: voice.voice_id,
      label: voice.name || voice.voice_id,
      gender: gender === 'female' ? 'Female' : gender === 'male' ? 'Male' : 'Unknown',
      lang: language,
      tier: premium ? 'Premium' : enhanced ? 'Enhanced' : 'Standard',
    };
  }).filter((voice) => voice.id);
}

async function providerErrorMessage(response) {
  if (response.status === 429) return 'The cloud narrator is busy or its provider quota was reached. Try later or use a device voice.';
  if (response.status === 401 || response.status === 403) return 'The cloud narration provider is not authorized. Check its server configuration.';
  return 'The cloud narration provider is temporarily unavailable. Try later or use a device voice.';
}

function createTtsHandler({ auth, usage, getProviderKeys, fetchImpl = fetch, allowedOrigins = ALLOWED_ORIGINS }) {
  return async (req, res) => {
    const origin = req.get?.('origin') || req.headers?.origin;
    const corsHeaders = { Vary: 'Origin' };
    if (origin && allowedOrigins.has(origin)) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      corsHeaders['Access-Control-Max-Age'] = '3600';
    }

    if (origin && !allowedOrigins.has(origin)) {
      return respond(res, 403, { error: 'This origin is not allowed to use EchoReader cloud narration.' }, corsHeaders);
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).set(corsHeaders).send('');
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      return respond(res, 405, { error: 'Method not allowed.' }, { ...corsHeaders, Allow: 'GET, POST, OPTIONS' });
    }

    const authorization = req.get?.('authorization') || req.headers?.authorization || '';
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!token) return respond(res, 401, { error: 'Sign in to use cloud narration. Device voices work without signing in.' }, corsHeaders);

    let user;
    try {
      user = await auth.verifyIdToken(token, true);
    } catch {
      return respond(res, 401, { error: 'Your session has expired. Sign in again to use cloud narration.' }, corsHeaders);
    }

    const path = req.path || new URL(req.originalUrl || req.url, 'https://echoreader.invalid').pathname;

    try {
      const providerKeys = getProviderKeys();
      if (req.method === 'GET' && path === '/status') {
        return respond(res, 200, {
          providers: {
            eleven: Boolean(providerKeys.eleven),
            google: Boolean(providerKeys.google),
          },
          maxTextLength: MAX_TEXT_LENGTH,
          dailyRequestLimit: MAX_DAILY_REQUESTS,
          dailyCharacterLimit: MAX_DAILY_CHARACTERS,
        }, corsHeaders);
      }

      if (req.method === 'GET' && path === '/voices') {
        const provider = req.query?.provider;
        if (provider !== 'eleven' && provider !== 'google') throw new HttpError(400, 'Choose a supported voice provider.');
        const key = providerKeys[provider];
        if (!key) throw new HttpError(503, `${provider === 'eleven' ? 'ElevenLabs' : 'Google'} cloud narration is not configured. Device voices are still available.`);
        await usage.consume(user.uid, 0);

        const response = provider === 'eleven'
          ? await fetchImpl('https://api.elevenlabs.io/v2/voices?page_size=100', {
            headers: { 'xi-api-key': key },
            signal: AbortSignal.timeout(20_000),
          })
          : await fetchImpl('https://texttospeech.googleapis.com/v1/voices', {
            headers: { 'X-Goog-Api-Key': key },
            signal: AbortSignal.timeout(20_000),
          });
        if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, await providerErrorMessage(response));
        const data = await response.json();
        return respond(res, 200, {
          voices: provider === 'eleven' ? elevenVoices(data) : googleVoices(data),
        }, corsHeaders);
      }

      if (req.method === 'POST' && path === '/tts') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        const provider = body?.provider;
        const voiceId = body?.voiceId;
        const rate = body?.rate;
        if (!text || text.length > MAX_TEXT_LENGTH) {
          throw new HttpError(400, `Text must contain between 1 and ${MAX_TEXT_LENGTH} characters.`);
        }
        if (provider !== 'eleven' && provider !== 'google') throw new HttpError(400, 'Choose a supported voice provider.');
        if (typeof voiceId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(voiceId)) {
          throw new HttpError(400, 'Choose a valid voice.');
        }
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.5 || rate > 2) {
          throw new HttpError(400, 'Narration speed must be between 0.5x and 2x.');
        }
        const key = providerKeys[provider];
        if (!key) throw new HttpError(503, `${provider === 'eleven' ? 'ElevenLabs' : 'Google'} cloud narration is not configured. Use a device voice instead.`);

        await usage.consume(user.uid, text.length);
        const response = provider === 'eleven'
          ? await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
            signal: AbortSignal.timeout(30_000),
          })
          : await fetchImpl('https://texttospeech.googleapis.com/v1/text:synthesize', {
            method: 'POST',
            headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text },
              voice: { name: voiceId, languageCode: voiceId.split('-').slice(0, 2).join('-') },
              audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
            }),
            signal: AbortSignal.timeout(30_000),
          });

        if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, await providerErrorMessage(response));
        let audio;
        if (provider === 'eleven') {
          audio = Buffer.from(await response.arrayBuffer());
        } else {
          const data = await response.json();
          if (typeof data.audioContent !== 'string') throw new HttpError(502, 'The speech provider returned an invalid audio response.');
          audio = Buffer.from(data.audioContent, 'base64');
        }
        if (audio.length === 0 || audio.length > 8 * 1024 * 1024) {
          throw new HttpError(502, 'The speech provider returned audio that was empty or too large.');
        }
        res.set({ ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Content-Length': String(audio.length) });
        return res.status(200).send(audio);
      }

      return respond(res, 404, { error: 'Cloud narration endpoint not found.' }, corsHeaders);
    } catch (error) {
      if (error instanceof HttpError) return respond(res, error.status, { error: error.message }, corsHeaders);
      if (error?.name === 'SyntaxError') return respond(res, 400, { error: 'Request body must be valid JSON.' }, corsHeaders);
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return respond(res, 504, { error: 'The cloud narration provider timed out. Use a device voice or try again.' }, corsHeaders);
      }
      if (error?.code === 'resource-exhausted') {
        return respond(res, 429, { error: error.message || 'Your cloud narration usage limit has been reached. Try again later or use a device voice.' }, corsHeaders);
      }
      console.error('Cloud TTS request failed', { uid: user.uid, path, message: error instanceof Error ? error.message : 'Unknown error' });
      return respond(res, 500, { error: 'Cloud narration failed unexpectedly. Device voices are still available.' }, corsHeaders);
    }
  };
}

module.exports = {
  ALLOWED_ORIGINS,
  MAX_DAILY_CHARACTERS,
  MAX_DAILY_REQUESTS,
  MAX_TEXT_LENGTH,
  createTtsHandler,
};
