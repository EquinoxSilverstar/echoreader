import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import {
  // @ts-expect-error Firebase exposes this on React Native but omits it from the shared types.
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';

export function initializeFirebaseAuth(app: FirebaseApp) {
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
