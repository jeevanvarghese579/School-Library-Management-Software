import { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  fetchStudents,
  fetchClasses,
  createStudent,
  updateStudent,
  archiveStudent,
  checkStudentHasIssues,
} from '@/lib/studentService';
import { exportToExcel, exportToCSV, parseSpreadsheet, downloadStudentTemplate, importStudents } from '@/lib/importExport';
import type { Student, Class } from '@/types';
import { toast } from 'sonner';

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [showImport, setShowImport] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [{ data: sData }, { data: cData }] = await Promise.all([fetchStudents(), fetchClasses()]);
    setStudents(sData);
    setClasses(cData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const groupedStudents = useMemo(() => {
    let result = students;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q)
      );
    }
    if (classFilter !== 'all') {
      result = result.filter((s) => s.class_id === classFilter);
    }
    // Group by class
    const groups = new Map<string, Student[]>();
    result.forEach((s) => {
      const key = s.class?.name ?? 'No Class';
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [students, search, classFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const hasIssues = await checkStudentHasIssues(deleteTarget.id);
    if (hasIssues) {
      const { error } = await archiveStudent(deleteTarget.id);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`"${deleteTarget.name}" has been archived (has active issues).`);
      }
    } else {
      const { error } = await archiveStudent(deleteTarget.id);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`"${deleteTarget.name}" has been deleted.`);
      }
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
    loadData();
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    const rows = students.map((s) => ({
      'Student Name': s.name,
      'Roll Number': s.roll_number,
      Class: s.class?.name ?? '',
    }));
    const filename = `students_export_${new Date().toISOString().split('T')[0]}.${format}`;
    if (format === 'xlsx') exportToExcel(rows, filename, 'Students');
    else exportToCSV(rows, filename);
    toast.success(`Exported ${rows.length} students`);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Students</h1>
          <p className="text-sm text-slate-500 mt-1">{students.length} students enrolled</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload size={16} /> Import
          </Button>
          <Button variant="outline" onClick={() => handleExport('xlsx')}>
            <Download size={16} /> Export
          </Button>
          <Button onClick={() => { setEditingStudent(null); setShowAddEdit(true); }}>
            <Plus size={16} /> Add Student
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or roll number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-auto min-w-[150px]"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      </Card>

      {groupedStudents.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={40} />}
            title="No students found"
            description="Add students manually or import from a spreadsheet."
            action={
              <Button onClick={() => { setEditingStudent(null); setShowAddEdit(true); }}>
                <Plus size={16} /> Add Student
              </Button>
            }
          />
        </Card>
      ) : (
        groupedStudents.map(([className, groupStudents]) => (
          <Card key={className}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-semibold text-slate-700">{className}</h3>
              <Badge variant="neutral">{groupStudents.length} students</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="px-4 py-3 font-medium">Student Name</th>
                    <th className="px-4 py-3 font-medium">Roll Number</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupStudents.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-slate-500">{s.roll_number}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditingStudent(s); setShowAddEdit(true); }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(s); setShowDeleteConfirm(true); }}
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
          </Card>
        ))
      )}

      {showAddEdit && (
        <StudentForm
          student={editingStudent}
          classes={classes}
          onClose={() => { setShowAddEdit(false); setEditingStudent(null); }}
          onSaved={() => { setShowAddEdit(false); setEditingStudent(null); loadData(); }}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Student"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? If this student has active issues, they will be archived instead.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
      />

      {showImport && (
        <StudentImportModal
          classes={classes}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadData(); }}
        />
      )}
    </div>
  );
}

function StudentForm({
  student,
  classes,
  onClose,
  onSaved,
}: {
  student: Student | null;
  classes: Class[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(student?.name ?? '');
  const [rollNumber, setRollNumber] = useState(student?.roll_number ?? '');
  const [classId, setClassId] = useState(student?.class_id ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !rollNumber.trim()) {
      toast.error('Name and roll number are required');
      return;
    }
    setSaving(true);
    const data = {
      name: name.trim(),
      roll_number: rollNumber.trim(),
      class_id: classId || null,
    };
    const { error } = student
      ? await updateStudent(student.id, data)
      : await createStudent(data);
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(student ? 'Student updated' : 'Student added');
      onSaved();
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={student ? 'Edit Student' : 'Add Student'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : student ? 'Update' : 'Add Student'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Student Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Roll Number *"
          value={rollNumber}
          onChange={(e) => setRollNumber(e.target.value)}
        />
        <Select
          label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">— No Class —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}

function StudentImportModal({
  classes,
  onClose,
  onImported,
}: {
  classes: Class[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<{ success: number; skipped: number; failed: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (f: File) => {
    const data = await parseSpreadsheet(f);
    setRawData(data);
    setStep('preview');
  };

  const handleImport = async () => {
    setImporting(true);
    const res = await importStudents(rawData, classes, importMode);
    setResult(res);
    setImporting(false);
    setStep('result');
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Import Students"
      size="xl"
      footer={
        step === 'preview' ? (
          <>
            <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import Students'}
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
            <Button variant="outline" size="sm" onClick={() => downloadStudentTemplate()}>
              <Download size={14} /> Download Template
            </Button>
          </div>
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => document.getElementById('student-import-file')?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload className="mx-auto text-slate-400 mb-2" size={32} />
            <p className="text-sm text-slate-600">Click to select or drag and drop an Excel/CSV file</p>
            <input
              id="student-import-file"
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Preview ({rawData.length} rows):</p>
          <div className="overflow-x-auto max-h-[400px] border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Student Name</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Roll Number</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Class</th>
                </tr>
              </thead>
              <tbody>
                {rawData.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">{row['Student Name'] ?? row['Name'] ?? ''}</td>
                    <td className="px-3 py-2 text-slate-600">{row['Roll Number'] ?? row['Roll No'] ?? ''}</td>
                    <td className="px-3 py-2 text-slate-600">{row['Class'] ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
