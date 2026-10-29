/**
 * Form controls in the demo's style (46px fields, 10px radius, labels above). Every control has a
 * visible label, an optional hint, and an error announced to screen readers.
 */
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const control =
  'block w-full min-h-[46px] rounded-[10px] border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-60 aria-[invalid=true]:border-destructive';

type FieldProps = { label: string; hint?: string; error?: string; className?: string; children: (id: string, describedBy?: string) => ReactNode };

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { label: string; hint?: string; error?: string; className?: string; disabled?: boolean };

export function TextField({
  value,
  onChange,
  type = 'text',
  ...props
}: Common & { value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; inputMode?: 'text' | 'numeric' | 'email' | 'tel'; maxLength?: number; min?: number; max?: number }) {
  const { label, hint, error, className, ...input } = props;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={control}
          {...input}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  value,
  onChange,
  rows = 5,
  maxLength,
  ...props
}: Common & { value: string; onChange: (value: string) => void; rows?: number; maxLength?: number; placeholder?: string }) {
  const { label, hint, error, className, ...input } = props;
  return (
    <Field label={label} hint={hint ?? (maxLength ? `${value.length}/${maxLength}` : undefined)} error={error} className={className}>
      {(id, describedBy) => (
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(control, 'resize-y py-3 leading-relaxed')}
          {...input}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  ...props
}: Common & { value: T | '' | null; onChange: (value: T | '') => void; options: { value: T; label: string }[]; placeholder?: string }) {
  const { label, hint, error, className, disabled } = props;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <select
          id={id}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T | '')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={control}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Pick several from a fixed list (values, languages), up to `max`. */
export function ChipPicker<T extends string>({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  max,
}: { label: string; hint?: string; error?: string; value: T[]; onChange: (value: T[]) => void; options: { value: T; label: string }[]; max: number }) {
  const toggle = (item: T) =>
    onChange(value.includes(item) ? value.filter((v) => v !== item) : value.length < max ? [...value, item] : value);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option.value)}
              className={cn(
                'min-h-9 rounded-full border px-3.5 text-sm transition-colors',
                on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? `Up to ${max}.`}</p>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** A short free-text list (hobbies, siblings' occupations): type and press Add. */
export function ListField({
  label,
  hint,
  error,
  value,
  onChange,
  max,
  maxLength,
  placeholder,
}: { label: string; hint?: string; error?: string; value: string[]; onChange: (value: string[]) => void; max: number; maxLength: number; placeholder?: string }) {
  const id = useId();
  const add = (input: HTMLInputElement | null) => {
    const text = input?.value.trim() ?? '';
    if (!input || !text || value.length >= max || value.includes(text)) return;
    onChange([...value, text]);
    input.value = '';
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li key={item} className="flex items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-sm">
              {item}
              <button
                type="button"
                className="rounded-full px-2 text-muted-foreground hover:bg-accent"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(value.filter((v) => v !== item))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={value.length >= max}
          className={control}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add(event.currentTarget);
            }
          }}
        />
        <button
          type="button"
          disabled={value.length >= max}
          className="min-h-[46px] rounded-[10px] border bg-card px-4 text-sm font-semibold hover:bg-accent disabled:opacity-50"
          onClick={() => add(document.getElementById(id) as HTMLInputElement | null)}
        >
          Add
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? `Up to ${max}.`}</p>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckboxField({ label, checked, onChange, error }: { label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-start gap-3 text-sm leading-relaxed">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--ui-purple)]"
        />
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
