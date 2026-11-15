import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

export function initializeFirebaseAuth(app: FirebaseApp) {
  return getAuth(app);
}
