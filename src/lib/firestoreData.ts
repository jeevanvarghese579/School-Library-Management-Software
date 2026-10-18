import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db, APP_KEY } from './firebase';
import { trackCloudOperation } from './cloudSync';

export function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to access library data.');
  return uid;
}

export function userPath(uid = currentUid()) {
  return `apps/${APP_KEY}/users/${uid}`;
}

export function collectionRef(name: string) {
  return collection(db, `${userPath()}/${name}`);
}

export function documentRef(name: string, id: string) {
  return doc(db, `${userPath()}/${name}/${id}`);
}

export async function listDocuments<T>(name: string): Promise<T[]> {
  const snapshot = await getDocs(collectionRef(name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
}

export async function getDocument<T>(name: string, id: string): Promise<T | null> {
  const snapshot = await getDoc(documentRef(name, id));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null;
}

export async function createDocument(name: string, data: DocumentData, id?: string): Promise<string> {
  if (id) {
    await trackCloudOperation(setDoc(documentRef(name, id), data));
    return id;
  }
  return (await trackCloudOperation(addDoc(collectionRef(name), data))).id;
}

export async function updateDocument(name: string, id: string, data: DocumentData) {
  await trackCloudOperation(updateDoc(documentRef(name, id), data));
}

export async function deleteDocument(name: string, id: string) {
  await trackCloudOperation(deleteDoc(documentRef(name, id)));
}

export const createdAt = () => new Date().toISOString();

const defaultFields = [
  ['default-book-number', 'Book Number', 'text', true],
  ['default-book-name', 'Name of Book', 'text', true],
  ['default-author-name', 'Author Name', 'text', false],
  ['default-category', 'Category', 'text', false],
  ['default-shelf-number', 'Shelf Number', 'text', false],
  ['default-row-number', 'Row Number', 'text', false],
  ['default-source-of-acquisition', 'Source of Acquisition', 'text', false],
  ['default-price', 'Price', 'number', false],
] as const;

export async function ensureUserDefaults() {
  const settingsRef = documentRef('app_settings', 'main');
  const yearRef = documentRef('academic_years', '2026-2027');
  const fieldRefs = defaultFields.map(([id]) => documentRef('book_field_definitions', id));
  const snapshots = await Promise.all([getDoc(settingsRef), getDoc(yearRef), ...fieldRefs.map(getDoc)]);
  const batch = writeBatch(db);
  let changed = false;

  if (!snapshots[0].exists()) {
    batch.set(settingsRef, {
      school_name: 'School Library', currency: 'INR', currency_symbol: '₹',
      date_format: 'dd/MM/yyyy', borrowing_period_days: 14, school_logo: null,
      created_at: createdAt(),
    });
    changed = true;
  }
  if (!snapshots[1].exists()) {
    batch.set(yearRef, { year_label: '2026–2027', is_active: true, created_at: createdAt() });
    changed = true;
  }
  defaultFields.forEach(([id, name, type, required], index) => {
    if (!snapshots[index + 2].exists()) {
      batch.set(documentRef('book_field_definitions', id), {
        field_name: name, field_type: type, is_required: required, display_order: index + 1,
        is_visible: true, dropdown_options: null, is_default: true, created_at: createdAt(),
      });
      changed = true;
    }
  });
  if (changed) await trackCloudOperation(batch.commit());
}
