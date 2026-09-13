import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "../Logo";
import { Button, ThemeToggle } from "../ui";

const LINKS = [
  { label: "Product", href: "/#lifecycle" },
  { label: "Integrations", href: "/#ecosystem" },
  { label: "Docs", href: "/docs" },
  { label: "About", href: "/#assurance" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? "nav--scrolled" : ""}`}>
      <div className="nav__inner container">
        <a href="/" className="nav__brand"><Logo /></a>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => <a key={l.label} href={l.href}>{l.label}</a>)}
        </nav>

        <div className="nav__actions">
          <ThemeToggle />
          <a href="#audit" className="nav__demo">Book Demo</a>
          <Button to="/app" size="md" icon>Start Verifying</Button>
          <button className="nav__burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="nav__mobile">
          {LINKS.map((l) => <a key={l.label} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
          <div className="nav__mobile-actions">
            <Button to="/app" size="lg" icon>Start Verifying</Button>
          </div>
        </div>
      )}
    </header>
  );
}
