import { getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { collectionRef, createDocument, createdAt, deleteDocument, documentRef, listDocuments, updateDocument } from './firestoreData';
import type { BookIssue, AcademicYear } from '@/types';
import { trackCloudOperation } from './cloudSync';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unexpected database error.';

function issueFromDocument(item: { id: string; data: () => unknown }): BookIssue {
  return { id: item.id, ...(item.data() as Omit<BookIssue, 'id'>) };
}

async function fetchIssueDocuments(academicYearId?: string, onlyActive = false) {
  const constraints = [];
  if (academicYearId) constraints.push(where('academic_year_id', '==', academicYearId));
  if (onlyActive) constraints.push(where('status', '==', 'issued'));
  const snapshot = await getDocs(query(collectionRef('book_issues'), ...constraints));
  return snapshot.docs.map(issueFromDocument).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
}

async function addAcademicYears(issues: BookIssue[]) {
  const years = await listDocuments<AcademicYear>('academic_years');
  const yearMap = new Map(years.map((year) => [year.id, year]));
  return issues.map((issue) => ({
    ...issue,
    academic_year: issue.academic_year_id ? yearMap.get(issue.academic_year_id) ?? null : null,
  }));
}

export async function fetchActiveIssues() {
  try { return { data: await fetchIssueDocuments(undefined, true), error: null }; }
  catch (error) { return { data: [] as BookIssue[], error: message(error) }; }
}

export async function fetchAllIssues() {
  try { return { data: await addAcademicYears(await fetchIssueDocuments()), error: null }; }
  catch (error) { return { data: [] as BookIssue[], error: message(error) }; }
}

export async function fetchIssuesByAcademicYear(academicYearId: string) {
  try { return { data: await addAcademicYears(await fetchIssueDocuments(academicYearId)), error: null }; }
  catch (error) { return { data: [] as BookIssue[], error: message(error) }; }
}

export async function fetchAcademicYears() {
  return (await listDocuments<AcademicYear>('academic_years')).sort((a, b) => a.year_label.localeCompare(b.year_label));
}

function validateAcademicYearDates(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 'Start date and end date are required.';
  if (endDate < startDate) return 'Academic year end date cannot be before its start date.';
  return null;
}

export async function createAcademicYear(label: string, startDate: string, endDate: string) {
  try {
    const dateError = validateAcademicYearDates(startDate, endDate);
    if (dateError) return { error: dateError };
    if ((await fetchAcademicYears()).some((year) => year.year_label === label.trim())) return { error: 'This academic year already exists.' };
    await createDocument('academic_years', {
      year_label: label.trim(), start_date: startDate, end_date: endDate,
      is_active: false, created_at: createdAt(),
    });
    return { error: null };
  } catch (error) { return { error: message(error) }; }
}

export async function updateAcademicYearDates(id: string, startDate: string, endDate: string) {
  try {
    const dateError = validateAcademicYearDates(startDate, endDate);
    if (dateError) return { error: dateError };
    await updateDocument('academic_years', id, { start_date: startDate, end_date: endDate });
    return { error: null };
  } catch (error) { return { error: message(error) }; }
}

export async function setActiveAcademicYear(id: string) {
  try {
    const batch = writeBatch(db);
    (await fetchAcademicYears()).forEach((year) => batch.update(documentRef('academic_years', year.id), { is_active: year.id === id }));
    await trackCloudOperation(batch.commit());
    return { error: null };
  } catch (error) { return { error: message(error) }; }
}

export async function deleteAcademicYear(id: string) {
  try {
    const used = await getDocs(query(collectionRef('book_issues'), where('academic_year_id', '==', id), limit(1)));
    if (!used.empty) return { error: 'Cannot delete an academic year that has issue records.' };
    const years = await fetchAcademicYears();
    if (years.find((year) => year.id === id)?.is_active) return { error: 'Select another active academic year before deleting this one.' };
    await deleteDocument('academic_years', id);
    return { error: null };
  } catch (error) { return { error: message(error) }; }
}
