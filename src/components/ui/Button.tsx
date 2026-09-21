import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Delt knapp-primitiv. Samler farge/oppførsel (variant + disabled + fokus) på
 * ett sted, mens størrelse/padding fortsatt styres per bruk via `className` –
 * så eksisterende knapper ser nøyaktig like ut når de tas i bruk.
 *
 * Med `href` rendres den som en intern <Link>; ellers som <button>.
 */
export type ButtonVariant = "primary" | "danger" | "subtle" | "ghost" | "link";

const BASE =
  "inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent font-semibold text-accent-fg hover:bg-accent-hover",
  danger: "bg-danger font-semibold text-white hover:opacity-90",
  subtle: "border border-line-2 font-semibold text-fg hover:border-fg",
  ghost: "text-muted hover:text-fg",
  link: "text-accent-soft hover:underline",
};

type Common = {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type AsButton = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type AsLink = Common & {
  href: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  "aria-label"?: string;
};

export function Button(props: AsButton | AsLink) {
  const { variant = "primary", className = "", children } = props;
  const cls = `${BASE} ${VARIANT[variant]} ${className}`.trim();

  if ("href" in props && props.href !== undefined) {
    const { href, target, rel, onClick } = props;
    return (
      <Link
        href={href}
        target={target}
        rel={rel}
        onClick={onClick}
        aria-label={props["aria-label"]}
        className={cls}
      >
        {children}
      </Link>
    );
  }

  const { variant: _v, className: _c, children: _ch, ...rest } =
    props as AsButton;
  void _v;
  void _c;
  void _ch;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
