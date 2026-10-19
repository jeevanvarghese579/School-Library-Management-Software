export interface Class {
  id: string;
  name: string;
  created_at: string;
  student_count?: number;
}

export interface Student {
  id: string;
  name: string;
  roll_number: string;
  class_id: string | null;
  archived: boolean;
  created_at: string;
  class?: Class | null;
}

export interface Book {
  id: string;
  book_number: string;
  name: string;
  author: string | null;
  category: string | null;
  shelf_number: string | null;
  row_number: string | null;
  source_of_acquisition: string | null;
  price: number | null;
  archived: boolean;
  created_at: string;
  custom_values?: BookCustomValue[];
  is_available?: boolean;
}

export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'boolean';

export interface BookFieldDefinition {
  id: string;
  field_name: string;
  field_type: FieldType;
  is_required: boolean;
  display_order: number;
  is_visible: boolean;
  dropdown_options: string[] | null;
  is_default: boolean;
  created_at: string;
}

export interface BookCustomValue {
  id: string;
  book_id: string;
  field_definition_id: string;
  value: string | null;
  field_definition?: BookFieldDefinition;
}

export interface AcademicYear {
  id: string;
  year_label: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BookIssue {
  id: string;
  book_id: string;
  student_id: string;
  academic_year_id: string | null;
  issue_date: string;
  due_date: string;
  return_date: string | null;
  status: 'issued' | 'returned';
  book_number_snapshot: string;
  book_title_snapshot: string;
  student_name_snapshot: string;
  student_roll_number_snapshot: string;
  class_name_snapshot: string;
  created_at: string;
  book?: Book | null;
  student?: Student | null;
  academic_year?: AcademicYear | null;
}

export interface AppSettings {
  id: string;
  school_name: string;
  currency: string;
  currency_symbol: string;
  date_format: string;
  borrowing_period_days: number;
  school_logo: string | null;
}
