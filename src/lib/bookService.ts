import { doc, runTransaction, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import {
  collectionRef,
  createDocument,
  createdAt,
  deleteDocument,
  documentRef,
  listDocuments,
  updateDocument,
} from './firestoreData';
import type { Book, BookCustomValue, BookIssue, Student, Class } from '@/types';
import { todayString, toDateString, addDays } from '@/lib/utils';
import { parseISO, format } from 'date-fns';

export const DEFAULT_FIELD_MAP: Record<string, keyof Book> = {
  'Book Number': 'book_number', 'Name of Book': 'name', 'Author Name': 'author',
  Category: 'category', 'Shelf Number': 'shelf_number', 'Row Number': 'row_number',
  'Source of Acquisition': 'source_of_acquisition', Price: 'price',
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected database error.';

export async function fetchBooks(): Promise<{ data: Book[]; error: string | null }> {
  try {
    const [books, issues] = await Promise.all([
      listDocuments<Book>('books'),
      listDocuments<BookIssue>('book_issues'),
    ]);
    const issued = new Set(issues.filter((item) => item.status === 'issued').map((item) => item.book_id));
    return {
      data: books.filter((book) => !book.archived).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((book) => ({ ...book, is_available: !issued.has(book.id) })),
      error: null,
    };
  } catch (error) { return { data: [], error: errorMessage(error) }; }
}

export async function fetchBookCustomValues(bookIds: string[]): Promise<Map<string, BookCustomValue[]>> {
  const ids = new Set(bookIds);
  const values = (await listDocuments<BookCustomValue>('book_custom_values')).filter((value) => ids.has(value.book_id));
  const definitions = await listDocuments<import('@/types').BookFieldDefinition>('book_field_definitions');
  const definitionMap = new Map(definitions.map((item) => [item.id, item]));
  const map = new Map<string, BookCustomValue[]>();
  values.forEach((value) => {
    const current = map.get(value.book_id) ?? [];
    current.push({ ...value, field_definition: definitionMap.get(value.field_definition_id) });
    map.set(value.book_id, current);
  });
  return map;
}

export async function createBook(bookData: Partial<Book>, customFields: { fieldId: string; value: string }[]) {
  try {
    if (await checkBookNumberExists(String(bookData.book_number ?? ''))) return { error: 'A book with this number already exists.', id: null };
    const bookId = await createDocument('books', { ...bookData, archived: false, created_at: createdAt() });
    const batch = writeBatch(db);
    customFields.filter((field) => field.value !== '').forEach((field) => {
      batch.set(documentRef('book_custom_values', `${bookId}_${field.fieldId}`), {
        book_id: bookId, field_definition_id: field.fieldId, value: field.value, created_at: createdAt(),
      });
    });
    await batch.commit();
    return { error: null, id: bookId };
  } catch (error) { return { error: errorMessage(error), id: null }; }
}

export async function updateBook(id: string, bookData: Partial<Book>, customFields: { fieldId: string; value: string }[]) {
  try {
    if (bookData.book_number && await checkBookNumberExists(bookData.book_number, id)) return { error: 'A book with this number already exists.' };
    await updateDocument('books', id, bookData);
    const batch = writeBatch(db);
    customFields.forEach((field) => batch.set(documentRef('book_custom_values', `${id}_${field.fieldId}`), {
      book_id: id, field_definition_id: field.fieldId, value: field.value, created_at: createdAt(),
    }, { merge: true }));
    await batch.commit();
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function archiveBook(id: string) {
  try { await updateDocument('books', id, { archived: true }); return { error: null }; }
  catch (error) { return { error: errorMessage(error) }; }
}

export async function deleteBook(id: string) {
  try {
    if ((await listDocuments<BookIssue>('book_issues')).some((issue) => issue.book_id === id)) {
      return { error: 'Books with issue history must be archived instead of permanently deleted.' };
    }
    await deleteDocument('books', id);
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function checkBookNumberExists(bookNumber: string, excludeId?: string) {
  const normalized = bookNumber.trim().toLocaleLowerCase();
  return (await listDocuments<Book>('books')).some((book) => !book.archived && book.id !== excludeId && book.book_number.trim().toLocaleLowerCase() === normalized);
}

export async function checkBookHasActiveIssue(bookId: string) {
  return (await listDocuments<BookIssue>('book_issues')).some((issue) => issue.book_id === bookId && issue.status === 'issued');
}

export async function issueBook(params: { bookId: string; studentId: string; academicYearId: string | null; issueDate?: string; borrowingPeriodDays: number }) {
  const issueDate = params.issueDate ?? todayString();
  const dueDate = toDateString(addDays(parseISO(issueDate), params.borrowingPeriodDays));
  try {
    await runTransaction(db, async (transaction) => {
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
      const book = bookSnapshot.data() as Book;
      transaction.set(issueRef, {
        book_id: params.bookId, student_id: params.studentId, academic_year_id: params.academicYearId,
        issue_date: issueDate, due_date: dueDate, return_date: null, status: 'issued',
        book_number_snapshot: book.book_number, book_title_snapshot: book.name,
        student_name_snapshot: student.name, student_roll_number_snapshot: student.roll_number,
        class_name_snapshot: className, created_at: createdAt(),
      });
      transaction.set(lockRef, { issue_id: issueRef.id, book_id: params.bookId, created_at: createdAt() });
    });
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function returnBook(issueId: string, returnDate = todayString()) {
  try {
    await runTransaction(db, async (transaction) => {
      const issueRef = documentRef('book_issues', issueId);
      const snapshot = await transaction.get(issueRef);
      if (!snapshot.exists()) throw new Error('Issue record not found.');
      const issue = snapshot.data() as BookIssue;
      if (issue.status === 'returned') throw new Error('This book has already been returned.');
      if (parseISO(returnDate) < parseISO(issue.issue_date)) throw new Error('Return date cannot be before the issue date.');
      transaction.update(issueRef, { return_date: returnDate, status: 'returned' });
      transaction.delete(documentRef('active_issues', issue.book_id));
    });
    return { error: null };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function updateIssue(issueId: string, updates: { issue_date?: string; due_date?: string; return_date?: string | null }) {
  try {
    const issue = (await listDocuments<BookIssue>('book_issues')).find((item) => item.id === issueId);
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
  const [books, students, classes, issues] = await Promise.all([
    listDocuments<Book>('books'), listDocuments<Student>('students'), listDocuments<Class>('classes'), listDocuments<BookIssue>('book_issues'),
  ]);
  const activeBooks = books.filter((book) => !book.archived);
  const issued = issues.filter((issue) => issue.status === 'issued');
  return {
    totalBooks: activeBooks.length, availableBooks: activeBooks.length - issued.length, issuedBooks: issued.length,
    overdueBooks: issued.filter((issue) => issue.due_date < today).length,
    totalStudents: students.filter((student) => !student.archived).length, totalClasses: classes.length,
    returnedBooks: issues.filter((issue) => issue.status === 'returned').length,
    issuedToday: issued.filter((issue) => issue.issue_date === today).length,
  };
}
