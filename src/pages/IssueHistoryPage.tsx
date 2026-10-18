import { useEffect, useState, useMemo } from 'react';
import { History, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useSettings } from '@/contexts/SettingsContext';
import { fetchAllIssues, fetchAcademicYears } from '@/lib/issueService';
import { fetchClasses, fetchStudents } from '@/lib/studentService';
import { formatDate } from '@/lib/utils';
import type { BookIssue, Class, Student, AcademicYear } from '@/types';

const PAGE_SIZE = 20;

export function IssueHistoryPage() {
  const { settings } = useSettings();
  const [issues, setIssues] = useState<BookIssue[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [bookFilter, setBookFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<'issue_date' | 'due_date' | 'return_date'>('issue_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: iData }, { data: cData }, { data: sData }] = await Promise.all([
        fetchAllIssues(),
        fetchClasses(),
        fetchStudents(),
      ]);
      setIssues(iData);
      setClasses(cData);
      setStudents(sData);
      setAcademicYears(await fetchAcademicYears());
      setLoading(false);
    })();
  }, []);

  const filteredIssues = useMemo(() => {
    let result = issues;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.book_number_snapshot.toLowerCase().includes(q) ||
          i.book_title_snapshot.toLowerCase().includes(q) ||
          i.student_name_snapshot.toLowerCase().includes(q) ||
          i.student_roll_number_snapshot.toLowerCase().includes(q)
      );
    }
    if (classFilter !== 'all') {
      result = result.filter((i) => i.class_name_snapshot === classFilter);
    }
    if (studentFilter !== 'all') {
      result = result.filter((i) => i.student_id === studentFilter);
    }
    if (bookFilter !== 'all') {
      result = result.filter((i) => i.book_id === bookFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter);
    }
    if (yearFilter !== 'all') {
      result = result.filter((i) => i.academic_year_id === yearFilter);
    }
    if (dateFrom) {
      result = result.filter((i) => i.issue_date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((i) => i.issue_date <= dateTo);
    }
    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return result;
  }, [issues, search, classFilter, studentFilter, bookFilter, statusFilter, yearFilter, dateFrom, dateTo, sortField, sortAsc]);

  const totalPages = Math.ceil(filteredIssues.length / PAGE_SIZE);
  const paginatedIssues = filteredIssues.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const bookOptions = useMemo(() => {
    const unique = new Map<string, { id: string; label: string }>();
    issues.forEach((issue) => unique.set(issue.book_id, {
      id: issue.book_id,
      label: `${issue.book_number_snapshot} — ${issue.book_title_snapshot}`,
    }));
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [issues]);

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
        <h1 className="text-2xl font-bold text-slate-800">Issue History</h1>
        <p className="text-sm text-slate-500 mt-1">All book issue and return transactions</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by book, student or roll number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
          <Select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
            <option value="all">All Students</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.roll_number})</option>)}
          </Select>
          <Select value={bookFilter} onChange={(e) => setBookFilter(e.target.value)}>
            <option value="all">All Books</option>
            {bookOptions.map((book) => <option key={book.id} value={book.id}>{book.label}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="issued">Issued</option>
            <option value="returned">Returned</option>
          </Select>
          <Select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="all">All Years</option>
            {academicYears.map((y) => <option key={y.id} value={y.id}>{y.year_label}</option>)}
          </Select>
          <div>
            <label className="text-xs text-slate-500">Issue Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Issue Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      <Card>
        {paginatedIssues.length === 0 ? (
          <EmptyState
            icon={<History size={40} />}
            title="No issue records found"
            description="Issue books to students to start building transaction history."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => { setSortField('issue_date'); setSortAsc(!sortAsc); }}>
                      Book No.
                    </th>
                    <th className="px-4 py-3 font-medium">Book Name</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Roll No.</th>
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium">Academic Year</th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => { setSortField('issue_date'); setSortAsc(!sortAsc); }}>
                      Issue Date {sortField === 'issue_date' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => { setSortField('due_date'); setSortAsc(!sortAsc); }}>
                      Due Date {sortField === 'due_date' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => { setSortField('return_date'); setSortAsc(!sortAsc); }}>
                      Return Date {sortField === 'return_date' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedIssues.map((issue) => (
                    <tr key={issue.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">{issue.book_number_snapshot}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">{issue.book_title_snapshot}</td>
                      <td className="px-4 py-3 text-slate-700">{issue.student_name_snapshot}</td>
                      <td className="px-4 py-3 text-slate-500">{issue.student_roll_number_snapshot}</td>
                      <td className="px-4 py-3 text-slate-500">{issue.class_name_snapshot}</td>
                      <td className="px-4 py-3 text-slate-500">{issue.academic_year?.year_label ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(issue.issue_date, settings?.date_format)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(issue.due_date, settings?.date_format)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(issue.return_date, settings?.date_format)}</td>
                      <td className="px-4 py-3">
                        {issue.status === 'issued' ? (
                          <Badge variant="info">Issued</Badge>
                        ) : (
                          <Badge variant="success">Returned</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredIssues.length}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </Card>
    </div>
  );
}
