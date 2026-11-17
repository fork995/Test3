import { useId, useLayoutEffect, useRef, useState } from "react";

/** Kept inside the modal top layer. Coordinates follow the visible keyboard viewport. */
export function PrescriptionAutocomplete({
  label,
  value,
  onChange,
  options,
  inputMode,
  disabled = false,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  inputMode?: "decimal";
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const shown = open && !disabled && options.length > 0;
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const el = input.current!;
      const r = el.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = (viewport?.offsetTop ?? 0) + 8,
        bottom =
          (viewport?.offsetTop ?? 0) +
          (viewport?.height ?? window.innerHeight) -
          8;
      const left = viewport?.offsetLeft ?? 0,
        width = viewport?.width ?? window.innerWidth;
      const below = bottom - r.bottom - 4,
        above = r.top - top - 4;
      const up = below < Math.min(176, options.length * 44) && above > below;
      const height = Math.min(
        240,
        options.length * 44 + 2,
        Math.max(0, up ? above : below),
      );
      if (r.bottom < top || r.top > bottom || height < 44) {
        setBox(null);
        return;
      }
      setBox({
        left: Math.max(left + 8, Math.min(r.left, left + width - r.width - 8)),
        top: up ? r.top - height - 4 : r.bottom + 4,
        width: Math.min(r.width, width - 16),
        maxHeight: height,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const viewport = window.visualViewport;
    const resized = () => {
      input.current?.scrollIntoView?.({ block: "center" });
      place();
    };
    viewport?.addEventListener("resize", resized);
    viewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", resized);
      viewport?.removeEventListener("scroll", place);
    };
  }, [shown, options]);
  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setActive(-1);
  }
  function navigate(index: number) {
    setActive(index);
    list.current?.children[index]?.scrollIntoView?.({ block: "nearest" });
  }
  return (
    <div className="prescription-autocomplete">
      <label htmlFor={id}>
        {label}
        <input
          ref={input}
          id={id}
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={!!(shown && box)}
          aria-controls={shown ? `${id}-list` : undefined}
          aria-activedescendant={
            shown && active >= 0 ? `${id}-${active}` : undefined
          }
          value={value}
          inputMode={inputMode}
          disabled={disabled}
          required={required}
          autoComplete="off"
          onFocus={() => {
            input.current?.scrollIntoView?.({ block: "nearest" });
            setActive(-1);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
            setOpen(document.activeElement === input.current);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (
              (e.key === "ArrowDown" || e.key === "ArrowUp") &&
              options.length
            ) {
              e.preventDefault();
              setOpen(true);
              navigate(
                e.key === "ArrowDown"
                  ? (active + 1) % options.length
                  : active <= 0
                    ? options.length - 1
                    : active - 1,
              );
            }
            if (e.key === "Enter" && open && active >= 0 && options[active]) {
              e.preventDefault();
              choose(options[active]);
            }
          }}
        />
      </label>
      {shown && box && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={`Подсказки: ${label}`}
          className="prescription-options"
          style={box}
        >
          {options.map((option, i) => (
            <li
              key={option}
              id={`${id}-${i}`}
              role="option"
              aria-selected={active >= 0 ? active === i : option === value}
              onPointerDown={(e) => {
                e.preventDefault();
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                choose(option);
                input.current?.focus();
                setOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
