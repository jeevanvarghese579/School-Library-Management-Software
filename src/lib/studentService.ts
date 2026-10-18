import { createDocument, createdAt, deleteDocument, listDocuments, updateDocument } from './firestoreData';
import type { Student, Class, BookIssue } from '@/types';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unexpected database error.';

export async function fetchStudents(): Promise<{ data: Student[]; error: string | null }> {
  try {
    const [students, classes] = await Promise.all([listDocuments<Student>('students'), listDocuments<Class>('classes')]);
    const classMap = new Map(classes.map((item) => [item.id, item]));
    return { data: students.filter((item) => !item.archived).map((item) => ({ ...item, class: item.class_id ? classMap.get(item.class_id) ?? null : null })).sort((a, b) => a.name.localeCompare(b.name)), error: null };
  } catch (error) { return { data: [], error: message(error) }; }
}

export async function createStudent(student: { name: string; roll_number: string; class_id: string | null }) {
  try { const id = await createDocument('students', { ...student, archived: false, created_at: createdAt() }); return { error: null, id }; }
  catch (error) { return { error: message(error), id: null }; }
}
export async function updateStudent(id: string, updates: { name?: string; roll_number?: string; class_id?: string | null }) {
  try { await updateDocument('students', id, updates); return { error: null }; }
  catch (error) { return { error: message(error) }; }
}
export async function archiveStudent(id: string) {
  try { await updateDocument('students', id, { archived: true }); return { error: null }; }
  catch (error) { return { error: message(error) }; }
}
export async function deleteStudent(id: string) {
  try {
    if ((await listDocuments<BookIssue>('book_issues')).some((issue) => issue.student_id === id)) return { error: 'Students with issue history must be archived instead of permanently deleted.' };
    await deleteDocument('students', id); return { error: null };
  } catch (error) { return { error: message(error) }; }
}
export async function checkStudentHasIssues(studentId: string) {
  return (await listDocuments<BookIssue>('book_issues')).some((issue) => issue.student_id === studentId && issue.status === 'issued');
}

export async function fetchClasses(): Promise<{ data: Class[]; error: string | null }> {
  try {
    const [classes, students] = await Promise.all([listDocuments<Class>('classes'), listDocuments<Student>('students')]);
    return { data: classes.map((item) => ({ ...item, student_count: students.filter((student) => !student.archived && student.class_id === item.id).length })).sort((a, b) => a.name.localeCompare(b.name)), error: null };
  } catch (error) { return { data: [], error: message(error) }; }
}
export async function createClass(name: string) {
  try {
    if ((await listDocuments<Class>('classes')).some((item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return { error: 'A class with this name already exists.' };
    await createDocument('classes', { name: name.trim(), created_at: createdAt() }); return { error: null };
  } catch (error) { return { error: message(error) }; }
}
export async function updateClass(id: string, name: string) {
  try { await updateDocument('classes', id, { name: name.trim() }); return { error: null }; }
  catch (error) { return { error: message(error) }; }
}
export async function deleteClass(id: string) {
  try {
    if ((await listDocuments<Student>('students')).some((student) => !student.archived && student.class_id === id)) return { error: 'Cannot delete a class that still has students. Move or archive them first.' };
    await deleteDocument('classes', id); return { error: null };
  } catch (error) { return { error: message(error) }; }
}
