import {
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  collectionRef,
  createDocument,
  createdAt,
  deleteDocument,
  documentRef,
  getDocument,
  listDocuments,
  updateDocument,
} from './firestoreData';
import type { Book, BookCustomValue, BookIssue, Student, Class } from '@/types';
import { todayString, toDateString, addDays } from '@/lib/utils';
import { parseISO, format } from 'date-fns';
import { trackCloudOperation } from './cloudSync';

export const DEFAULT_FIELD_MAP: Record<string, keyof Book> = {
  'Book Number': 'book_number', 'Name of Book': 'name', 'Author Name': 'author',
  Category: 'category', 'Shelf Number': 'shelf_number', 'Row Number': 'row_number',
  'Source of Acquisition': 'source_of_acquisition', Price: 'price',
};

export type BookPageCursor = QueryDocumentSnapshot<DocumentData>;

export interface BookPageOptions {
  pageSize?: number;
  cursor?: BookPageCursor | null;
  search?: string;
  category?: string;
  sortField?: 'book_number' | 'name' | 'author' | 'category' | 'shelf_number' | 'row_number';
  sortAsc?: boolean;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected database error.';

export function normalizeBookText(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function prefixes(value: string) {
  const normalized = normalizeBookText(value);
  const terms = new Set<string>();
  for (const word of normalized.split(/\s+/).filter(Boolean)) {
    for (let index = 1; index <= Math.min(word.length, 30); index++) terms.add(word.slice(0, index));
  }
  for (let index = 1; index <= Math.min(normalized.length, 40); index++) terms.add(normalized.slice(0, index));
  return [...terms].slice(0, 300);
}

export function prepareBookStorageData(bookData: Partial<Book>) {
  const normalized: Partial<Book> & Record<string, unknown> = {
    ...bookData,
    book_number: String(bookData.book_number ?? '').trim(),
    name: String(bookData.name ?? '').trim(),
    author: bookData.author ? String(bookData.author).trim() : null,
    category: bookData.category ? String(bookData.category).trim() : null,
    shelf_number: bookData.shelf_number ? String(bookData.shelf_number).trim() : null,
    row_number: bookData.row_number ? String(bookData.row_number).trim() : null,
    source_of_acquisition: bookData.source_of_acquisition ? String(bookData.source_of_acquisition).trim() : null,
  };
  normalized.book_number_key = normalizeBookText(normalized.book_number);
  normalized.category_key = normalizeBookText(normalized.category);
  normalized.search_terms = [...new Set([
    ...prefixes(String(normalized.book_number ?? '')),
    ...prefixes(String(normalized.name ?? '')),
    ...prefixes(String(normalized.author ?? '')),
    ...prefixes(String(normalized.category ?? '')),
    ...prefixes(String(normalized.shelf_number ?? '')),
    ...prefixes(String(normalized.row_number ?? '')),
  ])].slice(0, 500);
  return normalized;
}

function bookFromSnapshot(item: QueryDocumentSnapshot<DocumentData>): Book {
  const book = { id: item.id, ...item.data() } as Book;
  return { ...book, is_available: book.is_available !== false };
}

export async function fetchBooksPage(options: BookPageOptions = {}) {
  const pageSize = options.pageSize ?? 50;
  const constraints: QueryConstraint[] = [];
  const search = normalizeBookText(options.search);
  const category = normalizeBookText(options.category);
  if (search) constraints.push(where('search_terms', 'array-contains', search));
  else if (category) constraints.push(where('category_key', '==', category));
  else constraints.push(orderBy(options.sortField ?? 'book_number', options.sortAsc === false ? 'desc' : 'asc'));
  if (options.cursor) constraints.push(startAfter(options.cursor));
  constraints.push(limit(pageSize));

  const countConstraints = constraints.filter((constraint) => constraint.type !== 'limit' && constraint.type !== 'startAfter');
  const [snapshot, countSnapshot] = await Promise.all([
    getDocs(query(collectionRef('books'), ...constraints)),
    getCountFromServer(query(collectionRef('books'), ...countConstraints)),
  ]);
  const books = snapshot.docs.map(bookFromSnapshot).filter((book) => !book.archived);
  if (search || category) {
    const field = options.sortField ?? 'book_number';
    books.sort((a, b) => {
      const left = String((a as unknown as Record<string, unknown>)[field] ?? '');
      const right = String((b as unknown as Record<string, unknown>)[field] ?? '');
      return options.sortAsc === false ? right.localeCompare(left) : left.localeCompare(right);
    });
  }
  return {
    data: books,
    total: countSnapshot.data().count,
    nextCursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
    error: null as string | null,
  };
}

export async function fetchBookCategories() {
  const values = await listDocuments<{ id: string; name: string }>('book_categories');
  return values.map((item) => item.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export async function searchAvailableBooks(search: string, resultLimit = 30): Promise<Book[]> {
  const normalized = normalizeBookText(search);
  const constraints: QueryConstraint[] = normalized
    ? [where('search_terms', 'array-contains', normalized), limit(resultLimit * 2)]
    : [where('is_available', '==', true), limit(resultLimit)];
  const snapshot = await getDocs(query(collectionRef('books'), ...constraints));
  return snapshot.docs.map(bookFromSnapshot).filter((book) => !book.archived && book.is_available).slice(0, resultLimit);
}

// Full collection reads are reserved for explicit export/backup/import operations.
export async function fetchBooks(): Promise<{ data: Book[]; error: string | null }> {
  try {
    const books = await listDocuments<Book>('books');
    return { data: books.filter((book) => !book.archived).map((book) => ({ ...book, is_available: book.is_available !== false })), error: null };
  } catch (error) { return { data: [], error: errorMessage(error) }; }
}

export async function fetchBookCustomValues(bookIds: string[]): Promise<Map<string, BookCustomValue[]>> {
  if (bookIds.length === 0) return new Map();
  const chunks: string[][] = [];
  for (let index = 0; index < bookIds.length; index += 30) chunks.push(bookIds.slice(index, index + 30));
  const [snapshots, definitions] = await Promise.all([
    Promise.all(chunks.map((ids) => getDocs(query(collectionRef('book_custom_values'), where('book_id', 'in', ids))))),
    listDocuments<import('@/types').BookFieldDefinition>('book_field_definitions'),
  ]);
  const definitionMap = new Map(definitions.map((item) => [item.id, item]));
  const map = new Map<string, BookCustomValue[]>();
  snapshots.flatMap((snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BookCustomValue))).forEach((value) => {
    const current = map.get(value.book_id) ?? [];
    current.push({ ...value, field_definition: definitionMap.get(value.field_definition_id) });
    map.set(value.book_id, current);
  });
  return map;
}

async function saveCategory(category: string | null | undefined) {
  const key = normalizeBookText(category);
  if (!key || !category) return;
  await trackCloudOperation(writeBatch(db).set(documentRef('book_categories', encodeURIComponent(key)), { name: category.trim() }, { merge: true }).commit());
}

export async function createBook(bookData: Partial<Book>, customFields: { fieldId: string; value: string }[]) {
  try {
    if (await checkBookNumberExists(String(bookData.book_number ?? ''))) return { error: 'A book with this number already exists.', id: null };
    const prepared = prepareBookStorageData(bookData);
    const bookId = await createDocument('books', { ...prepared, archived: false, is_available: true, created_at: createdAt() });
    const batch = writeBatch(db);
    customFields.filter((field) => field.value !== '').forEach((field) => {
      batch.set(documentRef('book_custom_values', `${bookId}_${field.fieldId}`), {
        book_id: bookId, field_definition_id: field.fieldId, value: field.value, created_at: createdAt(),
      });
    });
    await trackCloudOperation(batch.commit());
    await saveCategory(prepared.category as string | null);
    return { error: null, id: bookId };
  } catch (error) { return { error: errorMessage(error), id: null }; }
}

export async function updateBook(id: string, bookData: Partial<Book>, customFields: { fieldId: string; value: string }[]) {
  try {
    if (bookData.book_number && await checkBookNumberExists(bookData.book_number, id)) return { error: 'A book with this number already exists.' };
    const prepared = prepareBookStorageData(bookData);
    await updateDocument('books', id, prepared);
    const batch = writeBatch(db);
    customFields.forEach((field) => batch.set(documentRef('book_custom_values', `${id}_${field.fieldId}`), {
      book_id: id, field_definition_id: field.fieldId, value: field.value, created_at: createdAt(),
    }, { merge: true }));
    await trackCloudOperation(batch.commit());
    await saveCategory(prepared.category as string | null);
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function archiveBook(id: string) {
  try { await updateDocument('books', id, { archived: true }); return { error: null }; }
  catch (error) { return { error: errorMessage(error) }; }
}

export async function deleteBook(id: string) {
  try {
    const history = await getDocs(query(collectionRef('book_issues'), where('book_id', '==', id), limit(1)));
    if (!history.empty) return { error: 'Books with issue history must be archived instead of permanently deleted.' };
    await deleteDocument('books', id);
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function checkBookNumberExists(bookNumber: string, excludeId?: string) {
  const snapshot = await getDocs(query(collectionRef('books'), where('book_number_key', '==', normalizeBookText(bookNumber)), limit(2)));
  return snapshot.docs.some((item) => item.id !== excludeId && item.data().archived !== true);
}

export async function checkBookHasActiveIssue(bookId: string) {
  return (await getDoc(documentRef('active_issues', bookId))).exists();
}

export async function issueBook(params: { bookId: string; studentId: string; academicYearId: string | null; issueDate?: string; dueDate?: string; borrowingPeriodDays: number }) {
  const issueDate = params.issueDate ?? todayString();
  const dueDate = params.dueDate ?? toDateString(addDays(parseISO(issueDate), params.borrowingPeriodDays));
  let createdIssueId: string | null = null;
  try {
    await trackCloudOperation(runTransaction(db, async (transaction) => {
      const lockRef = documentRef('active_issues', params.bookId);
      const bookRef = documentRef('books', params.bookId);
      const studentRef = documentRef('students', params.studentId);
      const [lock, bookSnapshot, studentSnapshot] = await Promise.all([
        transaction.get(lockRef), transaction.get(bookRef), transaction.get(studentRef),
      ]);
      if (lock.exists()) throw new Error('This book is already issued. Return it first.');
      if (!bookSnapshot.exists() || bookSnapshot.data().archived) throw new Error('Book not found.');
      if (!studentSnapshot.exists() || studentSnapshot.data().archived) throw new Error('Student not found.');
      const student = studentSnapshot.data() as Student;
      let className = '—';
      if (student.class_id) {
        const classSnapshot = await transaction.get(documentRef('classes', student.class_id));
        if (classSnapshot.exists()) className = (classSnapshot.data() as Class).name;
      }
      const issueRef = doc(collectionRef('book_issues'));
      createdIssueId = issueRef.id;
      const book = bookSnapshot.data() as Book;
      transaction.set(issueRef, {
        book_id: params.bookId, student_id: params.studentId, academic_year_id: params.academicYearId,
        issue_date: issueDate, due_date: dueDate, return_date: null, status: 'issued',
        book_number_snapshot: book.book_number, book_title_snapshot: book.name,
        student_name_snapshot: student.name, student_roll_number_snapshot: student.roll_number,
        class_name_snapshot: className, created_at: createdAt(),
      });
      transaction.set(lockRef, { issue_id: issueRef.id, book_id: params.bookId, created_at: createdAt() });
      transaction.update(bookRef, { is_available: false });
    }));
    return { error: null, id: createdIssueId };
  } catch (error) { return { error: errorMessage(error), id: null }; }
}

export async function returnBook(issueId: string, returnDate = todayString()) {
  try {
    await trackCloudOperation(runTransaction(db, async (transaction) => {
      const issueRef = documentRef('book_issues', issueId);
      const snapshot = await transaction.get(issueRef);
      if (!snapshot.exists()) throw new Error('Issue record not found.');
      const issue = snapshot.data() as BookIssue;
      if (issue.status === 'returned') throw new Error('This book has already been returned.');
      if (parseISO(returnDate) < parseISO(issue.issue_date)) throw new Error('Return date cannot be before the issue date.');
      transaction.update(issueRef, { return_date: returnDate, status: 'returned' });
      transaction.delete(documentRef('active_issues', issue.book_id));
      transaction.update(documentRef('books', issue.book_id), { is_available: true });
    }));
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function updateIssue(issueId: string, updates: { issue_date?: string; due_date?: string; return_date?: string | null }) {
  try {
    const issue = await getDocument<BookIssue>('book_issues', issueId);
    if (!issue) return { error: 'Issue record not found.' };
    const issueDate = updates.issue_date ?? issue.issue_date;
    const dueDate = updates.due_date ?? issue.due_date;
    const returnDate = updates.return_date === undefined ? issue.return_date : updates.return_date;
    if (parseISO(dueDate) < parseISO(issueDate)) return { error: 'Due date cannot be before the issue date.' };
    if (returnDate && parseISO(returnDate) < parseISO(issueDate)) return { error: 'Return date cannot be before the issue date.' };
    await updateDocument('book_issues', issueId, updates);
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function fetchDashboardStats() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [books, students, classes, returned, issuedToday] = await Promise.all([
    getCountFromServer(query(collectionRef('books'), where('archived', '==', false))),
    getCountFromServer(query(collectionRef('students'), where('archived', '==', false))),
    getCountFromServer(collectionRef('classes')),
    getCountFromServer(query(collectionRef('book_issues'), where('status', '==', 'returned'))),
    getCountFromServer(query(collectionRef('book_issues'), where('issue_date', '==', today))),
  ]);
  return {
    totalBooks: books.data().count, availableBooks: 0, issuedBooks: 0, overdueBooks: 0,
    totalStudents: students.data().count, totalClasses: classes.data().count,
    returnedBooks: returned.data().count, issuedToday: issuedToday.data().count,
  };
}
