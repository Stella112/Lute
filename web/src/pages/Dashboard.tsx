import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid, FolderGit2, ShieldCheck, Boxes, Rocket, FileSearch, AlertTriangle,
  Activity, Settings, PanelLeftClose, PanelLeftOpen, Search, Menu, Network, Hexagon, Plug, Layers,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Button, ThemeToggle } from "../components/ui";
import { Overview } from "./dashboard/Overview";
import { ExternalAudit } from "./dashboard/ExternalAudit";
import { Packs } from "./dashboard/Packs";
import { EmptyState } from "./dashboard/EmptyState";

type SectionKey =
  | "overview" | "projects" | "runs" | "packs" | "deployments"
  | "external" | "incidents" | "monitoring" | "settings";

const NAV: { key: SectionKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "projects", label: "Projects", icon: FolderGit2 },
  { key: "runs", label: "Verification Runs", icon: ShieldCheck },
  { key: "packs", label: "Integrity Packs", icon: Boxes },
  { key: "deployments", label: "Deployments", icon: Rocket },
  { key: "external", label: "External Audit", icon: FileSearch },
  { key: "incidents", label: "Incidents", icon: AlertTriangle },
  { key: "monitoring", label: "Monitoring", icon: Activity },
  { key: "settings", label: "Settings", icon: Settings },
];

const ECO = [
  { name: "The Graph", icon: Network }, { name: "Hedera", icon: Hexagon },
  { name: "Bazantic", icon: Boxes }, { name: "MCP", icon: Plug }, { name: "Substreams", icon: Layers },
];

export default function Dashboard() {
  const [active, setActive] = useState<SectionKey>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (k: SectionKey) => { setActive(k); setMobileOpen(false); };

  return (
    <div className="dash" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <div className="side__scrim" onClick={() => setMobileOpen(false)} />
      <aside className="side" aria-label="Primary">
        <div className="side__top">
          {!collapsed && <Link to="/" className="nav__brand"><Logo /></Link>}
          <button className="side__collapse" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav className="side__nav">
          {NAV.map((n) => (
            <button key={n.key} className={`side__item ${active === n.key ? "is-active" : ""}`} onClick={() => go(n.key)} title={collapsed ? n.label : undefined} aria-current={active === n.key ? "page" : undefined}>
              <n.icon size={18} /> <span className="side__label">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="side__foot">
          <p>Trusted infrastructure<br />for a more open internet.</p>
          <span className="side__ver">Lute v1.0.0</span>
        </div>
      </aside>

      <div>
        <header className="top">
          <button className="top__menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <button className="top__proj"><span><small>Project</small>edge-market-subgraph</span></button>
          <div className="top__search"><Search size={15} /> Search projects, runs, deployments… <kbd>⌘K</kbd></div>
          <div className="top__spacer" />
          <span className="top__env"><span className="dot" /> Production</span>
          <div className="top__actions">
            <Button variant="secondary" onClick={() => go("external")}>Run Audit</Button>
            <Button>Deploy Verified</Button>
            <ThemeToggle />
            <span className="top__avatar" title="Account">JD</span>
          </div>
        </header>

        <main className="dash-main">
          {active === "overview" && <Overview onNavigate={(k) => go(k as SectionKey)} />}
          {active === "external" && <ExternalAudit />}
          {active === "packs" && <Packs />}
          {active === "projects" && <EmptyState icon={FolderGit2} title="Projects" body="Connect a Graph deployment to start tracking verification runs, deployments, and integrity over time." />}
          {active === "runs" && <EmptyState icon={ShieldCheck} title="Verification Runs" body="Every audit produces a Verification Run with checks, evidence, and a candidate hash. Run an audit from External Audit to create one." />}
          {active === "deployments" && <EmptyState icon={Rocket} title="Deployments" body="The Deployment Gate only clears a candidate whose verified hash matches. Deployments will appear here once a project is connected." />}
          {active === "incidents" && <EmptyState icon={AlertTriangle} title="Incidents" body="Integrity drift detected after deployment opens an incident with first-divergence evidence and a repair lifecycle." />}
          {active === "monitoring" && <EmptyState icon={Activity} title="Monitoring" body="Runtime health and data integrity are tracked separately. Connect a deployment to see live monitoring." />}
          {active === "settings" && <EmptyState icon={Settings} title="Settings" body="Workspace, RPC endpoints, integrity-pack policy, and deployment-gate rules will be configured here." />}

          {active === "overview" && (
            <div className="dash-eco">
              <b>Integrations</b>
              {ECO.map((e) => <span key={e.name}><e.icon size={16} /> {e.name}</span>)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
