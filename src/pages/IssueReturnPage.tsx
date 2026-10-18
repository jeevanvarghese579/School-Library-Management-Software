import { useEffect, useState, useMemo } from 'react';
import { ArrowLeftRight, BookUp, RotateCcw, Search, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSettings } from '@/contexts/SettingsContext';
import { issueBook, returnBook, searchAvailableBooks, updateIssue } from '@/lib/bookService';
import { fetchStudents, fetchClasses } from '@/lib/studentService';
import { fetchActiveIssues } from '@/lib/issueService';
import { formatDate, isOverdue, isDueToday, daysOverdue, todayString, addDays, toDateString } from '@/lib/utils';
import { parseISO } from 'date-fns';
import type { Book, Student, Class, BookIssue } from '@/types';
import { toast } from 'sonner';

export function IssueReturnPage() {
  const { settings, activeYear } = useSettings();
  const [books, setBooks] = useState<Book[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [issues, setIssues] = useState<BookIssue[]>([]);
  const [loading, setLoading] = useState(true);

  // Issue form state
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [issueDate, setIssueDate] = useState(todayString());
  const [dueDate, setDueDate] = useState('');
  const [pendingBookIds, setPendingBookIds] = useState<Set<string>>(new Set());

  // Edit issue modal
  const [editingIssue, setEditingIssue] = useState<BookIssue | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [{ data: sData }, { data: cData }, { data: iData }] = await Promise.all([
      fetchStudents(),
      fetchClasses(),
      fetchActiveIssues(),
    ]);
    setStudents(sData);
    setClasses(cData);
    setIssues(iData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-calculate due date when issue date or borrowing period changes
  useEffect(() => {
    const days = settings?.borrowing_period_days ?? 14;
    setDueDate(toDateString(addDays(parseISO(issueDate), days)));
  }, [issueDate, settings?.borrowing_period_days]);

  useEffect(() => {
    if (selectedBook || !bookSearch.trim()) {
      setBooks([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchAvailableBooks(bookSearch, 20)
        .then((matches) => setBooks(matches.filter((book) => !pendingBookIds.has(book.id))))
        .catch(() => setBooks([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [bookSearch, selectedBook, pendingBookIds]);

  const filteredBooks = books;

  const classStudents = useMemo(() => {
    if (!selectedClass) return students;
    return students.filter((s) => s.class_id === selectedClass);
  }, [students, selectedClass]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase();
    if (!query) return [];
    return classStudents.filter((student) => (
      student.name.toLocaleLowerCase().includes(query)
      || student.roll_number.toLocaleLowerCase().includes(query)
    )).slice(0, 20);
  }, [classStudents, studentSearch]);

  const selectedStudentRecord = students.find((student) => student.id === selectedStudent) ?? null;

  const handleIssue = () => {
    if (!selectedBook) {
      toast.error('Please select a book');
      return;
    }
    if (!selectedStudent) {
      toast.error('Please select a student');
      return;
    }
    if (!dueDate || parseISO(dueDate) < parseISO(issueDate)) {
      toast.error('Due date cannot be before the issue date');
      return;
    }
    const book = selectedBook;
    const student = selectedStudentRecord;
    if (!student) {
      toast.error('The selected student could not be found');
      return;
    }
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimisticIssue: BookIssue = {
      id: optimisticId,
      book_id: book.id,
      student_id: student.id,
      academic_year_id: activeYear?.id ?? null,
      issue_date: issueDate,
      due_date: dueDate,
      return_date: null,
      status: 'issued',
      book_number_snapshot: book.book_number,
      book_title_snapshot: book.name,
      student_name_snapshot: student.name,
      student_roll_number_snapshot: student.roll_number,
      class_name_snapshot: student.class?.name ?? '—',
      created_at: new Date().toISOString(),
      student,
      book,
    };
    setIssues((previous) => [optimisticIssue, ...previous]);
    setPendingBookIds((previous) => new Set(previous).add(book.id));
    setSelectedBook(null);
    setBookSearch('');
    setSelectedClass('');
    setSelectedStudent('');
    setStudentSearch('');
    setIssueDate(todayString());

    void issueBook({
      bookId: book.id,
      studentId: student.id,
      academicYearId: activeYear?.id ?? null,
      issueDate,
      dueDate,
      borrowingPeriodDays: settings?.borrowing_period_days ?? 14,
    }).then(({ error, id }) => {
      setPendingBookIds((previous) => {
        const next = new Set(previous);
        next.delete(book.id);
        return next;
      });
      if (error || !id) {
        setIssues((previous) => previous.filter((issue) => issue.id !== optimisticId));
        toast.error(error ?? 'The issue could not be saved to the cloud.');
        return;
      }
      setIssues((previous) => previous.map((issue) => issue.id === optimisticId ? { ...issue, id } : issue));
      toast.success(`"${book.name}" issued and saved to cloud`);
    });
  };

  const handleReturn = async (issueId: string, bookName: string) => {
    const { error } = await returnBook(issueId);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`"${bookName}" has been returned`);
      loadData();
    }
  };

  const handleEditSave = async (issueId: string, updates: { issue_date?: string; due_date?: string; return_date?: string | null }) => {
    const { error } = await updateIssue(issueId, updates);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Issue record updated');
      setEditingIssue(null);
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Issue / Return</h1>
        <p className="text-sm text-slate-500 mt-1">Issue books to students and manage returns</p>
      </div>

      {/* Issue form */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Issue a Book</h2>
        <div className="space-y-4">
          {/* Book selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Book</label>
            {selectedBook ? (
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <p className="text-sm font-medium text-slate-800">{selectedBook.name}</p>
                  <p className="text-xs text-slate-500">
                    {selectedBook.book_number} · {selectedBook.author || 'Unknown author'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedBook(null); setBookSearch(''); }}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by book number, title or author..."
                  value={bookSearch}
                  onChange={(e) => setBookSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {bookSearch && filteredBooks.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredBooks.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedBook(b); setBookSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                      >
                        <p className="text-sm font-medium text-slate-700">{b.name}</p>
                        <p className="text-xs text-slate-500">
                          {b.book_number} · {b.author || '—'} · {b.category || '—'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Class and Student selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Class"
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedStudent('');
                setStudentSearch('');
              }}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Student</label>
              {selectedStudentRecord ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{selectedStudentRecord.name}</p>
                    <p className="text-xs text-slate-500">
                      Roll No. {selectedStudentRecord.roll_number}
                      {selectedStudentRecord.class ? ` · ${selectedStudentRecord.class.name}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedStudent(''); setStudentSearch(''); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search by student name or roll number..."
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {studentSearch && filteredStudents.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredStudents.map((student) => (
                        <button
                          type="button"
                          key={student.id}
                          onClick={() => { setSelectedStudent(student.id); setStudentSearch(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                        >
                          <p className="text-sm font-medium text-slate-700">{student.name}</p>
                          <p className="text-xs text-slate-500">
                            Roll No. {student.roll_number}{student.class ? ` · ${student.class.name}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {studentSearch && filteredStudents.length === 0 && (
                    <p className="mt-1 text-xs text-slate-500">No students match this name or roll number.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Issue Date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <Button onClick={handleIssue} size="lg" className="w-full sm:w-auto">
            <BookUp size={18} />
            Issue Book
          </Button>
        </div>
      </Card>

      {/* Currently issued books */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Currently Issued Books ({issues.length})</h2>
        </div>
        {issues.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={40} />}
            title="No books currently issued"
            description="Use the form above to issue a book to a student."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">Book No.</th>
                  <th className="px-4 py-3 font-medium">Book Name</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Roll No.</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Issue Date</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => {
                  const pending = issue.id.startsWith('pending-');
                  const overdue = isOverdue(issue.due_date);
                  const dueToday = isDueToday(issue.due_date);
                  return (
                    <tr key={issue.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">{issue.book_number_snapshot}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{issue.book_title_snapshot}</td>
                      <td className="px-4 py-3 text-slate-700">{issue.student_name_snapshot}</td>
                      <td className="px-4 py-3 text-slate-500">{issue.student_roll_number_snapshot}</td>
                      <td className="px-4 py-3 text-slate-500">{issue.class_name_snapshot}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(issue.issue_date, settings?.date_format)}</td>
                      <td className="px-4 py-3">
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                          {formatDate(issue.due_date, settings?.date_format)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {pending ? (
                          <Badge variant="warning">Saving...</Badge>
                        ) : overdue ? (
                          <Badge variant="danger">{daysOverdue(issue.due_date)}d overdue</Badge>
                        ) : dueToday ? (
                          <Badge variant="warning">Due Today</Badge>
                        ) : (
                          <Badge variant="info">Issued</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingIssue(issue)}
                            disabled={pending}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40"
                          >
                            <Pencil size={16} />
                          </button>
                          <Button variant="success" size="sm" disabled={pending} onClick={() => handleReturn(issue.id, issue.book_title_snapshot)}>
                            <RotateCcw size={14} />
                            Return
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingIssue && (
        <EditIssueModal
          issue={editingIssue}
          onClose={() => setEditingIssue(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}

function EditIssueModal({
  issue,
  onClose,
  onSave,
}: {
  issue: BookIssue;
  onClose: () => void;
  onSave: (issueId: string, updates: { issue_date?: string; due_date?: string; return_date?: string | null }) => void;
}) {
  const [issueDate, setIssueDate] = useState(issue.issue_date);
  const [dueDate, setDueDate] = useState(issue.due_date);
  const [returnDate, setReturnDate] = useState(issue.return_date ?? '');

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Edit Issue Record"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(issue.id, {
            issue_date: issueDate,
            due_date: dueDate,
            return_date: returnDate || null,
          })}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-sm font-medium text-slate-700">{issue.book_title_snapshot}</p>
          <p className="text-xs text-slate-500">
            {issue.book_number_snapshot} · {issue.student_name_snapshot} ({issue.student_roll_number_snapshot})
          </p>
        </div>
        <Input
          label="Issue Date"
          type="date"
          value={issueDate}
          onChange={(e) => setIssueDate(e.target.value)}
        />
        <Input
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <Input
          label="Return Date"
          type="date"
          value={returnDate}
          onChange={(e) => setReturnDate(e.target.value)}
        />
      </div>
    </Modal>
  );
}
