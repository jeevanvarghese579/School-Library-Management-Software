import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, firebaseApp, functions } from '@/lib/firebase';

export type AccessState = 'checking' | 'allowed' | 'denied' | 'pending' | 'rejected' | 'inactive' | 'error';

interface AuthContextValue {
  session: User | null;
  user: User | null;
  firebaseUser: User | null;
  loading: boolean;
  accessState: AccessState;
  accessMessage: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null; allowed: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; allowed: boolean }>;
  requestAccess: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function messageFor(state: AccessState) {
  if (state === 'pending') return 'Your access request is awaiting administrator approval.';
  if (state === 'rejected') return 'Your access request was not approved. Contact an administrator for review.';
  if (state === 'inactive') return 'This account or application is currently inactive. Contact an administrator.';
  if (state === 'denied') return 'Your account does not yet have access to this application.';
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [session, setSession] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  const checkAccess = async (user: User | null) => {
    if (!user) {
      setSession(null);
      setAccessState('denied');
      setAccessMessage(null);
      return false;
    }
    setAccessState('checking');
    try {
      const callable = httpsCallable<{ appId: string }, { allowed: boolean; requestStatus?: string }>(functions, 'checkMyAccess');
      const result = await callable({ appId: firebaseApp.options.appId! });
      if (result.data.allowed) {
        setSession(user);
        setAccessState('allowed');
        setAccessMessage(null);
        return true;
      }
      const status: AccessState = result.data.requestStatus === 'pending'
        ? 'pending'
        : result.data.requestStatus === 'rejected'
          ? 'rejected'
          : result.data.requestStatus === 'approved'
            ? 'inactive'
            : 'denied';
      setSession(null);
      setAccessState(status);
      setAccessMessage(messageFor(status));
      return false;
    } catch (error) {
      setSession(null);
      setAccessState('error');
      setAccessMessage(error instanceof Error ? error.message : 'Unable to verify application access.');
      return false;
    }
  };

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    setFirebaseUser(user);
    await checkAccess(user);
    setLoading(false);
  }), []);

  const signIn = async (email: string, password: string) => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const allowed = await checkAccess(credential.user);
      return { error: null, allowed };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed.', allowed: false };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const allowed = await checkAccess(credential.user);
      return { error: null, allowed };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Account creation failed.', allowed: false };
    }
  };

  const requestAccess = async () => {
    if (!auth.currentUser) return { error: 'Sign in before requesting access.' };
    try {
      const callable = httpsCallable<{ appId: string; requestType: string }, { status: string }>(functions, 'requestAppAccess');
      const result = await callable({ appId: firebaseApp.options.appId!, requestType: 'access-request' });
      const state: AccessState = result.data.status === 'rejected' ? 'rejected' : result.data.status === 'approved' || result.data.status === 'already-approved' ? 'allowed' : 'pending';
      if (state === 'allowed') await checkAccess(auth.currentUser);
      else {
        setAccessState(state);
        setAccessMessage(messageFor(state));
      }
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to request access.' };
    }
  };

  const signOut = async () => firebaseSignOut(auth);

  return (
    <AuthContext.Provider value={{ session, user: session, firebaseUser, loading, accessState, accessMessage, signIn, signUp, requestAccess, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
