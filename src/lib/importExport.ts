import * as XLSX from 'xlsx';
import { doc, writeBatch } from 'firebase/firestore';
import type { Book, BookFieldDefinition } from '@/types';
import { DEFAULT_FIELD_MAP, fetchBooks, normalizeBookText, prepareBookStorageData } from './bookService';
import { createStudent, fetchStudents, updateStudent } from './studentService';
import { db } from './firebase';
import { collectionRef, createdAt, documentRef } from './firestoreData';

export function exportToExcel(rows: Record<string, unknown>[], filename: string, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function spreadsheetCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
        resolve(json.map((row) => Object.fromEntries(
          Object.entries(row).map(([key, value]) => [spreadsheetCellText(key), spreadsheetCellText(value)])
        )));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function downloadBookTemplate(fieldDefs: BookFieldDefinition[]) {
  const headers: Record<string, string> = {};
  fieldDefs
    .filter((f) => f.is_default)
    .forEach((f) => {
      headers[f.field_name] = '';
    });
  exportToExcel([headers], 'book_import_template.xlsx', 'Books');
}

export function downloadStudentTemplate() {
  exportToExcel(
    [{ 'Student Name': '', 'Roll Number': '', Class: '' }],
    'student_import_template.xlsx',
    'Students'
  );
}

export function prepareBookExportRows(
  books: Book[],
  fieldDefs: BookFieldDefinition[],
  customValuesMap: Map<string, { field_definition_id: string; value: string | null }[]>,
  currencySymbol = '₹'
): Record<string, string>[] {
  return books.map((b) => {
    const row: Record<string, string> = {};
    fieldDefs
      .filter((f) => f.is_visible)
      .forEach((f) => {
        if (f.is_default) {
          const key = DEFAULT_FIELD_MAP[f.field_name];
          if (key === 'price') {
            row[f.field_name] = b.price !== null ? `${currencySymbol}${b.price}` : '';
          } else {
            row[f.field_name] = String((b as unknown as Record<string, unknown>)[key] ?? '');
          }
        } else {
          const vals = customValuesMap.get(b.id) ?? [];
          const cv = vals.find((v) => v.field_definition_id === f.id);
          row[f.field_name] = cv?.value ?? '';
        }
      });
    row['Availability'] = b.is_available ? 'Available' : 'Issued';
    return row;
  });
}

interface ImportResult {
  success: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function importBooks(
  rows: Record<string, string>[],
  fieldMapping: Record<string, string>,
  fieldDefs: BookFieldDefinition[],
  mode: 'skip' | 'update',
  onProgress?: (completed: number, total: number) => void
): Promise<ImportResult> {
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Build reverse mapping: spreadsheet column -> app field key
  const customFieldMap = new Map<string, BookFieldDefinition>();
  fieldDefs.forEach((f) => {
    if (!f.is_default) customFieldMap.set(f.field_name, f);
  });
  const existingBooks = (await fetchBooks()).data;
  const existingByNumber = new Map(existingBooks.map((book) => [normalizeBookText(book.book_number), book]));
  let batch = writeBatch(db);
  let operationCount = 0;
  let pendingRows: number[] = [];
  let completed = 0;
  const categoriesToSave = new Map<string, string>();

  const flush = async () => {
    if (operationCount === 0) return;
    const rowsInBatch = pendingRows;
    try {
      await batch.commit();
      success += rowsInBatch.length;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Batch write failed';
      failed += rowsInBatch.length;
      rowsInBatch.forEach((rowNum) => errors.push(`Row ${rowNum}: ${reason}`));
    }
    completed += rowsInBatch.length;
    onProgress?.(completed, rows.length);
    batch = writeBatch(db);
    operationCount = 0;
    pendingRows = [];
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    // Build book data from mapping
    const bookData: Partial<Book> = {};
    const customValues: { fieldId: string; value: string }[] = [];

    for (const [sheetCol, appField] of Object.entries(fieldMapping)) {
      const rawValue = spreadsheetCellText(row[sheetCol]);
      if (appField === 'Book Number') {
        bookData.book_number = rawValue;
      } else if (appField === 'Name of Book') {
        bookData.name = rawValue;
      } else if (appField === 'Author Name') {
        bookData.author = rawValue || null;
      } else if (appField === 'Category') {
        bookData.category = rawValue || null;
      } else if (appField === 'Shelf Number') {
        bookData.shelf_number = rawValue || null;
      } else if (appField === 'Row Number') {
        bookData.row_number = rawValue || null;
      } else if (appField === 'Source of Acquisition') {
        bookData.source_of_acquisition = rawValue || null;
      } else if (appField === 'Price') {
        const num = parseFloat(rawValue.replace(/[^0-9.-]/g, ''));
        bookData.price = isNaN(num) ? null : num;
      } else {
        const cf = customFieldMap.get(appField);
        if (cf) customValues.push({ fieldId: cf.id, value: rawValue });
      }
    }

    if (!bookData.book_number) {
      failed++;
      errors.push(`Row ${rowNum}: Missing book number`);
      completed++;
      onProgress?.(completed, rows.length);
      continue;
    }
    if (!bookData.name) {
      failed++;
      errors.push(`Row ${rowNum}: Missing book name`);
      completed++;
      onProgress?.(completed, rows.length);
      continue;
    }

    const numberKey = normalizeBookText(bookData.book_number);
    const existing = existingByNumber.get(numberKey);

    if (existing) {
      if (mode === 'skip') {
        skipped++;
        completed++;
        onProgress?.(completed, rows.length);
        continue;
      }
    }

    const bookId = existing?.id ?? doc(collectionRef('books')).id;
    const customFields = existing ? customValues : customValues.filter((field) => field.value !== '');
    const requiredOperations = 1 + customFields.length;
    if (operationCount > 0 && operationCount + requiredOperations > 450) await flush();

    const prepared = prepareBookStorageData(bookData);
    batch.set(documentRef('books', bookId), {
      ...prepared,
      archived: false,
      ...(existing ? {} : { is_available: true, created_at: createdAt() }),
    }, { merge: Boolean(existing) });
    customFields.forEach((field) => batch.set(documentRef('book_custom_values', `${bookId}_${field.fieldId}`), {
      book_id: bookId,
      field_definition_id: field.fieldId,
      value: field.value,
      created_at: createdAt(),
    }, { merge: true }));
    if (bookData.category) categoriesToSave.set(normalizeBookText(bookData.category), bookData.category);
    operationCount += requiredOperations;
    pendingRows.push(rowNum);
    existingByNumber.set(numberKey, {
      ...(existing ?? {}), ...bookData, id: bookId, archived: false,
      is_available: existing?.is_available ?? true, created_at: existing?.created_at ?? createdAt(),
    } as Book);
  }

  await flush();

  const categories = [...categoriesToSave.entries()];
  for (let index = 0; index < categories.length; index += 450) {
    const categoryBatch = writeBatch(db);
    categories.slice(index, index + 450).forEach(([key, name]) => {
      categoryBatch.set(documentRef('book_categories', encodeURIComponent(key)), { name }, { merge: true });
    });
    try {
      await categoryBatch.commit();
    } catch (error) {
      errors.push(`Categories: ${error instanceof Error ? error.message : 'Could not update the category list.'}`);
    }
  }

  return { success, skipped, failed, errors };
}

export async function importStudents(
  rows: Record<string, string>[],
  classes: { id: string; name: string }[],
  mode: 'skip' | 'update'
): Promise<ImportResult> {
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  const classMap = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  const existingStudents = (await fetchStudents()).data;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const name = spreadsheetCellText(row['Student Name'] ?? row['Name']);
    const rollNumber = spreadsheetCellText(row['Roll Number'] ?? row['Roll No']);
    const className = spreadsheetCellText(row['Class']);

    if (!name) {
      failed++;
      errors.push(`Row ${rowNum}: Missing student name`);
      continue;
    }
    if (!rollNumber) {
      failed++;
      errors.push(`Row ${rowNum}: Missing roll number`);
      continue;
    }

    const classId = className ? classMap.get(className.toLowerCase()) ?? null : null;
    if (className && !classId) {
      failed++;
      errors.push(`Row ${rowNum}: Class "${className}" not found`);
      continue;
    }

    const existing = existingStudents.find((student) => student.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      && student.roll_number.toLocaleLowerCase() === rollNumber.toLocaleLowerCase() && student.class_id === classId);

    if (existing) {
      if (mode === 'skip') {
        skipped++;
        continue;
      }
      const { error: updateError } = await updateStudent(existing.id, { name, roll_number: rollNumber, class_id: classId });
      if (updateError) {
        failed++;
        errors.push(`Row ${rowNum}: ${updateError}`);
        continue;
      }
      success++;
    } else {
      const { error: insertError, id } = await createStudent({ name, roll_number: rollNumber, class_id: classId });
      if (insertError) {
        failed++;
        errors.push(`Row ${rowNum}: ${insertError}`);
        continue;
      }
      existingStudents.push({ id: id!, name, roll_number: rollNumber, class_id: classId, archived: false, created_at: new Date().toISOString() });
      success++;
    }
  }

  return { success, skipped, failed, errors };
}
