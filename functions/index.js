const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineJsonSecret } = require('firebase-functions/params');
const { createTtsHandler } = require('./src/tts-core');

if (getApps().length === 0) initializeApp();

const providerKeysSecret = defineJsonSecret('TTS_PROVIDER_KEYS');
const db = getFirestore();

const usage = {
  async consume(uid, characterCount) {
    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const dayBucket = new Date(now).toISOString().slice(0, 10);
    const ref = db.collection('ttsUsage').doc(uid);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const previous = snapshot.exists ? snapshot.data() : {};
      const minuteRequests = previous.minuteBucket === minuteBucket ? previous.minuteRequests || 0 : 0;
      const dailyRequests = previous.dayBucket === dayBucket ? previous.dailyRequests || 0 : 0;
      const dailyCharacters = previous.dayBucket === dayBucket ? previous.dailyCharacters || 0 : 0;

      if (minuteRequests >= 10) {
        const error = new Error('You are sending cloud narration requests too quickly. Wait a minute and try again.');
        error.code = 'resource-exhausted';
        throw error;
      }
      if (dailyRequests >= 100 || dailyCharacters + characterCount > 100_000) {
        const error = new Error('Your daily cloud narration limit has been reached. Use a device voice or try again tomorrow.');
        error.code = 'resource-exhausted';
        throw error;
      }

      transaction.set(ref, {
        minuteBucket,
        minuteRequests: minuteRequests + 1,
        dayBucket,
        dailyRequests: dailyRequests + 1,
        dailyCharacters: dailyCharacters + characterCount,
        updatedAt: new Date().toISOString(),
      });
    });
  },
};

exports.ttsGateway = onRequest({
  region: 'us-central1',
  memory: '512MiB',
  timeoutSeconds: 45,
  maxInstances: 3,
  concurrency: 10,
  secrets: [providerKeysSecret],
}, createTtsHandler({
  auth: getAuth(),
  usage,
  getProviderKeys: () => {
    const configured = providerKeysSecret.value();
    if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
      throw new Error('TTS_PROVIDER_KEYS must be a JSON object.');
    }
    const readKey = (name) => {
      const key = configured[name];
      if (key !== undefined && typeof key !== 'string') {
        throw new Error(`TTS_PROVIDER_KEYS.${name} must be a string.`);
      }
      return (key || '').trim();
    };
    return {
      eleven: readKey('eleven'),
      google: readKey('google'),
    };
  },
}));
