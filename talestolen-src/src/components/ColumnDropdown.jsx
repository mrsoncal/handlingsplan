import React, { useEffect, useId, useRef, useState } from "react";

export default function ColumnDropdown({ label, value, options, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const labelId = useId();
  const valueId = useId();
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  function focusOption(index) {
    window.requestAnimationFrame(() => {
      const items = rootRef.current?.querySelectorAll('[role="option"]');
      if (!items?.length) return;
      items[(index + items.length) % items.length].focus();
    });
  }

  function openMenu(index) {
    const rect = rootRef.current?.getBoundingClientRect();
    const menuHeight = Math.min(280, options.length * 43 + 8);
    setOpensUp(Boolean(rect && window.innerHeight - rect.bottom < menuHeight + 12 && rect.top > window.innerHeight - rect.bottom));
    setOpen(true);
    focusOption(index);
  }

  function closeAndFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(option) {
    onChange(String(option.value));
    closeAndFocus();
  }

  function handleOptionKeyDown(event, index) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`column-dropdown${open ? " is-open" : ""}${opensUp ? " opens-up" : ""} ${className}`} ref={rootRef}>
      <span className="column-dropdown-label" id={labelId}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="column-dropdown-trigger"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu(Math.max(0, selectedIndex));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowDown" ? Math.max(0, selectedIndex) : Math.max(0, selectedIndex >= 0 ? selectedIndex : options.length - 1));
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="column-dropdown-value" id={valueId}>{selected?.label || "Velg kolonne"}</span>
        <span className="column-dropdown-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="column-dropdown-menu" id={listId} role="listbox" aria-labelledby={labelId}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              className="column-dropdown-option"
              aria-selected={index === selectedIndex}
              tabIndex={-1}
              key={String(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
