import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

/**
 * Delte tabell-primitiver. Samler den gjentatte admin-tabellstilen (ramme-løs
 * tabell med «w-full text-sm», hodefarger, radskiller) ett sted, så alle
 * datatabeller ser like ut. Wrap i <Card padded={false}> for kort-rammen.
 *
 * Bruk:
 *   <Table>
 *     <THead><Tr><Th>Konto</Th><Th align="right">Beløp</Th></Tr></THead>
 *     <TBody>
 *       <Tr><Td nums>3001</Td><Td align="right" nums>1 234 kr</Td></Tr>
 *     </TBody>
 *   </Table>
 */
export function Table({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={"w-full text-sm " + className}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  className = "",
  head = false,
}: {
  children: ReactNode;
  className?: string;
  /** Hode-rad: tynnere skrift/farge og bunnlinje. */
  head?: boolean;
}) {
  const base = head
    ? "border-b border-line text-left text-xs text-muted"
    : "border-b border-line last:border-0";
  return <tr className={`${base} ${className}`.trim()}>{children}</tr>;
}

type CellProps = {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  /** Tabulær-tall (høyrejustert tallkolonne o.l.). */
  nums?: boolean;
};

const alignCls = (a?: "left" | "right" | "center") =>
  a === "right" ? " text-right" : a === "center" ? " text-center" : "";

export function Th({
  children,
  className = "",
  align,
  nums,
  ...rest
}: CellProps & Omit<ThHTMLAttributes<HTMLTableCellElement>, "className" | "children" | "align">) {
  return (
    <th
      className={
        "px-6 py-3 font-medium" + alignCls(align) + (nums ? " tabular-nums" : "") + (className ? " " + className : "")
      }
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  align,
  nums,
  muted = false,
  ...rest
}: CellProps & { muted?: boolean } & Omit<TdHTMLAttributes<HTMLTableCellElement>, "className" | "children" | "align">) {
  return (
    <td
      className={
        "px-6 py-3" +
        alignCls(align) +
        (nums ? " tabular-nums" : "") +
        (muted ? " text-muted" : "") +
        (className ? " " + className : "")
      }
      {...rest}
    >
      {children}
    </td>
  );
}

/** Full-bredde «ingen rader»-celle til bruk inne i <TBody>. */
export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
