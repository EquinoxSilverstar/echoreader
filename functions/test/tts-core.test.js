const test = require('node:test');
const assert = require('node:assert/strict');
const { createTtsHandler } = require('../src/tts-core');

function makeRequest({ method = 'GET', path = '/status', origin, authorization, query = {}, body } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (authorization) headers.authorization = authorization;
  return {
    method,
    path,
    query,
    body,
    headers,
    get(name) { return headers[name.toLowerCase()]; },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(name, value) {
      if (typeof name === 'object') Object.assign(this.headers, name);
      else this.headers[name] = value;
      return this;
    },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function makeHandler({ providerKeys = { eleven: '', google: '' }, fetchImpl = async () => { throw new Error('fetch should not be called'); }, consume = async () => {} } = {}) {
  return createTtsHandler({
    auth: { verifyIdToken: async (token) => {
      if (token !== 'valid-token') throw new Error('invalid token');
      return { uid: 'user-123' };
    } },
    usage: { consume },
    getProviderKeys: () => providerKeys,
    fetchImpl,
  });
}

test('requires a valid Firebase bearer token for provider status', async () => {
  const handler = makeHandler();
  const missing = makeResponse();
  await handler(makeRequest(), missing);
  assert.equal(missing.statusCode, 401);

  const invalid = makeResponse();
  await handler(makeRequest({ authorization: 'Bearer invalid-token' }), invalid);
  assert.equal(invalid.statusCode, 401);
});

test('only allows configured browser origins while accepting native requests without Origin', async () => {
  const handler = makeHandler();
  const blocked = makeResponse();
  await handler(makeRequest({ origin: 'https://attacker.example', authorization: 'Bearer valid-token' }), blocked);
  assert.equal(blocked.statusCode, 403);

  const allowed = makeResponse();
  await handler(makeRequest({ origin: 'https://equinoxsilverstar.github.io', authorization: 'Bearer valid-token' }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['Access-Control-Allow-Origin'], 'https://equinoxsilverstar.github.io');

  const native = makeResponse();
  await handler(makeRequest({ authorization: 'Bearer valid-token' }), native);
  assert.equal(native.statusCode, 200);
});

test('reports server-side provider configuration without exposing credentials', async () => {
  const handler = makeHandler({ providerKeys: { eleven: 'private-eleven-key', google: '' } });
  const response = makeResponse();
  await handler(makeRequest({ authorization: 'Bearer valid-token' }), response);
  assert.deepEqual(response.body.providers, { eleven: true, google: false });
  assert.equal(JSON.stringify(response.body).includes('private-eleven-key'), false);
});

test('rejects invalid text and unknown providers before charging usage', async () => {
  let charged = false;
  const handler = makeHandler({ consume: async () => { charged = true; } });
  const invalid = makeResponse();
  await handler(makeRequest({ method: 'POST', path: '/tts', authorization: 'Bearer valid-token', body: { text: '', provider: 'google', voiceId: 'en-US-Neural2-F', rate: 1 } }), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(charged, false);

  const unknown = makeResponse();
  await handler(makeRequest({ method: 'POST', path: '/tts', authorization: 'Bearer valid-token', body: { text: 'Read this.', provider: 'other', voiceId: 'voice', rate: 1 } }), unknown);
  assert.equal(unknown.statusCode, 400);
});

test('does not call providers when their server secret is missing', async () => {
  const handler = makeHandler();
  const response = makeResponse();
  await handler(makeRequest({ method: 'POST', path: '/tts', authorization: 'Bearer valid-token', body: { text: 'Read this sentence.', provider: 'eleven', voiceId: 'voice-1', rate: 1 } }), response);
  assert.equal(response.statusCode, 503);
  assert.match(response.body.error, /device voice/i);
});

test('discovers Google voices across supported language codes', async () => {
  let requestUrl = '';
  const handler = makeHandler({
    providerKeys: { eleven: '', google: 'private-google-key' },
    fetchImpl: async (url, init) => {
      requestUrl = url;
      assert.equal(init.headers['X-Goog-Api-Key'], 'private-google-key');
      return {
        ok: true,
        json: async () => ({
          voices: [{
            name: 'en-GB-Neural2-A',
            languageCodes: ['en-GB'],
            ssmlGender: 'FEMALE',
          }],
        }),
      };
    },
  });
  const response = makeResponse();
  await handler(makeRequest({
    authorization: 'Bearer valid-token',
    path: '/voices',
    query: { provider: 'google' },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(requestUrl, 'https://texttospeech.googleapis.com/v1/voices');
  assert.deepEqual(response.body.voices[0], {
    provider: 'google',
    id: 'en-GB-Neural2-A',
    label: 'en-GB-Neural2-A',
    gender: 'Female',
    lang: 'en-GB',
    tier: 'Premium',
  });
});

test('generates Google MP3 audio through the provider and accounts for text usage', async () => {
  let chargedCharacters = 0;
  let requestUrl = '';
  let requestBody;
  let requestHeaders;
  const handler = makeHandler({
    providerKeys: { eleven: '', google: 'private-google-key' },
    consume: async (uid, characters) => {
      assert.equal(uid, 'user-123');
      chargedCharacters = characters;
    },
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestBody = JSON.parse(init.body);
      requestHeaders = init.headers;
      return { ok: true, json: async () => ({ audioContent: Buffer.from('fake-mp3').toString('base64') }) };
    },
  });
  const response = makeResponse();
  const text = 'Read this.';
  await handler(makeRequest({ method: 'POST', path: '/tts', authorization: 'Bearer valid-token', body: { text, provider: 'google', voiceId: 'en-US-Neural2-F', rate: 1.25 } }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'audio/mpeg');
  assert.equal(Buffer.from(response.body).toString(), 'fake-mp3');
  assert.equal(chargedCharacters, text.length);
  assert.equal(requestUrl, 'https://texttospeech.googleapis.com/v1/text:synthesize');
  assert.equal(requestHeaders['X-Goog-Api-Key'], 'private-google-key');
  assert.deepEqual(requestBody.voice, { name: 'en-US-Neural2-F', languageCode: 'en-US' });
  assert.equal(requestBody.audioConfig.speakingRate, 1.25);
});

test('discovers ElevenLabs voices and synthesizes audio without returning provider credentials', async () => {
  const calls = [];
  const handler = makeHandler({
    providerKeys: { eleven: 'private-eleven-key', google: '' },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (init.method === 'POST') {
        return { ok: true, arrayBuffer: async () => Buffer.from('eleven-mp3') };
      }
      return {
        ok: true,
        json: async () => ({
          voices: [{
            voice_id: 'voice-123',
            name: 'Example Voice',
            category: 'professional',
            labels: { gender: 'female', language: 'en' },
          }],
        }),
      };
    },
  });

  const voices = makeResponse();
  await handler(makeRequest({
    authorization: 'Bearer valid-token',
    path: '/voices',
    query: { provider: 'eleven' },
  }), voices);
  assert.equal(voices.statusCode, 200);
  assert.deepEqual(voices.body.voices[0], {
    provider: 'eleven',
    id: 'voice-123',
    label: 'Example Voice',
    gender: 'Female',
    lang: 'en',
    tier: 'Premium',
  });

  const audio = makeResponse();
  await handler(makeRequest({
    method: 'POST',
    path: '/tts',
    authorization: 'Bearer valid-token',
    body: { text: 'Read this.', provider: 'eleven', voiceId: 'voice-123', rate: 1.1 },
  }), audio);
  assert.equal(audio.statusCode, 200);
  assert.equal(Buffer.from(audio.body).toString(), 'eleven-mp3');
  assert.match(calls[1].url, /\/v1\/text-to-speech\/voice-123\?/);
  assert.equal(calls[1].init.headers['xi-api-key'], 'private-eleven-key');
  assert.equal(JSON.parse(calls[1].init.body).text, 'Read this.');
  assert.equal(JSON.stringify(voices.body).includes('private-eleven-key'), false);
});

test('returns a client error for malformed JSON and invalid narration speed', async () => {
  const handler = makeHandler({ providerKeys: { eleven: '', google: 'configured' } });
  const malformed = makeResponse();
  await handler(makeRequest({
    method: 'POST',
    path: '/tts',
    authorization: 'Bearer valid-token',
    body: '{',
  }), malformed);
  assert.equal(malformed.statusCode, 400);

  const invalidSpeed = makeResponse();
  await handler(makeRequest({
    method: 'POST',
    path: '/tts',
    authorization: 'Bearer valid-token',
    body: { text: 'Read this.', provider: 'google', voiceId: 'en-US-Neural2-F', rate: 3 },
  }), invalidSpeed);
  assert.equal(invalidSpeed.statusCode, 400);
});

test('converts an upstream quota response into a useful limited error', async () => {
  const handler = makeHandler({
    providerKeys: { eleven: 'configured', google: '' },
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  const response = makeResponse();
  await handler(makeRequest({ method: 'GET', path: '/voices', query: { provider: 'eleven' }, authorization: 'Bearer valid-token' }), response);
  assert.equal(response.statusCode, 429);
  assert.match(response.body.error, /quota/i);
});

test('returns a rate-limit error when the per-user usage store rejects a request', async () => {
  const handler = makeHandler({
    providerKeys: { eleven: '', google: 'configured' },
    consume: async () => {
      const error = new Error('Daily quota exceeded.');
      error.code = 'resource-exhausted';
      throw error;
    },
  });
  const response = makeResponse();
  await handler(makeRequest({ method: 'GET', path: '/voices', query: { provider: 'google' }, authorization: 'Bearer valid-token' }), response);
  assert.equal(response.statusCode, 429);
  assert.equal(response.body.error, 'Daily quota exceeded.');
});
