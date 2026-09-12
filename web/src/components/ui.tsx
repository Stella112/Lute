// Shared primitives. Styling lives in styles/components.css via semantic class names.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun, ArrowRight } from "lucide-react";
import { useTheme } from "../theme";
import type { Verdict, CheckStatus } from "../lib/types";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`container ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

type BtnProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  href?: string;
  to?: string;
  icon?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, variant = "primary", size = "md", href, to, icon, ...rest }: BtnProps) {
  const cls = `btn btn--${variant} btn--${size}`;
  const inner = (
    <>
      {children}
      {icon && <ArrowRight size={16} strokeWidth={2.4} />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return <button className={cls} {...rest}>{inner}</button>;
}

export function Card({ children, className = "", elevated = false }: { children: ReactNode; className?: string; elevated?: boolean }) {
  return <div className={`card ${elevated ? "card--elevated" : ""} ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

// Maps verification/verdict states -> tone. Never collapses distinct states into pass/fail.
const VERDICT_TONE: Record<Verdict, "success" | "danger" | "warning" | "neutral" | "info"> = {
  VERIFIED: "success", FAILED: "danger", INCONCLUSIVE: "warning", UNVERIFIED: "neutral", UNAVAILABLE: "neutral",
};
const CHECK_TONE: Record<CheckStatus, "success" | "danger" | "warning" | "neutral"> = {
  PASS: "success", FAIL: "danger", INCONCLUSIVE: "warning", UNVERIFIED: "neutral", UNAVAILABLE: "neutral",
};

export function StatusBadge({ status }: { status: Verdict | CheckStatus }) {
  const tone = (VERDICT_TONE as Record<string, "success" | "danger" | "warning" | "neutral" | "info">)[status] ?? CHECK_TONE[status as CheckStatus] ?? "neutral";
  return <span className={`badge badge--${tone} badge--dot`}><span className="badge__dot" />{status}</span>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
