import { useEffect, useState, useMemo } from 'react';
import { BookOpen, BookCheck, BookX, Clock, Users, GraduationCap, BookMarked, BookUp } from 'lucide-react';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Input';
import { fetchDashboardStats, returnBook } from '@/lib/bookService';
import { fetchClasses } from '@/lib/studentService';
import { fetchActiveIssues } from '@/lib/issueService';
import { useSettings } from '@/contexts/SettingsContext';
import { formatDate, isOverdue, isDueToday, daysOverdue } from '@/lib/utils';
import type { BookIssue, Class } from '@/types';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';

type FilterType = 'all' | 'overdue' | 'due_today';

export function DashboardPage() {
  const { settings, activeYear } = useSettings();
  const [stats, setStats] = useState({
    totalBooks: 0,
    availableBooks: 0,
    issuedBooks: 0,
    overdueBooks: 0,
    totalStudents: 0,
    totalClasses: 0,
    returnedBooks: 0,
    issuedToday: 0,
  });
  const [issues, setIssues] = useState<BookIssue[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState('');

  const loadAll = async () => {
    const [s, { data: issueData }, { data: classData }] = await Promise.all([
      fetchDashboardStats(),
      fetchActiveIssues(),
      fetchClasses(),
    ]);
    const issuedBooks = issueData.length;
    setStats({
      ...s,
      issuedBooks,
      availableBooks: Math.max(0, s.totalBooks - issuedBooks),
      overdueBooks: issueData.filter((issue) => isOverdue(issue.due_date)).length,
    });
    setIssues(issueData);
    setClasses(classData);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleReturn = async (issueId: string, bookName: string) => {
    const { error } = await returnBook(issueId);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`"${bookName}" has been returned`);
      loadAll();
    }
  };

  const filteredIssues = useMemo(() => {
    let result = issues;
    if (filter === 'overdue') {
      result = result.filter((i) => isOverdue(i.due_date));
    } else if (filter === 'due_today') {
      result = result.filter((i) => isDueToday(i.due_date));
    }
    if (classFilter !== 'all') {
      result = result.filter((i) => i.class_name_snapshot === classFilter);
    }
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      result = result.filter(
        (i) =>
          i.student_name_snapshot.toLowerCase().includes(q) ||
          i.student_roll_number_snapshot.toLowerCase().includes(q)
      );
    }
    return result;
  }, [issues, filter, classFilter, studentSearch]);

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
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          {activeYear ? `Academic Year ${activeYear.year_label}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Books" value={stats.totalBooks} icon={<BookOpen size={22} />} />
        <StatCard
          label="Available Books"
          value={stats.availableBooks}
          icon={<BookCheck size={22} />}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Currently Issued"
          value={stats.issuedBooks}
          icon={<BookUp size={22} />}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Overdue Books"
          value={stats.overdueBooks}
          icon={<BookX size={22} />}
          color="bg-red-50 text-red-600"
        />
        <StatCard
          label="Total Students"
          value={stats.totalStudents}
          icon={<Users size={22} />}
          color="bg-cyan-50 text-cyan-600"
        />
        <StatCard
          label="Total Classes"
          value={stats.totalClasses}
          icon={<GraduationCap size={22} />}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Books Returned"
          value={stats.returnedBooks}
          icon={<BookMarked size={22} />}
          color="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Issued Today"
          value={stats.issuedToday}
          icon={<Clock size={22} />}
          color="bg-indigo-50 text-indigo-600"
        />
      </div>

      <Card>
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Currently Issued Books</h2>
          <div className="flex flex-wrap gap-3 mt-3">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'overdue', 'due_today'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All Issued' : f === 'overdue' ? 'Overdue' : 'Due Today'}
                </button>
              ))}
            </div>
            <Select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-auto min-w-[140px]"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
            <input
              type="text"
              placeholder="Search student name or roll no..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
            />
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <EmptyState
            icon={<BookUp size={40} />}
            title="No issued books"
            description="There are no books matching the current filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">Book Number</th>
                  <th className="px-4 py-3 font-medium">Book Name</th>
                  <th className="px-4 py-3 font-medium">Student Name</th>
                  <th className="px-4 py-3 font-medium">Roll No.</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Issue Date</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue) => {
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
                        {overdue ? (
                          <Badge variant="danger">{daysOverdue(issue.due_date)}d overdue</Badge>
                        ) : dueToday ? (
                          <Badge variant="warning">Due Today</Badge>
                        ) : (
                          <Badge variant="info">Issued</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleReturn(issue.id, issue.book_title_snapshot)}
                        >
                          <RotateCcw size={14} />
                          Return
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
