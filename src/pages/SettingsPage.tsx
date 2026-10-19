import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Calendar,
  BookOpen,
  Database,
  Info,
  Download,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSettings } from '@/contexts/SettingsContext';
import { exportToExcel, exportToCSV, downloadBookTemplate, downloadStudentTemplate, prepareBookExportRows } from '@/lib/importExport';
import { fetchBookCustomValues, fetchBooks } from '@/lib/bookService';
import { fetchStudents, fetchClasses } from '@/lib/studentService';
import {
  fetchAcademicYears,
  createAcademicYear,
  updateAcademicYearDates,
  setActiveAcademicYear,
  deleteAcademicYear,
} from '@/lib/issueService';
import { createDocument, createdAt, deleteDocument, listDocuments, updateDocument } from '@/lib/firestoreData';
import {
  eraseAllBooks,
  eraseAllStudents,
  getEraseManifest,
  type EraseManifest,
  type EraseTarget,
} from '@/lib/dataManagementService';
import type { AppSettings, BookFieldDefinition, AcademicYear } from '@/types';
import { toast } from 'sonner';

type SettingsTab = 'general' | 'book' | 'data' | 'about';

export function SettingsPage() {
  const { settings, fieldDefinitions, refreshSettings, refreshFieldDefinitions, refreshActiveYear } = useSettings();
  const [tab, setTab] = useState<SettingsTab>('general');

  const tabs: { key: SettingsTab; label: string; icon: typeof SettingsIcon }[] = [
    { key: 'general', label: 'General', icon: SettingsIcon },
    { key: 'book', label: 'Book Settings', icon: BookOpen },
    { key: 'data', label: 'Data Management', icon: Database },
    { key: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your library management system</p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <GeneralSettings
          settings={settings}
          refreshSettings={refreshSettings}
          refreshActiveYear={refreshActiveYear}
        />
      )}
      {tab === 'book' && (
        <BookSettings
          fieldDefinitions={fieldDefinitions}
          refreshFieldDefinitions={refreshFieldDefinitions}
          settings={settings}
          refreshSettings={refreshSettings}
        />
      )}
      {tab === 'data' && <DataManagement settings={settings} fieldDefinitions={fieldDefinitions} />}
      {tab === 'about' && <AboutSection />}
    </div>
  );
}

