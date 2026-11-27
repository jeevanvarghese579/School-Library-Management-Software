import { getCountFromServer, getDocs, runTransaction, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { collectionRef, documentRef } from './firestoreData';
import { trackCloudOperation } from './cloudSync';
import type { BookIssue } from '@/types';

export type EraseTarget = 'books' | 'students';

export interface EraseManifest {
  books: number;
  customValues: number;
  categories: number;
  students: number;
  activeIssues: number;
}

async function reconcileActiveIssueLocks() {
  const locks = await getDocs(collectionRef('active_issues'));
  for (const listedLock of locks.docs) {
    await trackCloudOperation(runTransaction(db, async (transaction) => {
      const lockSnapshot = await transaction.get(listedLock.ref);
      if (!lockSnapshot.exists()) return;
      const lock = lockSnapshot.data() as { issue_id?: string; book_id?: string };
      const issueSnapshot = lock.issue_id
        ? await transaction.get(documentRef('book_issues', lock.issue_id))
        : null;
      const issue = issueSnapshot?.exists() ? issueSnapshot.data() as BookIssue : null;
      const isGenuinelyActive = issue?.status === 'issued'
        && Boolean(lock.book_id)
        && issue.book_id === lock.book_id;
      if (isGenuinelyActive) return;

      const bookSnapshot = lock.book_id
        ? await transaction.get(documentRef('books', lock.book_id))
        : null;
      transaction.delete(listedLock.ref);
      if (bookSnapshot?.exists()) transaction.update(bookSnapshot.ref, { is_available: true });
    }));
  }
  return (await getCountFromServer(collectionRef('active_issues'))).data().count;
}

export async function getEraseManifest(): Promise<EraseManifest> {
  const [books, customValues, categories, students, activeIssues] = await Promise.all([
    getCountFromServer(collectionRef('books')),
    getCountFromServer(collectionRef('book_custom_values')),
    getCountFromServer(collectionRef('book_categories')),
    getCountFromServer(collectionRef('students')),
    reconcileActiveIssueLocks(),
  ]);
  return {
    books: books.data().count,
    customValues: customValues.data().count,
    categories: categories.data().count,
    students: students.data().count,
    activeIssues,
  };
}

async function eraseCollection(name: string) {
  const snapshot = await getDocs(collectionRef(name));
  for (let index = 0; index < snapshot.docs.length; index += 450) {
    const batch = writeBatch(db);
    snapshot.docs.slice(index, index + 450).forEach((item) => batch.delete(item.ref));
    await trackCloudOperation(batch.commit());
  }
  return snapshot.size;
}

export async function eraseAllBooks() {
  const activeIssues = await reconcileActiveIssueLocks();
  if (activeIssues > 0) {
    throw new Error('Return all currently issued books before erasing the book catalogue.');
  }
  const customValues = await eraseCollection('book_custom_values');
  const categories = await eraseCollection('book_categories');
  const books = await eraseCollection('books');
  return { books, customValues, categories };
}

export async function eraseAllStudents() {
  return { students: await eraseCollection('students') };
}
