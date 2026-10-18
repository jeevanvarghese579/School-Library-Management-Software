import { writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { createDocument, createdAt, deleteDocument, documentRef, listDocuments } from './firestoreData';
import type { BookIssue, AcademicYear, Book, Student } from '@/types';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unexpected database error.';

async function hydrateIssues(onlyActive = false) {
  const [issues, books, students, years] = await Promise.all([
    listDocuments<BookIssue>('book_issues'), listDocuments<Book>('books'),
    listDocuments<Student>('students'), listDocuments<AcademicYear>('academic_years'),
  ]);
  const bookMap = new Map(books.map((item) => [item.id, item]));
  const studentMap = new Map(students.map((item) => [item.id, item]));
  const yearMap = new Map(years.map((item) => [item.id, item]));
  return issues.filter((item) => !onlyActive || item.status === 'issued').map((item) => ({
    ...item, book: bookMap.get(item.book_id) ?? null, student: studentMap.get(item.student_id) ?? null,
    academic_year: item.academic_year_id ? yearMap.get(item.academic_year_id) ?? null : null,
  })).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
}

export async function fetchActiveIssues() {
  try { return { data: await hydrateIssues(true), error: null }; }
  catch (error) { return { data: [] as BookIssue[], error: message(error) }; }
}
export async function fetchAllIssues() {
  try { return { data: await hydrateIssues(), error: null }; }
  catch (error) { return { data: [] as BookIssue[], error: message(error) }; }
}
export async function fetchIssuesByAcademicYear(academicYearId: string) {
  try { return { data: (await hydrateIssues()).filter((item) => item.academic_year_id === academicYearId), error: null }; }
  catch (error) { return { data: [] as BookIssue[], error: message(error) }; }
}
export async function fetchAcademicYears() {
  return (await listDocuments<AcademicYear>('academic_years')).sort((a, b) => a.year_label.localeCompare(b.year_label));
}
export async function createAcademicYear(label: string) {
  try {
    if ((await fetchAcademicYears()).some((year) => year.year_label === label.trim())) return { error: 'This academic year already exists.' };
    await createDocument('academic_years', { year_label: label.trim(), is_active: false, created_at: createdAt() }); return { error: null };
  } catch (error) { return { error: message(error) }; }
}
export async function setActiveAcademicYear(id: string) {
  try {
    const batch = writeBatch(db);
    (await fetchAcademicYears()).forEach((year) => batch.update(documentRef('academic_years', year.id), { is_active: year.id === id }));
    await batch.commit(); return { error: null };
  } catch (error) { return { error: message(error) }; }
}
export async function deleteAcademicYear(id: string) {
  try {
    if ((await listDocuments<BookIssue>('book_issues')).some((issue) => issue.academic_year_id === id)) return { error: 'Cannot delete an academic year that has issue records.' };
    const years = await fetchAcademicYears();
    if (years.find((year) => year.id === id)?.is_active) return { error: 'Select another active academic year before deleting this one.' };
    await deleteDocument('academic_years', id); return { error: null };
  } catch (error) { return { error: message(error) }; }
}
