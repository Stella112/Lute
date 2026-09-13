import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid, FolderGit2, FileCode2, ShieldCheck, Boxes, Rocket, FileSearch, AlertTriangle,
  Activity, Settings, PanelLeftClose, PanelLeftOpen, Search, Menu, Network, Hexagon, Plug, Layers,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Button, ThemeToggle } from "../components/ui";
import { Overview } from "./dashboard/Overview";
import { ExternalAudit } from "./dashboard/ExternalAudit";
import { Packs } from "./dashboard/Packs";
import { EmptyState } from "./dashboard/EmptyState";
import { Runs } from "./dashboard/Runs";
import { Monitoring } from "./dashboard/Monitoring";
import { Deployments } from "./dashboard/Deployments";
import { Incidents } from "./dashboard/Incidents";
import { ProjectList, Projects } from "./dashboard/Projects";

type SectionKey =
  | "overview" | "build" | "projects" | "verify" | "runs" | "packs"
  | "deploy" | "gate" | "deployments" | "external"
  | "incidents" | "monitoring" | "settings";

const NAV_GROUPS: { label?: string; items: { key: SectionKey; label: string; icon: typeof LayoutGrid }[] }[] = [
  { items: [{ key: "overview", label: "Overview", icon: LayoutGrid }] },
  { label: "Build", items: [{ key: "build", label: "Build", icon: FileCode2 }, { key: "projects", label: "Projects", icon: FolderGit2 }] },
  { label: "Verify", items: [{ key: "verify", label: "Verify", icon: ShieldCheck }, { key: "runs", label: "Verification Runs", icon: ShieldCheck }, { key: "packs", label: "Integrity Packs", icon: Boxes }] },
  { label: "Deploy", items: [{ key: "deploy", label: "Deploy", icon: Rocket }, { key: "gate", label: "Deployment Gate", icon: ShieldCheck }, { key: "deployments", label: "Deployments", icon: Rocket }] },
  { label: "Audit", items: [{ key: "external", label: "External Audit", icon: FileSearch }] },
  { label: "Operations", items: [{ key: "monitoring", label: "Monitoring", icon: Activity }, { key: "incidents", label: "Incidents", icon: AlertTriangle }] },
  { label: "Settings", items: [{ key: "settings", label: "Settings", icon: Settings }] },
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
          {NAV_GROUPS.map((group) => <div className="side__group" key={group.label ?? "overview"}>
            {group.label && <div className="side__group-label">{group.label}</div>}
            {group.items.map((n) => (
              <button key={n.key} className={`side__item ${active === n.key ? "is-active" : ""}`} onClick={() => go(n.key)} title={collapsed ? n.label : undefined} aria-current={active === n.key ? "page" : undefined}>
                <n.icon size={18} /> <span className="side__label">{n.label}</span>
              </button>
            ))}
          </div>)}
        </nav>
        <div className="side__foot">
          <p>Trusted infrastructure<br />for a more open internet.</p>
          <span className="side__ver">Lute v1.0.0</span>
        </div>
      </aside>

      <div>
        <header className="top">
          <button className="top__menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <button className="top__proj"><span><small>Project</small>lute / steak-honest</span></button>
          <div className="top__search"><Search size={15} /> Search projects, runs, deployments… <kbd>⌘K</kbd></div>
          <div className="top__spacer" />
          <span className="top__env"><span className="dot" /> Production</span>
          <div className="top__actions">
            <Button onClick={() => go("build")}>New Build</Button>
            <Button variant="secondary" onClick={() => go("external")}>Run Audit</Button>
            <Button variant="secondary" onClick={() => go("gate")}>Deployment Gate</Button>
            <ThemeToggle />
            <span className="top__avatar" title="Account">JD</span>
          </div>
        </header>

        <main className="dash-main">
          {active === "overview" && <Overview onNavigate={(k) => go(k as SectionKey)} />}
          {active === "verify" && <ExternalAudit mode="verify" />}
          {active === "external" && <ExternalAudit mode="audit" />}
          {active === "packs" && <Packs />}
          {active === "build" && <Projects onNavigate={go} />}
          {active === "projects" && <ProjectList onBuild={() => go("build")} />}
          {active === "runs" && <Runs />}
          {(active === "deploy" || active === "gate" || active === "deployments") && <Deployments mode={active === "gate" ? "gate" : active === "deployments" ? "history" : "deploy"} />}
          {active === "incidents" && <Incidents />}
          {active === "monitoring" && <Monitoring />}
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
