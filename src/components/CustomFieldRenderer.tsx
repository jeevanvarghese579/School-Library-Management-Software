import { type BookFieldDefinition } from '@/types';
import { Input, Select } from '@/components/ui/Input';

interface CustomFieldRendererProps {
  fields: BookFieldDefinition[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  errors?: Record<string, string>;
  onlyCustom?: boolean;
}

export function CustomFieldRenderer({
  fields,
  values,
  onChange,
  errors,
  onlyCustom = false,
}: CustomFieldRendererProps) {
  const visibleFields = onlyCustom ? fields.filter((f) => !f.is_default) : fields;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {visibleFields.map((field) => {
        const value = values[field.id] ?? '';
        const error = errors?.[field.id];

        if (field.field_type === 'boolean') {
          return (
            <div key={field.id} className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id={field.id}
                checked={value === 'true'}
                onChange={(e) => onChange(field.id, e.target.checked ? 'true' : 'false')}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor={field.id} className="text-sm font-medium text-slate-700">
                {field.field_name}
              </label>
            </div>
          );
        }

        if (field.field_type === 'dropdown') {
          return (
            <Select
              key={field.id}
              label={field.field_name + (field.is_required ? ' *' : '')}
              value={value}
              error={error}
              onChange={(e) => onChange(field.id, e.target.value)}
            >
              <option value="">— Select —</option>
              {(field.dropdown_options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          );
        }

        if (field.field_type === 'date') {
          return (
            <Input
              key={field.id}
              label={field.field_name + (field.is_required ? ' *' : '')}
              type="date"
              value={value}
              error={error}
              onChange={(e) => onChange(field.id, e.target.value)}
            />
          );
        }

        if (field.field_type === 'number') {
          return (
            <Input
              key={field.id}
              label={field.field_name + (field.is_required ? ' *' : '')}
              type="number"
              value={value}
              error={error}
              onChange={(e) => onChange(field.id, e.target.value)}
            />
          );
        }

        return (
          <Input
            key={field.id}
            label={field.field_name + (field.is_required ? ' *' : '')}
            type="text"
            value={value}
            error={error}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        );
      })}
    </div>
  );
}
