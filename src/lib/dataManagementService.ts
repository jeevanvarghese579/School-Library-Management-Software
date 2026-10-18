import { getCountFromServer, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { collectionRef } from './firestoreData';
import { trackCloudOperation } from './cloudSync';

export type EraseTarget = 'books' | 'students';

export interface EraseManifest {
  books: number;
  customValues: number;
  categories: number;
  students: number;
  activeIssues: number;
}

export async function getEraseManifest(): Promise<EraseManifest> {
  const [books, customValues, categories, students, activeIssues] = await Promise.all([
    getCountFromServer(collectionRef('books')),
    getCountFromServer(collectionRef('book_custom_values')),
    getCountFromServer(collectionRef('book_categories')),
    getCountFromServer(collectionRef('students')),
    getCountFromServer(collectionRef('active_issues')),
  ]);
  return {
    books: books.data().count,
    customValues: customValues.data().count,
    categories: categories.data().count,
    students: students.data().count,
    activeIssues: activeIssues.data().count,
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
  const activeIssues = await getCountFromServer(collectionRef('active_issues'));
  if (activeIssues.data().count > 0) {
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
