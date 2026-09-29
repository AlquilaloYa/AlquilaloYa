"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leadingIcon,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  isLoading?: boolean;
  leadingIcon?: ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
  };
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
    outline: "border border-input bg-transparent text-foreground hover:bg-muted",
    ghost: "text-foreground hover:bg-muted",
    danger: "bg-error text-on-error hover:opacity-90",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled ?? isLoading}
      {...props}
    >
      {isLoading ? (
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
}

export function FieldLabel({
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className="mb-1.5 block text-sm font-medium text-foreground"
      {...props}
    >
      {children}
    </label>
  );
}

export function Input({
  label,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <div>
      {label ? <FieldLabel htmlFor={props.id ?? props.name}>{label}</FieldLabel> : null}
      <input
        className={`h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className}`}
        {...props}
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <div>
      {label ? <FieldLabel htmlFor={props.id ?? props.name}>{label}</FieldLabel> : null}
      <textarea
        className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className}`}
        {...props}
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Select({
  label,
  hint,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  return (
    <div>
      {label ? <FieldLabel htmlFor={props.id ?? props.name}>{label}</FieldLabel> : null}
      <select
        className={`h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className}`}
        {...props}
      >
        {children}
      </select>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ToggleCheck({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-card p-4 ${className}`}>
      {title ? <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3> : null}
      {children}
    </section>
  );
}