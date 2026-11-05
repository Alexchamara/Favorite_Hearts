/**
 * Form controls in the demo's style (46px fields, 10px radius, labels above). Every control has a
 * visible label, an optional hint, and an error announced to screen readers.
 */
import { useId, useState, type ReactNode } from 'react';
import { DEFAULT_PHONE_COUNTRY, DIAL_CODES, formatNational, joinPhone, nationalDigits, splitPhone } from '@fh/shared';
import { ChevronDown } from 'lucide-react';
import 'flag-icons/css/flag-icons.min.css';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCountries } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';
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
}: Common & { value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel'; maxLength?: number; min?: number; max?: number; step?: string }) {
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

/** A country's flag, from the bundled flag-icons set; decorative, the name is always beside it. */
const Flag = ({ code }: { code: string }) => <span aria-hidden="true" className={`fi fi-${code.toLowerCase()} shrink-0 rounded-[2px]`} />;

/**
 * A phone number: a country dropdown (flag, name and code, with search) and the number typed in groups
 * ("70 593 4920"). The value it hands up is the full international number ("+94705934920"), or '' while nothing
 * is typed.
 */
export function PhoneField({ value, onChange, ...props }: Common & { value: string; onChange: (value: string) => void; autoComplete?: string }) {
  const { label, hint, error, className, disabled } = props;
  const { t } = useI18n();
  const countries = useCountries().filter(({ code }) => DIAL_CODES[code]);
  const [country, setCountry] = useState(() => splitPhone(value)?.country ?? DEFAULT_PHONE_COUNTRY);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const code = DIAL_CODES[country] ?? '';
  const digits = value.startsWith(`+${code}`) ? value.slice(code.length + 1) : '';
  const needle = search.trim().toLowerCase().replace(/^\+/, '');
  const shown = needle ? countries.filter((option) => option.name.toLowerCase().includes(needle) || DIAL_CODES[option.code]!.startsWith(needle)) : countries;
  const choose = (next: string) => {
    setCountry(next);
    onChange(joinPhone(next, digits));
    setOpen(false);
  };
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <div className="flex gap-2">
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setSearch('');
            }}
          >
            <PopoverTrigger
              type="button"
              disabled={disabled}
              aria-label={`${t('fields.phoneCountry')}: ${countries.find((option) => option.code === country)?.name ?? ''} +${code}`}
              className={cn(control, 'flex w-[6.5rem] shrink-0 items-center gap-2 px-3 text-left')}
            >
              <Flag code={country} />
              <span>+{code}</span>
              <ChevronDown aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('fields.phoneSearch')}
                aria-label={t('fields.phoneSearch')}
                className="block w-full rounded-t-md border-b bg-transparent px-3 py-2.5 text-sm outline-hidden"
              />
              <ul role="listbox" aria-label={t('fields.phoneCountry')} className="max-h-64 overflow-y-auto py-1">
                {shown.map((option) => (
                  <li key={option.code} role="option" aria-selected={option.code === country}>
                    <button
                      type="button"
                      onClick={() => choose(option.code)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--ui-soft)] aria-selected:font-semibold"
                      aria-selected={option.code === country}
                    >
                      <Flag code={option.code} />
                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                      <span className="text-muted-foreground">+{DIAL_CODES[option.code]}</span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('fields.phoneNone')}</li>}
              </ul>
            </PopoverContent>
          </Popover>
          <input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete={props.autoComplete ?? 'tel-national'}
            disabled={disabled}
            value={formatNational(digits)}
            onChange={(event) => onChange(joinPhone(country, nationalDigits(country, event.target.value)))}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={control}
          />
        </div>
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
  placeholder,
  ...props
}: Common & { value: T | '' | null; onChange: (value: T | '') => void; options: { value: T; label: string }[]; placeholder?: string }) {
  const { label, hint, error, className, disabled } = props;
  const { t } = useI18n();
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
          <option value="">{placeholder ?? t('fields.choose')}</option>
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
  const { t } = useI18n();
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
      <p className="text-xs text-muted-foreground">{hint ?? t('fields.upTo', { max })}</p>
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
  const { t } = useI18n();
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
                aria-label={t('fields.remove', { item })}
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
          {t('fields.add')}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? t('fields.upTo', { max })}</p>
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
