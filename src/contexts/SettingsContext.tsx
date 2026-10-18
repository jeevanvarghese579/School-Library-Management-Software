import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ensureUserDefaults, listDocuments } from '@/lib/firestoreData';
import type { AppSettings, AcademicYear, BookFieldDefinition } from '@/types';

interface SettingsContextValue {
  settings: AppSettings | null;
  activeYear: AcademicYear | null;
  fieldDefinitions: BookFieldDefinition[];
  loading: boolean;
  refreshSettings: () => Promise<void>;
  refreshFieldDefinitions: () => Promise<void>;
  refreshActiveYear: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<BookFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSettings = async () => {
    const values = await listDocuments<AppSettings>('app_settings');
    setSettings(values[0] ?? null);
  };
  const refreshActiveYear = async () => {
    const values = await listDocuments<AcademicYear>('academic_years');
    setActiveYear(values.find((year) => year.is_active) ?? null);
  };
  const refreshFieldDefinitions = async () => {
    const values = await listDocuments<BookFieldDefinition>('book_field_definitions');
    setFieldDefinitions(values.sort((a, b) => a.display_order - b.display_order));
  };

  useEffect(() => {
    (async () => {
      await ensureUserDefaults();
      await Promise.all([refreshSettings(), refreshActiveYear(), refreshFieldDefinitions()]);
      setLoading(false);
    })().catch((error) => {
      console.error('Unable to load library settings', error);
      setLoading(false);
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, activeYear, fieldDefinitions, loading, refreshSettings, refreshFieldDefinitions, refreshActiveYear }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
