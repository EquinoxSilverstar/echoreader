import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseAuth } from './FirebasePersistence';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim(),
};

function getConfiguredAuth() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    return null;
  }

  const existingApp = getApps().find((app) => app.name === 'EchoReader');
  return existingApp
    ? getAuth(existingApp)
    : initializeFirebaseAuth(initializeApp(config, 'EchoReader'));
}

export const auth = getConfiguredAuth();

export function authErrorCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
}
