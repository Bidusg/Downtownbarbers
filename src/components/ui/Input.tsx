import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Delte skjema-primitiver: Input, Select og Field (label + hjelpetekst).
 * Samler feltstilen (ramme, canvas-bakgrunn, fokus-ring på accent-soft) ett
 * sted, så alle skjemafelt i admin ser like ut.
 */
const FIELD_BASE =
  "w-full rounded-lg border border-line-2 bg-canvas px-3 py-2 text-sm text-fg transition-colors focus:border-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft/40 disabled:opacity-40 [@media(pointer:coarse)]:min-h-11";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...rest }, ref) {
  return (
    <input ref={ref} className={`${FIELD_BASE} ${className}`.trim()} {...rest} />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${FIELD_BASE} ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
});

/** Etikett + valgfri hjelpetekst rundt et felt. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"space-y-1.5 " + className}>
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-fg"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
