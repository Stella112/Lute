import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button, Container, Eyebrow, Badge } from "../components/ui";
import { ThemeToggle } from "../components/ui";

// Placeholder for Milestone 2 (dashboard shell + overview). The route exists and is
// theme-consistent so the landing's CTAs lead somewhere coherent.
export default function Dashboard() {
  return (
    <div className="dash-placeholder">
      <Container>
        <div className="dash-placeholder__bar">
          <Link to="/" className="nav__brand"><Logo /></Link>
          <ThemeToggle />
        </div>
        <div className="dash-placeholder__body">
          <Eyebrow>Application</Eyebrow>
          <h1>Dashboard <Badge tone="info">Milestone 2</Badge></h1>
          <p className="muted">
            The trust and deployment control center — app shell, Overview, Verification Runs,
            Deployment Gate, Evidence, External Audit, Integrity Packs, Monitoring, and
            Incidents — is the next milestone. The landing page and design system ship first.
          </p>
          <Button to="/" variant="secondary"><ArrowLeft size={15} /> Back to landing</Button>
        </div>
      </Container>
    </div>
  );
}
