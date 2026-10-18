import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

export const APP_KEY = 'schoolLibraryManagement';
export const FIREBASE_WEB_APP_ID = '1:379503088311:web:9496a80a937cd22d133332';

const firebaseConfig = {
  apiKey: 'AIzaSyCOk_yef2gRBCdm8FwEgeidK7TrK1Yvcd0',
  authDomain: 'inter-level-progress-manager.firebaseapp.com',
  projectId: 'inter-level-progress-manager',
  storageBucket: 'inter-level-progress-manager.firebasestorage.app',
  messagingSenderId: '379503088311',
  appId: FIREBASE_WEB_APP_ID,
  measurementId: 'G-6PFL49296J',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const functions = getFunctions(firebaseApp);