function GeneralSettings({
  settings,
  refreshSettings,
  refreshActiveYear,
}: {
  settings: AppSettings | null;
  refreshSettings: () => Promise<void>;
  refreshActiveYear: () => Promise<void>;
}) {
  const [schoolName, setSchoolName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy');
  const [borrowingPeriod, setBorrowingPeriod] = useState(14);
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [newYearLabel, setNewYearLabel] = useState('');
  const [newYearStartDate, setNewYearStartDate] = useState('');
  const [newYearEndDate, setNewYearEndDate] = useState('');
  const [showDeleteYearConfirm, setShowDeleteYearConfirm] = useState(false);
  const [deleteYearTarget, setDeleteYearTarget] = useState<AcademicYear | null>(null);

  useEffect(() => {
    if (settings) {
      setSchoolName(settings.school_name);
      setCurrency(settings.currency);
      setCurrencySymbol(settings.currency_symbol);
      setDateFormat(settings.date_format);
      setBorrowingPeriod(settings.borrowing_period_days);
      setLogo(settings.school_logo ?? '');
    }
  }, [settings]);

  useEffect(() => {
    (async () => setAcademicYears(await fetchAcademicYears()))();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    let error: Error | null = null;
    try {
      await updateDocument('app_settings', settings.id, {
        school_name: schoolName,
        currency,
        currency_symbol: currencySymbol,
        date_format: dateFormat,
        borrowing_period_days: borrowingPeriod,
        school_logo: logo || null,
      });
    } catch (caught) { error = caught as Error; }
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Settings saved');
      refreshSettings();
    }
  };

  const handleCreateYear = async () => {
    if (!newYearLabel.trim()) {
      toast.error('Academic year label is required');
      return;
    }
    if (!newYearStartDate || !newYearEndDate) {
      toast.error('Select the academic year start and end dates');
      return;
    }
    const { error } = await createAcademicYear(newYearLabel.trim(), newYearStartDate, newYearEndDate);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Academic year created');
      setNewYearLabel('');
      setNewYearStartDate('');
      setNewYearEndDate('');
      setAcademicYears(await fetchAcademicYears());
    }
  };

  const handleYearDateChange = (id: string, field: 'start_date' | 'end_date', value: string) => {
    setAcademicYears((years) => years.map((year) => year.id === id ? { ...year, [field]: value } : year));
  };

  const handleSaveYearDates = async (year: AcademicYear) => {
    const { error } = await updateAcademicYearDates(year.id, year.start_date ?? '', year.end_date ?? '');
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Dates saved for ${year.year_label}`);
    setAcademicYears(await fetchAcademicYears());
    await refreshActiveYear();
  };

  const handleSetActiveYear = async (id: string) => {
    const { error } = await setActiveAcademicYear(id);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Active academic year changed');
      refreshActiveYear();
      setAcademicYears(await fetchAcademicYears());
    }
  };

  const handleDeleteYear = async () => {
    if (!deleteYearTarget) return;
    const { error } = await deleteAcademicYear(deleteYearTarget.id);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Academic year deleted');
      setAcademicYears(await fetchAcademicYears());
    }
    setShowDeleteYearConfirm(false);
    setDeleteYearTarget(null);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      toast.error('Logo must be under 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const currencies = [
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">General Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="School Name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              const c = currencies.find((c) => c.code === e.target.value);
              if (c) setCurrencySymbol(c.symbol);
            }}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>
            ))}
          </Select>
          <Select
            label="Date Format"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
          >
            <option value="dd/MM/yyyy">DD/MM/YYYY</option>
            <option value="MM/dd/yyyy">MM/DD/YYYY</option>
            <option value="yyyy-MM-dd">YYYY-MM-DD</option>
            <option value="dd-MM-yyyy">DD-MM-YYYY</option>
          </Select>
          <Input
            label="Maximum Book Holding Period (days)"
            type="number"
            min="1"
            value={borrowingPeriod}
            onChange={(e) => setBorrowingPeriod(parseInt(e.target.value) || 14)}
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">School Logo (optional, max 500KB)</label>
          <div className="flex items-center gap-4">
            {logo && (
              <img src={logo} alt="School logo" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:cursor-pointer"
            />
            {logo && (
              <Button variant="ghost" size="sm" onClick={() => setLogo('')}>Remove</Button>
            )}
          </div>
        </div>

        <div className="mt-6">
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Academic Year</h2>
        </div>
        <div className="space-y-2">
          {academicYears.map((year) => (
            <div key={year.id} className="p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">{year.year_label}</span>
                  {year.is_active && <Badge variant="success">Active</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {!year.is_active && (
                    <Button variant="outline" size="sm" onClick={() => handleSetActiveYear(year.id)}>
                      Set Active
                    </Button>
                  )}
                  <button
                    onClick={() => { setDeleteYearTarget(year); setShowDeleteYearConfirm(true); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label={`Delete ${year.year_label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <Input
                  label="Start Date"
                  type="date"
                  value={year.start_date ?? ''}
                  onChange={(event) => handleYearDateChange(year.id, 'start_date', event.target.value)}
                />
                <Input
                  label="End Date"
                  type="date"
                  value={year.end_date ?? ''}
                  onChange={(event) => handleYearDateChange(year.id, 'end_date', event.target.value)}
                />
                <Button variant="outline" onClick={() => handleSaveYearDates(year)}>
                  <Save size={16} /> Save Dates
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] gap-3 mt-4 items-end p-4 bg-slate-50 rounded-lg">
          <Input
            label="Academic Year Label"
            placeholder="e.g., 2027–2028"
            value={newYearLabel}
            onChange={(e) => setNewYearLabel(e.target.value)}
          />
          <Input label="Start Date" type="date" value={newYearStartDate} onChange={(e) => setNewYearStartDate(e.target.value)} />
          <Input label="End Date" type="date" value={newYearEndDate} onChange={(e) => setNewYearEndDate(e.target.value)} />
          <Button onClick={handleCreateYear}>
            <Plus size={16} /> Add Year
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={showDeleteYearConfirm}
        title="Delete Academic Year"
        message={`Delete academic year "${deleteYearTarget?.year_label}"? This cannot be undone if the year has issue records.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteYear}
        onCancel={() => { setShowDeleteYearConfirm(false); setDeleteYearTarget(null); }}
      />
    </div>
  );
}

function BookSettings({
  fieldDefinitions,
  refreshFieldDefinitions,
  settings,
  refreshSettings,
}: {
  fieldDefinitions: BookFieldDefinition[];
  refreshFieldDefinitions: () => Promise<void>;
  settings: AppSettings | null;
  refreshSettings: () => Promise<void>;
}) {
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<BookFieldDefinition | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BookFieldDefinition | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    let error: Error | null = null;
    try { await deleteDocument('book_field_definitions', deleteTarget.id); } catch (caught) { error = caught as Error; }
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Custom field deleted');
      refreshFieldDefinitions();
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleToggleVisible = async (field: BookFieldDefinition) => {
    let error: Error | null = null;
    try { await updateDocument('book_field_definitions', field.id, { is_visible: !field.is_visible }); } catch (caught) { error = caught as Error; }
    if (error) {
      toast.error(error.message);
    } else {
      refreshFieldDefinitions();
    }
  };

  const handleMoveOrder = async (field: BookFieldDefinition, direction: 'up' | 'down') => {
    const sorted = [...fieldDefinitions].sort((a, b) => a.display_order - b.display_order);
    const index = sorted.findIndex((f) => f.id === field.id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const swapField = sorted[swapIndex];

    await Promise.all([
      updateDocument('book_field_definitions', field.id, { display_order: swapField.display_order }),
      updateDocument('book_field_definitions', swapField.id, { display_order: field.display_order }),
    ]);
    refreshFieldDefinitions();
  };

  const sortedFields = [...fieldDefinitions].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Default Borrowing Period</h2>
        <p className="text-sm text-slate-500 mb-4">
          When a book is issued, the due date is automatically calculated as: Issue Date + Borrowing Period.
          Changing this setting does not affect previously issued books.
        </p>
        <BorrowingPeriodSetting settings={settings} refreshSettings={refreshSettings} />
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Manage Book Fields</h2>
            <p className="text-sm text-slate-500 mt-1">Add, edit, reorder or hide fields for book records</p>
          </div>
          <Button onClick={() => { setEditingField(null); setShowAddField(true); }}>
            <Plus size={16} /> Add Field
          </Button>
        </div>

        <div className="space-y-2">
          {sortedFields.map((field, idx) => (
            <div key={field.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveOrder(field, 'up')}
                    disabled={idx === 0}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => handleMoveOrder(field, 'down')}
                    disabled={idx === sortedFields.length - 1}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{field.field_name}</span>
                    {field.is_default && <Badge variant="neutral">Default</Badge>}
                    {field.is_required && <Badge variant="warning">Required</Badge>}
                    {!field.is_visible && <Badge variant="default">Hidden</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Type: {field.field_type}
                    {field.dropdown_options && field.dropdown_options.length > 0
                      ? ` · Options: ${field.dropdown_options.join(', ')}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleVisible(field)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={field.is_visible ? 'Hide' : 'Show'}
                >
                  {field.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => { setEditingField(field); setShowAddField(true); }}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                >
                  <Pencil size={16} />
                </button>
                {!field.is_default && (
                  <button
                    onClick={() => { setDeleteTarget(field); setShowDeleteConfirm(true); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {showAddField && (
        <FieldForm
          field={editingField}
          maxOrder={Math.max(...fieldDefinitions.map((f) => f.display_order), 0)}
          onClose={() => { setShowAddField(false); setEditingField(null); }}
          onSaved={() => { setShowAddField(false); setEditingField(null); refreshFieldDefinitions(); }}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Custom Field"
        message={`Delete field "${deleteTarget?.field_name}"? Custom values stored for this field will also be removed.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

function BorrowingPeriodSetting({ settings, refreshSettings }: { settings: AppSettings | null; refreshSettings: () => Promise<void> }) {
  const [days, setDays] = useState(settings?.borrowing_period_days ?? 14);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setDays(settings.borrowing_period_days);
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    let error: Error | null = null;
    try { await updateDocument('app_settings', settings.id, { borrowing_period_days: days }); } catch (caught) { error = caught as Error; }
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Borrowing period updated');
      refreshSettings();
    }
  };

  return (
    <div className="flex items-end gap-3">
      <Input
        label="Days"
        type="number"
        min="1"
        value={days}
        onChange={(e) => setDays(parseInt(e.target.value) || 14)}
        className="w-32"
      />
      <Button onClick={handleSave} disabled={saving}>
        <Save size={16} /> {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}

function FieldForm({
  field,
  maxOrder,
  onClose,
  onSaved,
}: {
  field: BookFieldDefinition | null;
  maxOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fieldName, setFieldName] = useState(field?.field_name ?? '');
  const [fieldType, setFieldType] = useState<BookFieldDefinition['field_type']>(field?.field_type ?? 'text');
  const [isRequired, setIsRequired] = useState(field?.is_required ?? false);
  const [isVisible, setIsVisible] = useState(field?.is_visible ?? true);
  const [options, setOptions] = useState((field?.dropdown_options ?? []).join(', '));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!fieldName.trim()) {
      toast.error('Field name is required');
      return;
    }
    setSaving(true);
    const data: Record<string, unknown> = {
      field_name: fieldName.trim(),
      field_type: fieldType,
      is_required: isRequired,
      is_visible: isVisible,
    };
    if (fieldType === 'dropdown') {
      data.dropdown_options = options.split(',').map((o) => o.trim()).filter(Boolean);
    }
    if (!field) {
      data.display_order = maxOrder + 1;
      data.is_default = false;
    }

    let error: Error | null = null;
    try {
      if (field) await updateDocument('book_field_definitions', field.id, data);
      else await createDocument('book_field_definitions', { ...data, created_at: createdAt() });
    } catch (caught) { error = caught as Error; }

    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(field ? 'Field updated' : 'Field added');
      onSaved();
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={field ? 'Edit Field' : 'Add Custom Field'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : field ? 'Update' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Field Name *"
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
        />
        <Select
          label="Field Type"
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value as BookFieldDefinition['field_type'])}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="dropdown">Dropdown</option>
          <option value="boolean">Boolean (Checkbox)</option>
        </Select>
        {fieldType === 'dropdown' && (
          <Input
            label="Dropdown Options (comma-separated)"
            placeholder="Option 1, Option 2, Option 3"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        )}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Required
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isVisible}
              onChange={(e) => setIsVisible(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Visible in table
          </label>
        </div>
      </div>
    </Modal>
  );
}

function DataManagement({ settings, fieldDefinitions }: { settings: AppSettings | null; fieldDefinitions: BookFieldDefinition[] }) {
  const [eraseTarget, setEraseTarget] = useState<EraseTarget | null>(null);
  const [eraseStep, setEraseStep] = useState<1 | 2>(1);
  const [eraseManifest, setEraseManifest] = useState<EraseManifest | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [erasing, setErasing] = useState(false);

  const closeEraseDialog = () => {
    if (erasing) return;
    setEraseTarget(null);
    setEraseStep(1);
    setEraseManifest(null);
    setConfirmationText('');
    setBackupConfirmed(false);
  };

  const openEraseDialog = async (target: EraseTarget) => {
    setEraseTarget(target);
    setEraseStep(1);
    setLoadingManifest(true);
    setConfirmationText('');
    setBackupConfirmed(false);
    try {
      setEraseManifest(await getEraseManifest());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to inspect the data selected for deletion.');
      setEraseTarget(null);
    } finally {
      setLoadingManifest(false);
    }
  };

  const requiredPhrase = eraseTarget === 'books' ? 'ERASE ALL BOOKS' : 'ERASE ALL STUDENTS';

  const handleErase = async () => {
    if (!eraseTarget || confirmationText !== requiredPhrase || !backupConfirmed) return;
    setErasing(true);
    try {
      let deleted = 0;
      if (eraseTarget === 'books') deleted = (await eraseAllBooks()).books;
      else deleted = (await eraseAllStudents()).students;
      toast.success(`${deleted} ${eraseTarget} permanently erased from this library only.`);
      setEraseTarget(null);
      setEraseManifest(null);
      setEraseStep(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The data could not be erased.');
    } finally {
      setErasing(false);
    }
  };

  const handleExportBooks = async (format: 'xlsx' | 'csv') => {
    const { data: books } = await fetchBooks();
    const cvMap = await fetchBookCustomValues(books.map((b) => b.id));
    const rows = prepareBookExportRows(books, fieldDefinitions, cvMap, settings?.currency_symbol);
    const filename = `books_backup_${new Date().toISOString().split('T')[0]}.${format}`;
    if (format === 'xlsx') exportToExcel(rows, filename, 'Books');
    else exportToCSV(rows, filename);
    toast.success(`Exported ${rows.length} books`);
  };

  const handleExportStudents = async (format: 'xlsx' | 'csv') => {
    const { data: students } = await fetchStudents();
    const rows = students.map((s) => ({
      'Student Name': s.name,
      'Roll Number': s.roll_number,
      Class: s.class?.name ?? '',
    }));
    const filename = `students_backup_${new Date().toISOString().split('T')[0]}.${format}`;
    if (format === 'xlsx') exportToExcel(rows, filename, 'Students');
    else exportToCSV(rows, filename);
    toast.success(`Exported ${rows.length} students`);
  };

  const handleBackup = async () => {
    const { data: books } = await fetchBooks();
    const { data: students } = await fetchStudents();
    const { data: classes } = await fetchClasses();
    const [issues, years, fieldDefs, appSettings] = await Promise.all([
      listDocuments('book_issues'), listDocuments('academic_years'),
      listDocuments('book_field_definitions'), listDocuments('app_settings'),
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      books,
      students,
      classes,
      book_issues: issues,
      academic_years: years,
      book_field_definitions: fieldDefs,
      app_settings: appSettings,
    };

    // Also export as JSON
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `library_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Backup downloaded');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Book Data</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => downloadBookTemplate(fieldDefinitions)}>
            <Download size={16} /> Book Import Template
          </Button>
          <Button variant="outline" onClick={() => handleExportBooks('xlsx')}>
            <Download size={16} /> Export Books (Excel)
          </Button>
          <Button variant="outline" onClick={() => handleExportBooks('csv')}>
            <Download size={16} /> Export Books (CSV)
          </Button>
          <Button variant="danger" onClick={() => openEraseDialog('books')}>
            <Trash2 size={16} /> Erase All Books
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Student Data</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => downloadStudentTemplate()}>
            <Download size={16} /> Student Import Template
          </Button>
          <Button variant="outline" onClick={() => handleExportStudents('xlsx')}>
            <Download size={16} /> Export Students (Excel)
          </Button>
          <Button variant="outline" onClick={() => handleExportStudents('csv')}>
            <Download size={16} /> Export Students (CSV)
          </Button>
          <Button variant="danger" onClick={() => openEraseDialog('students')}>
            <Trash2 size={16} /> Erase All Students
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Backup & Restore</h2>
        <p className="text-sm text-slate-500 mb-4">
          Download a full backup of all library data (books, students, classes, issues, settings).
        </p>
        <Button onClick={handleBackup}>
          <Download size={16} /> Download Full Backup
        </Button>
      </Card>

      {eraseTarget && (
        <Modal
          open={true}
          onClose={closeEraseDialog}
          title={eraseStep === 1 ? `Confirm erasing all ${eraseTarget}` : 'Final permanent-deletion confirmation'}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={closeEraseDialog} disabled={erasing}>Cancel</Button>
              {eraseStep === 1 ? (
                <Button
                  variant="danger"
                  disabled={loadingManifest || (eraseTarget === 'books' && (eraseManifest?.activeIssues ?? 0) > 0)}
                  onClick={() => setEraseStep(2)}
                >
                  Continue to Final Confirmation
                </Button>
              ) : (
                <Button
                  variant="danger"
                  disabled={erasing || !backupConfirmed || confirmationText !== requiredPhrase}
                  onClick={handleErase}
                >
                  {erasing ? 'Erasing and syncing...' : requiredPhrase}
                </Button>
              )}
            </>
          }
        >
          {loadingManifest || !eraseManifest ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-600" />
            </div>
          ) : eraseStep === 1 ? (
            <div className="space-y-4 text-sm text-slate-600">
              <p>
                This operation is restricted to the current signed-in library namespace. Data belonging to
                other applications or users in the shared Firebase project cannot be accessed or deleted.
              </p>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                {eraseTarget === 'books' ? (
                  <ul className="space-y-1">
                    <li>{eraseManifest.books} book records</li>
                    <li>{eraseManifest.customValues} custom book values</li>
                    <li>{eraseManifest.categories} saved book categories</li>
                    <li>Issue-history snapshots will be preserved.</li>
                  </ul>
                ) : (
                  <ul className="space-y-1">
                    <li>{eraseManifest.students} student records</li>
                    <li>Classes and issue-history snapshots will be preserved.</li>
                  </ul>
                )}
              </div>
              {eraseTarget === 'books' && eraseManifest.activeIssues > 0 && (
                <p className="font-medium text-red-700">
                  {eraseManifest.activeIssues} books are currently issued. Return them before erasing the catalogue.
                </p>
              )}
              <p className="font-medium">This is confirmation 1 of 2. The deletion cannot be undone.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Confirmation 2 of 2: type <strong>{requiredPhrase}</strong> exactly.
              </p>
              <Input
                label="Confirmation phrase"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={requiredPhrase}
                autoComplete="off"
              />
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(event) => setBackupConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>I confirm that I downloaded a backup or accept permanent loss of this data.</span>
              </label>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function AboutSection() {
  return (
    <Card className="p-8">
      <div className="max-w-2xl mx-auto text-center">
        <div className="inline-flex p-4 bg-blue-600 rounded-2xl text-white mb-6 shadow-lg shadow-blue-200">
          <Info size={36} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">School Library Management System</h2>
        <p className="text-slate-500 mt-2">Version 1.0.0</p>

        <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-600 mb-2">Developed by</p>
          <p className="text-xl font-bold text-slate-800">Jeevan Varghese</p>
          <a
            href="https://itsjeevanvarghese.web.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 text-blue-600 hover:underline font-medium"
          >
            https://itsjeevanvarghese.web.app
          </a>
        </div>

        <p className="text-sm text-slate-400 mt-6">
          A complete library management solution for schools with book tracking, student management,
          issue/return workflow, custom fields, import/export, and PDF reporting.
        </p>
      </div>
    </Card>
  );
}
