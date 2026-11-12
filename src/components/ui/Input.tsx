import { Children, cloneElement, forwardRef, isValidElement, useId } from "react";
import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes } from "react";

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

/**
 * Etikett + valgfri hjelpetekst rundt et felt. Når `htmlFor` ikke er gitt og
 * barnet er ETT element uten eget id, får det en generert id (useId) slik at
 * etiketten kobles til feltet (klikk på etikett + skjermleser). Eksplisitt
 * `htmlFor` eller eget `id` på barnet vinner alltid.
 */
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
  const autoId = useId();
  const only = Children.toArray(children);
  const child =
    only.length === 1 &&
    isValidElement(only[0]) &&
    typeof only[0].type !== "symbol" &&
    (typeof only[0].type !== "string" || ["input", "select", "textarea"].includes(only[0].type))
      ? (only[0] as ReactElement<{ id?: string }>)
      : null;
  const linkId = htmlFor ?? child?.props.id ?? (child ? autoId : undefined);
  const control =
    child && !htmlFor && !child.props.id ? cloneElement(child, { id: linkId }) : children;
  return (
    <div className={"space-y-1.5 " + className}>
      <label
        htmlFor={linkId}
        className="block text-[13px] font-medium text-fg"
      >
        {label}
      </label>
      {control}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
