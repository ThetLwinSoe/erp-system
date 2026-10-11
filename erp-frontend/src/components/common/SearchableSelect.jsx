import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useId } from 'react';
import { Form } from 'react-bootstrap';

/**
 * A single-select combobox: typing filters the options by any part of their
 * search text, not just the start the way a native <select> does. Arrow keys
 * move the highlight, Enter picks the highlighted option, Escape closes the
 * list without closing an ancestor modal (it only stops the keydown when the
 * list is actually open, so Escape still reaches the modal otherwise).
 *
 * `options`: [{ value, label, searchText? }] - searchText defaults to label
 * and can carry extra matchable text that isn't shown (e.g. a product's SKU).
 *
 * Deliberately not a native <select required>: the pages that use this do
 * their own "this field is required" check in handleSubmit (same style as
 * their existing hasEmptyItem check) and pass the result back as isInvalid,
 * rather than relying on native validation for a custom control.
 */
const SearchableSelect = forwardRef(function SearchableSelect(
  { options, value, onChange, placeholder = 'Search...', isInvalid = false, disabled = false, autoFocus = false, onAltEnter, id },
  ref
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = useId();

  const selected = options.find((o) => String(o.value) === String(value)) || null;

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, open]);

  const filtered = open
    ? options.filter((o) => (o.searchText || o.label).toLowerCase().includes(query.toLowerCase()))
    : [];

  const commit = (option) => {
    onChange(String(option.value));
    setOpen(false);
    setQuery('');
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    // Alt+Enter is "add another row" (see OrderItemsEditor), not a selection
    // gesture here - let it bubble up untouched, from an open or closed list.
    if (e.altKey && e.key === 'Enter') {
      onAltEnter?.(e);
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
        setOpen(true);
        setHighlight(0);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        break;
      case 'Enter':
        if (filtered[highlight]) {
          e.preventDefault();
          commit(filtered[highlight]);
        }
        break;
      case 'Escape':
        // Only swallow Escape while the list is actually open, so it still
        // closes the dialog on the next press (or immediately, if the list
        // was already closed).
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      default:
        break;
    }
  };

  const displayValue = open ? query : selected ? selected.label : '';

  return (
    <div style={{ position: 'relative' }}>
      <Form.Control
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[highlight] ? `${listboxId}-${highlight}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={displayValue}
        disabled={disabled}
        isInvalid={isInvalid}
        onFocus={() => { setOpen(true); setHighlight(0); }}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          // Same blur-prevention as the <li> options below: without this, mousedown
          // on the scrollbar (which lands on the <ul>, not an <li>) blurs the input
          // and closes the list before the drag/click can do anything.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            zIndex: 1060,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: 220,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #ced4da',
            borderRadius: 4,
            boxShadow: '0 4px 10px rgba(0,0,0,.15)',
            padding: 0,
            listStyle: 'none',
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '6px 12px', color: '#6c757d' }}>No matches</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listboxId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === highlight}
                style={{ padding: '6px 12px', cursor: 'pointer', backgroundColor: i === highlight ? '#e9ecef' : undefined }}
                // Prevents the input's blur (which would close the list) from firing before this click is handled.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o)}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
});

export default SearchableSelect;
