import { useEffect, useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  Download,
  Upload,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { CustomFieldRenderer } from '@/components/CustomFieldRenderer';
import { useSettings } from '@/contexts/SettingsContext';
import {
  fetchBooks,
  createBook,
  updateBook,
  archiveBook,
  checkBookNumberExists,
  checkBookHasActiveIssue,
  fetchBookCustomValues,
} from '@/lib/bookService';
import {
  exportToExcel,
  exportToCSV,
  parseSpreadsheet,
  downloadBookTemplate,
  prepareBookExportRows,
} from '@/lib/importExport';
import { formatCurrency } from '@/lib/utils';
import type { Book, BookFieldDefinition } from '@/types';
import { toast } from 'sonner';

type SortField = 'book_number' | 'name' | 'author' | 'category' | 'shelf_number' | 'row_number';

export function BooksPage() {
  const { settings, fieldDefinitions } = useSettings();
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('book_number');
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [viewingBook, setViewingBook] = useState<Book | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadBooks = async () => {
    const { data } = await fetchBooks();
    setBooks(data);
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.category && set.add(b.category));
    return Array.from(set).sort();
  }, [books]);

  const filteredBooks = useMemo(() => {
    let result = books;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.book_number.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          (b.author ?? '').toLowerCase().includes(q) ||
          (b.category ?? '').toLowerCase().includes(q) ||
          (b.shelf_number ?? '').toLowerCase().includes(q) ||
          (b.row_number ?? '').toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'all') {
      result = result.filter((b) => b.category === categoryFilter);
    }
    result = [...result].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortField] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sortField] ?? '');
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return result;
  }, [books, search, categoryFilter, sortField, sortAsc]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredBooks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredBooks.map((b) => b.id)));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const hasIssue = await checkBookHasActiveIssue(deleteTarget.id);
    if (hasIssue) {
      const { error } = await archiveBook(deleteTarget.id);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`"${deleteTarget.name}" has been archived (it has active issues).`);
        loadBooks();
      }
    } else {
      const { error } = await archiveBook(deleteTarget.id);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`"${deleteTarget.name}" has been deleted.`);
        loadBooks();
      }
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleBulkDelete = async () => {
    let count = 0;
    for (const id of selected) {
      await archiveBook(id);
      count++;
    }
    toast.success(`${count} books deleted/archived.`);
    setSelected(new Set());
    setShowBulkDelete(false);
    loadBooks();
  };

  const handleExport = (format: 'xlsx' | 'csv', scope: 'all' | 'filtered' | 'selected') => {
    let data = books;
    if (scope === 'filtered') data = filteredBooks;
    if (scope === 'selected') data = books.filter((b) => selected.has(b.id));

    // Fetch custom values
    (async () => {
      const cvMap = await fetchBookCustomValues(data.map((b) => b.id));

      const rows = prepareBookExportRows(data, fieldDefinitions, cvMap, settings?.currency_symbol);
      const filename = `books_export_${new Date().toISOString().split('T')[0]}.${format}`;
      if (format === 'xlsx') exportToExcel(rows, filename, 'Books');
      else exportToCSV(rows, filename);
      toast.success(`Exported ${rows.length} books to ${format.toUpperCase()}`);
    })();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Books</h1>
          <p className="text-sm text-slate-500 mt-1">{books.length} books in inventory</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload size={16} /> Import
          </Button>
          <Button variant="outline" onClick={() => handleExport('xlsx', 'filtered')}>
            <Download size={16} /> Export
          </Button>
          <Button onClick={() => { setEditingBook(null); setShowAddEdit(true); }}>
            <Plus size={16} /> Add Book
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by number, name, author, category, shelf or row..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-auto min-w-[150px]"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        {filteredBooks.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={40} />}
            title="No books found"
            description="Add books manually or import from a spreadsheet."
            action={
              <Button onClick={() => { setEditingBook(null); setShowAddEdit(true); }}>
                <Plus size={16} /> Add Book
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {selected.size === filteredBooks.length && selected.size > 0 ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} />
                  )}
                </button>
                <span className="text-sm text-slate-500">
                  {selected.size > 0 ? `${selected.size} selected` : `${filteredBooks.length} books`}
                </span>
              </div>
              {selected.size > 0 && (
                <Button variant="danger" size="sm" onClick={() => setShowBulkDelete(true)}>
                  <Trash2 size={14} /> Delete Selected
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => toggleSort('book_number')}>
                      Book No. {sortField === 'book_number' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => toggleSort('name')}>
                      Name {sortField === 'name' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => toggleSort('author')}>
                      Author {sortField === 'author' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => toggleSort('category')}>
                      Category {sortField === 'category' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium">Shelf</th>
                    <th className="px-4 py-3 font-medium">Row</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBooks.map((book) => (
                    <tr key={book.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(book.id)} className="text-slate-400 hover:text-slate-600">
                          {selected.has(book.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{book.book_number}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{book.name}</td>
                      <td className="px-4 py-3 text-slate-500">{book.author || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{book.category || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{book.shelf_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{book.row_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatCurrency(book.price, settings?.currency_symbol)}
                      </td>
                      <td className="px-4 py-3">
                        {book.is_available ? (
                          <Badge variant="success">Available</Badge>
                        ) : (
                          <Badge variant="warning">Issued</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingBook(book)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => { setEditingBook(book); setShowAddEdit(true); }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(book); setShowDeleteConfirm(true); }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {showAddEdit && (
        <BookForm
          book={editingBook}
          fieldDefinitions={fieldDefinitions}
          onClose={() => { setShowAddEdit(false); setEditingBook(null); }}
          onSaved={() => { setShowAddEdit(false); setEditingBook(null); loadBooks(); }}
        />
      )}

      {viewingBook && (
        <BookDetailModal
          book={viewingBook}
          fieldDefinitions={fieldDefinitions}
          currencySymbol={settings?.currency_symbol}
          onClose={() => setViewingBook(null)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Book"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? If this book has active issues, it will be archived instead.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
      />

      <ConfirmDialog
        open={showBulkDelete}
        title="Delete Selected Books"
        message={`Are you sure you want to delete ${selected.size} selected books? Books with active issues will be archived instead.`}
        confirmLabel="Delete All"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />

      {showImport && (
        <ImportModal
          fieldDefinitions={fieldDefinitions}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadBooks(); }}
        />
      )}
    </div>
  );
}

function BookForm({
  book,
  fieldDefinitions,
  onClose,
  onSaved,
}: {
  book: Book | null;
  fieldDefinitions: BookFieldDefinition[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const customFields = fieldDefinitions.filter((f) => !f.is_default);

  const [defaultValues, setDefaultValues] = useState<Record<string, string>>(() => {
    if (book) {
      return {
        book_number: book.book_number,
        name: book.name,
        author: book.author ?? '',
        category: book.category ?? '',
        shelf_number: book.shelf_number ?? '',
        row_number: book.row_number ?? '',
        source_of_acquisition: book.source_of_acquisition ?? '',
        price: book.price !== null ? String(book.price) : '',
      };
    }
    return {} as Record<string, string>;
  });

  const [customVal, setCustomVal] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book && customFields.length > 0) {
      (async () => {
        const data = (await fetchBookCustomValues([book.id])).get(book.id) ?? [];
        const map: Record<string, string> = {};
        data.forEach((v) => {
          map[v.field_definition_id] = v.value ?? '';
        });
        setCustomVal(map);
      })();
    }
  }, [book, customFields.length]);

  const handleDefaultChange = (key: string, value: string) => {
    setDefaultValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!defaultValues.book_number?.trim()) {
      newErrors.book_number = 'Book number is required';
    } else {
      const exists = await checkBookNumberExists(defaultValues.book_number.trim(), book?.id);
      if (exists) newErrors.book_number = 'This book number already exists';
    }

    if (!defaultValues.name?.trim()) {
      newErrors.name = 'Book name is required';
    }

    // Check required custom fields
    customFields.forEach((f) => {
      if (f.is_required && !(customVal[f.id] ?? '').trim()) {
        newErrors[f.id] = `${f.field_name} is required`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    const bookData: Partial<Book> = {
      book_number: defaultValues.book_number!.trim(),
      name: defaultValues.name!.trim(),
      author: defaultValues.author?.trim() || null,
      category: defaultValues.category?.trim() || null,
      shelf_number: defaultValues.shelf_number?.trim() || null,
      row_number: defaultValues.row_number?.trim() || null,
      source_of_acquisition: defaultValues.source_of_acquisition?.trim() || null,
      price: defaultValues.price ? parseFloat(defaultValues.price) : null,
    };

    const customFieldsData = Object.entries(customVal).map(([fieldId, value]) => ({ fieldId, value }));

    const { error } = book
      ? await updateBook(book.id, bookData, customFieldsData)
      : await createBook(bookData, customFieldsData);

    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(book ? 'Book updated successfully' : 'Book added successfully');
      onSaved();
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={book ? 'Edit Book' : 'Add Book'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : book ? 'Update Book' : 'Add Book'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Default Fields</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Book Number *"
              value={defaultValues.book_number ?? ''}
              onChange={(e) => handleDefaultChange('book_number', e.target.value)}
              error={errors.book_number}
            />
            <Input
              label="Name of Book *"
              value={defaultValues.name ?? ''}
              onChange={(e) => handleDefaultChange('name', e.target.value)}
              error={errors.name}
            />
            <Input
              label="Author Name"
              value={defaultValues.author ?? ''}
              onChange={(e) => handleDefaultChange('author', e.target.value)}
            />
            <Input
              label="Category"
              value={defaultValues.category ?? ''}
              onChange={(e) => handleDefaultChange('category', e.target.value)}
            />
            <Input
              label="Shelf Number"
              value={defaultValues.shelf_number ?? ''}
              onChange={(e) => handleDefaultChange('shelf_number', e.target.value)}
            />
            <Input
              label="Row Number"
              value={defaultValues.row_number ?? ''}
              onChange={(e) => handleDefaultChange('row_number', e.target.value)}
            />
            <Input
              label="Source of Acquisition"
              value={defaultValues.source_of_acquisition ?? ''}
              onChange={(e) => handleDefaultChange('source_of_acquisition', e.target.value)}
            />
            <Input
              label="Price"
              type="number"
              step="0.01"
              value={defaultValues.price ?? ''}
              onChange={(e) => handleDefaultChange('price', e.target.value)}
            />
          </div>
        </div>

        {customFields.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Custom Fields</h3>
            <CustomFieldRenderer
              fields={customFields}
              values={customVal}
              onChange={(fieldId, value) => setCustomVal((prev) => ({ ...prev, [fieldId]: value }))}
              errors={errors}
              onlyCustom
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function BookDetailModal({
  book,
  currencySymbol,
  onClose,
}: {
  book: Book;
  fieldDefinitions: BookFieldDefinition[];
  currencySymbol?: string;
  onClose: () => void;
}) {
  const [customValues, setCustomValues] = useState<{ field_definition_id: string; value: string | null; field_definition?: BookFieldDefinition }[]>([]);

  useEffect(() => {
    (async () => {
      const data = (await fetchBookCustomValues([book.id])).get(book.id) ?? [];
      setCustomValues(data);
    })();
  }, [book]);

  return (
    <Modal open={true} onClose={onClose} title="Book Details" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400">Book Number</p>
            <p className="text-sm font-medium text-slate-700">{book.book_number}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Name</p>
            <p className="text-sm font-medium text-slate-700">{book.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Author</p>
            <p className="text-sm font-medium text-slate-700">{book.author || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Category</p>
            <p className="text-sm font-medium text-slate-700">{book.category || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Shelf Number</p>
            <p className="text-sm font-medium text-slate-700">{book.shelf_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Row Number</p>
            <p className="text-sm font-medium text-slate-700">{book.row_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Source of Acquisition</p>
            <p className="text-sm font-medium text-slate-700">{book.source_of_acquisition || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Price</p>
            <p className="text-sm font-medium text-slate-700">{formatCurrency(book.price, currencySymbol)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Status</p>
            <div className="mt-1">
              {book.is_available ? <Badge variant="success">Available</Badge> : <Badge variant="warning">Issued</Badge>}
            </div>
          </div>
        </div>

        {customValues.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Custom Fields</h3>
            <div className="grid grid-cols-2 gap-4">
              {customValues.map((cv) => (
                <div key={cv.field_definition_id}>
                  <p className="text-xs text-slate-400">{cv.field_definition?.field_name}</p>
                  <p className="text-sm font-medium text-slate-700">{cv.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ImportModal({
  fieldDefinitions,
  onClose,
  onImported,
}: {
  fieldDefinitions: BookFieldDefinition[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'result'>('upload');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<{ success: number; skipped: number; failed: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const allFieldNames = fieldDefinitions.map((f) => f.field_name);

  const handleFile = async (f: File) => {
    const data = await parseSpreadsheet(f);
    setRawData(data);
    setColumns(data.length > 0 ? Object.keys(data[0]) : []);
    // Auto-map columns
    const autoMap: Record<string, string> = {};
    columns.forEach((col) => {
      const match = allFieldNames.find((fn) => fn.toLowerCase() === col.toLowerCase());
      if (match) autoMap[col] = match;
    });
    // Re-do automap with actual columns
    const actualCols = data.length > 0 ? Object.keys(data[0]) : [];
    actualCols.forEach((col) => {
      const match = allFieldNames.find((fn) => fn.toLowerCase() === col.toLowerCase());
      if (match) autoMap[col] = match;
    });
    setMapping(autoMap);
    setStep('map');
  };

  const handleImport = async () => {
    setImporting(true);
    setStep('preview');
    const { importBooks } = await import('@/lib/importExport');
    const res = await importBooks(rawData, mapping, fieldDefinitions, importMode);
    setResult(res);
    setImporting(false);
    setStep('result');
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Import Books"
      size="xl"
      footer={
        step === 'map' ? (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => setStep('preview')}>Preview</Button>
          </>
        ) : step === 'preview' ? (
          <>
            <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import Books'}
            </Button>
          </>
        ) : step === 'result' ? (
          <Button onClick={onImported}>Done</Button>
        ) : (
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        )
      }
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-700">Sample Template</p>
              <p className="text-xs text-slate-500">Download a template to see the expected format</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => downloadBookTemplate(fieldDefinitions)}>
              <Download size={14} /> Download Template
            </Button>
          </div>
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => document.getElementById('book-import-file')?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload className="mx-auto text-slate-400 mb-2" size={32} />
            <p className="text-sm text-slate-600">Click to select or drag and drop an Excel/CSV file</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx or .csv files supported</p>
            <input
              id="book-import-file"
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Map the columns from your file to the corresponding book fields:</p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {columns.map((col) => (
              <div key={col} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-1/3 truncate">{col}</span>
                <select
                  value={mapping[col] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Skip —</option>
                  {allFieldNames.map((fn) => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
            <span className="text-sm text-slate-600">Duplicate handling:</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={importMode === 'skip'} onChange={() => setImportMode('skip')} />
              Skip duplicates
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={importMode === 'update'} onChange={() => setImportMode('update')} />
              Update existing
            </label>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Preview of data to import ({rawData.length} rows):</p>
          <div className="overflow-x-auto max-h-[400px] border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-slate-600 border-b border-slate-200">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawData.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-slate-600">{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rawData.length > 50 && <p className="text-xs text-slate-400">Showing first 50 of {rawData.length} rows</p>}
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-emerald-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.success}</p>
              <p className="text-sm text-emerald-700">Imported</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
              <p className="text-sm text-amber-700">Skipped</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-600">{result.failed}</p>
              <p className="text-sm text-red-700">Failed</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto p-3 bg-red-50 rounded-lg">
              <p className="text-sm font-medium text-red-700 mb-2">Errors:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
