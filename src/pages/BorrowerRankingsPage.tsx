import { useEffect, useMemo, useState } from 'react';
import { Trophy, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { useSettings } from '@/contexts/SettingsContext';
import { fetchAcademicYears, fetchAllIssues } from '@/lib/issueService';
import { getBorrowerRankings, issuesForReport } from '@/lib/reportUtils';
import type { AcademicYear, BookIssue } from '@/types';

const rankStyles = [
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-slate-100 text-slate-600 border-slate-200',
  'bg-orange-100 text-orange-700 border-orange-200',
];

export function BorrowerRankingsPage() {
  const { activeYear } = useSettings();
  const [issues, setIssues] = useState<BookIssue[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState(activeYear?.id ?? '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data }, years] = await Promise.all([fetchAllIssues(), fetchAcademicYears()]);
      setIssues(data);
      setAcademicYears(years);
      setYearId((current) => current || years.find((year) => year.is_active)?.id || years[0]?.id || '');
      setLoading(false);
    })();
  }, []);

  const selectedYear = academicYears.find((year) => year.id === yearId) ?? null;
  const rankings = useMemo(
    () => getBorrowerRankings(issuesForReport(issues, selectedYear)),
    [issues, selectedYear],
  );

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
        <h1 className="text-2xl font-bold text-slate-800">Borrower Rankings</h1>
        <p className="text-sm text-slate-500 mt-1">Students ranked by the number of books issued to them</p>
      </div>

      <Card className="p-5">
        <div className="max-w-md">
          <Select label="Academic Year" value={yearId} onChange={(event) => setYearId(event.target.value)}>
            <option value="" disabled>Select academic year</option>
            {academicYears.map((year) => <option key={year.id} value={year.id}>{year.year_label}</option>)}
          </Select>
        </div>
        <p className="text-sm text-slate-500 mt-3">
          {selectedYear?.start_date && selectedYear?.end_date
            ? `Ranking period: ${selectedYear.start_date} to ${selectedYear.end_date}`
            : 'This ranking includes issues assigned to the selected academic year.'}
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-800">All Borrowers</h2>
          </div>
          <span className="text-sm text-slate-500">{rankings.length} ranked students</span>
        </div>

        {rankings.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Users size={40} className="mx-auto mb-2" />
            <p className="text-sm">No borrowing records for this academic year.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                  <th className="px-5 py-3 font-medium w-24">Rank</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Roll Number</th>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium text-right">Books Taken</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((borrower, index) => (
                  <tr key={borrower.studentId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <span className={`inline-flex min-w-10 justify-center rounded-full border px-2.5 py-1 font-bold ${rankStyles[index] ?? 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">{borrower.name}</td>
                    <td className="px-5 py-3 text-slate-600">{borrower.rollNumber || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{borrower.className}</td>
                    <td className="px-5 py-3 text-right font-semibold text-blue-700">{borrower.bookCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
