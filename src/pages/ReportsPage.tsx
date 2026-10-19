import { useEffect, useState, useMemo } from 'react';
import { FileBarChart, Download, Printer, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { useSettings } from '@/contexts/SettingsContext';
import { fetchAllIssues, fetchAcademicYears } from '@/lib/issueService';
import { fetchClasses } from '@/lib/studentService';
import { generateIssuePdf } from '@/lib/pdfGenerator';
import { issuesForReport } from '@/lib/reportUtils';
import type { BookIssue, Class, AcademicYear } from '@/types';
import { toast } from 'sonner';

export function ReportsPage() {
  const { settings, activeYear } = useSettings();
  const [issues, setIssues] = useState<BookIssue[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);

  const [yearFilter, setYearFilter] = useState(activeYear?.id ?? '');
  const [classFilter, setClassFilter] = useState('all');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: iData }, { data: cData }, yData] = await Promise.all([
        fetchAllIssues(),
        fetchClasses(),
        fetchAcademicYears(),
      ]);
      setIssues(iData);
      setClasses(cData);
      setAcademicYears(yData);
      setYearFilter((current) => current || yData.find((year) => year.is_active)?.id || yData[0]?.id || '');
      setLoading(false);
    })();
  }, []);

  const selectedYear = academicYears.find((y) => y.id === yearFilter) ?? null;
  const filteredIssues = useMemo(
    () => issuesForReport(issues, selectedYear, classFilter),
    [issues, selectedYear, classFilter],
  );

  const handleGeneratePdf = async () => {
    if (filteredIssues.length === 0) {
      toast.error('No issues found for the selected criteria');
      return;
    }
    setGeneratingPdf(true);
    try {
      await generateIssuePdf({
        issues: filteredIssues,
        settings: settings!,
        academicYear: selectedYear ?? null,
        className: classFilter === 'all' ? undefined : classFilter,
        orientation,
      });
      toast.success(`PDF generated with ${filteredIssues.length} records`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to generate the PDF report.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const classGroups = useMemo(() => {
    const groups = new Map<string, BookIssue[]>();
    filteredIssues.forEach((issue) => {
      const cls = issue.class_name_snapshot || 'Unassigned';
      const arr = groups.get(cls) ?? [];
      arr.push(issue);
      groups.set(cls, arr);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredIssues]);

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
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Generate and download book issue reports</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Print All Issues — A4 PDF Report</h2>
        <p className="text-sm text-slate-500 mb-4">
          Generates a class-wise PDF containing every book issue transaction (issued and returned).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <Select
            label="Academic Year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="" disabled>Select academic year</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>{y.year_label}</option>
            ))}
          </Select>
          <Select
            label="Class"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </Select>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          {selectedYear?.start_date && selectedYear?.end_date
            ? `Report period: ${selectedYear.start_date} to ${selectedYear.end_date}`
            : 'Set this academic year’s start and end dates in Settings to define its exact report period.'}
        </p>

        <div className="flex items-center gap-4 mb-6">
          <label className="block text-sm font-medium text-slate-700">Orientation:</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="radio"
                checked={orientation === 'portrait'}
                onChange={() => setOrientation('portrait')}
              />
              Portrait
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="radio"
                checked={orientation === 'landscape'}
                onChange={() => setOrientation('landscape')}
              />
              Landscape
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleGeneratePdf} size="lg" disabled={generatingPdf}>
            <Download size={18} />
            {generatingPdf ? 'Generating PDF...' : 'Print All Issues (PDF)'}
          </Button>
          <Button variant="outline" onClick={handlePrint} size="lg">
            <Printer size={18} />
            Browser Print
          </Button>
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            <FileText size={16} className="inline mr-1" />
            {filteredIssues.length} records will be included in the report across {classGroups.length} class(es).
          </p>
        </div>
      </Card>

      {/* Preview */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Preview — Class-wise Summary</h2>
        </div>
        {classGroups.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <FileBarChart size={40} className="mx-auto mb-2" />
            <p className="text-sm">No records to preview. Adjust filters above.</p>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {classGroups.map(([className, classIssues]) => (
              <div key={className} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="font-semibold text-slate-700">CLASS {className.toUpperCase()}</span>
                  <span className="text-sm text-slate-500 ml-2">({classIssues.length} records)</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="px-3 py-2">S.No.</th>
                      <th className="px-3 py-2">Book No.</th>
                      <th className="px-3 py-2">Book Name</th>
                      <th className="px-3 py-2">Issued To</th>
                      <th className="px-3 py-2">Issue Date</th>
                      <th className="px-3 py-2">Return Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classIssues.slice(0, 5).map((issue, idx) => (
                      <tr key={issue.id} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                        <td className="px-3 py-2 text-slate-600">{issue.book_number_snapshot}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{issue.book_title_snapshot}</td>
                        <td className="px-3 py-2 text-slate-600">{issue.student_name_snapshot} ({issue.student_roll_number_snapshot})</td>
                        <td className="px-3 py-2 text-slate-500">{issue.issue_date}</td>
                        <td className="px-3 py-2 text-slate-500">{issue.return_date ?? '—'}</td>
                      </tr>
                    ))}
                    {classIssues.length > 5 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-center text-slate-400">
                          ...and {classIssues.length - 5} more records
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
