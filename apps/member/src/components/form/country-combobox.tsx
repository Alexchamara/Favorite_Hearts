/**
 * A country picked by typing and choosing from the list (the entry's "Your country", SCREEN-022). The demo uses a
 * browser datalist, which most phones show poorly and screen readers announce inconsistently; this is the WAI-ARIA
 * combobox with a list popup: typing filters the list (by name, in the language on screen, or by ISO code), arrows move
 * the highlighted option, Enter or a tap picks it, Escape closes the list (a second Escape clears the text). The field
 * keeps the demo's input look (.m-field input); the list sits under it like the demo's menus (parity.css).
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { Flag } from '@/components/form/fields';
import { useI18n } from '@/lib/i18n';

type Country = { code: string; name: string };

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

export function CountryCombobox({
  id,
  countries,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
}: {
  id: string;
  countries: Country[];
  /** The chosen country's code, or '' while none is chosen. */
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const listId = useId();
  const chosen = countries.find((country) => country.code === value);
  const [text, setText] = useState(chosen?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  // Names that start with the text come first, then names that contain it.
  const shown = useMemo(() => {
    const needle = fold(text);
    if (!needle || (chosen && text === chosen.name)) return countries;
    const starts = countries.filter((country) => fold(country.name).startsWith(needle) || country.code.toLowerCase() === needle);
    const contains = countries.filter((country) => !starts.includes(country) && fold(country.name).includes(needle));
    return [...starts, ...contains];
  }, [countries, text, chosen]);

  const show = (index: number) => {
    setActive(index);
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (country: Country) => {
    setText(country.name);
    onChange(country.code);
    setOpen(false);
  };

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        show(Math.max(0, shown.findIndex((country) => country.code === value)));
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      show(Math.min(shown.length - 1, Math.max(0, active + step)));
    } else if (event.key === 'Enter' && open && shown[active]) {
      event.preventDefault();
      pick(shown[active]);
    } else if (event.key === 'Escape') {
      if (open) setOpen(false);
      else {
        setText('');
        onChange('');
      }
    } else if (event.key === 'Tab' && open) {
      setOpen(false);
    }
  }

  return (
    <div className="fh-combobox">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].code}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
          // A typed name that matches a country exactly chooses it; anything else clears the choice until one is picked.
          const exact = countries.find((country) => fold(country.name) === fold(event.target.value));
          onChange(exact?.code ?? '');
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={keyDown}
      />
      <ChevronDown className="fh-combobox-icon" aria-hidden="true" />
      <ul id={listId} ref={list} role="listbox" aria-label={t('entry.locale.country')} hidden={!open}>
        {shown.map((country, index) => (
          <li
            key={country.code}
            id={`${listId}-${country.code}`}
            role="option"
            aria-selected={country.code === value}
            data-active={index === active ? '' : undefined}
            // mousedown, not click: the input keeps focus, and blur does not close the list before the pick.
            onMouseDown={(event) => {
              event.preventDefault();
              pick(country);
            }}
            onMouseMove={() => index !== active && setActive(index)}
          >
            <Flag code={country.code} />
            <span>{country.name}</span>
          </li>
        ))}
        {shown.length === 0 && (
          <li role="presentation" className="fh-combobox-none">
            {t('fields.phoneNone')}
          </li>
        )}
      </ul>
      {/* Screen readers hear how many countries match while typing. */}
      <span className="sr-only" role="status">
        {open ? t('entry.locale.matches', { count: shown.length }) : ''}
      </span>
    </div>
  );
}
