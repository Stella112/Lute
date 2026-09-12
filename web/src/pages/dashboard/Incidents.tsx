import { useEffect, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, FileSearch, Wrench } from "lucide-react";
import { Badge, StatusBadge } from "../../components/ui";
import { getIncidents } from "../../lib/api";
import type { IntegrityIncident } from "../../lib/types";

function age(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function severityTone(severity: IntegrityIncident["severity"]): "danger" | "warning" {
  return severity === "SEV-3" ? "warning" : "danger";
}

function statusTone(status: IntegrityIncident["status"]): "success" | "danger" | "warning" | "info" {
  if (status === "RESOLVED") return "success";
  if (status === "OPEN") return "danger";
  if (status === "REVERIFY") return "info";
  return "warning";
}

export function Incidents() {
  const [incidents, setIncidents] = useState<IntegrityIncident[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getIncidents().then(setIncidents).catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="panel"><div className="empty"><span className="empty__icon"><AlertTriangle size={24} /></span><h2>Incidents unavailable</h2><p>{error}</p></div></div>;
  if (!incidents) return <div className="panel"><div className="empty"><h2>Loading incidents…</h2><p>Reading persisted monitoring outcomes.</p></div></div>;

  const open = incidents.filter((incident) => incident.status !== "RESOLVED").length;
  return <>
    <div className="dash-head"><div><h1>Incidents</h1><p>Evidence-backed drift and target failures from live monitoring.</p></div><Badge tone={open ? "danger" : "success"}>{open} open</Badge></div>
    {!incidents.length ? <div className="panel"><div className="empty"><span className="empty__icon"><CheckCircle2 size={24} /></span><h2>No incidents</h2><p>Monitoring has not recorded any integrity drift or unavailable targets.</p></div></div> : <div className="stack">
      {incidents.map((incident) => <IncidentCard key={incident.incidentId} incident={incident} />)}
    </div>}
  </>;
}

function IncidentCard({ incident }: { incident: IntegrityIncident }) {
  const divergence = incident.firstDivergence;
  return <div className="panel">
    <div className="panel__h"><h2><Bug size={18} /> {incident.title}</h2><div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}><Badge tone={severityTone(incident.severity)}>{incident.severity}</Badge><Badge tone={statusTone(incident.status)}>{incident.status}</Badge></div></div>
    <div className="kvrow"><span>Target</span><span>{incident.target.name} · {incident.target.network}</span></div>
    <div className="kvrow"><span>Source</span><span className="mono">{incident.target.subgraph}</span></div>
    <div className="kvrow"><span>Opened / updated</span><span className="mono">{age(incident.openedAt)} / {age(incident.updatedAt)}</span></div>
    <div className="kvrow"><span>Verdict</span><StatusBadge status={incident.verdict} /></div>
    {divergence && <div className="panel" style={{ marginTop: "var(--sp-4)" }}><div className="panel__h"><h2><AlertTriangle size={18} /> First divergence</h2><Badge tone="danger">{divergence.check}</Badge></div><div className="kvrow"><span>Block / log</span><span className="mono">{divergence.blockNumber} / {divergence.logIndex}</span></div><div className="kvrow"><span>Transaction</span><span className="mono">{divergence.transactionHash}</span></div></div>}
    {incident.error && <p className="muted" style={{ marginTop: "var(--sp-3)" }}>Target error: {incident.error}</p>}
    <div className="gate__row"><span><FileSearch size={15} /> Evidence root</span><span className="mono">{incident.evidenceRoot ?? "unavailable"}</span></div>
    {incident.repairContext && <div className="gate__row"><span><Wrench size={15} /> Repair context</span><span>{incident.repairContext.relevantFiles.length} relevant file(s); unchanged verifier required</span></div>}
    {incident.verificationRunId && <div className="gate__row"><span>Verification run</span><span className="mono">{incident.verificationRunId}</span></div>}
    {incident.resolution && <div className="gate__row"><span>Resolved by re-verification</span><span className="mono">{incident.resolution.reverificationRunId}</span></div>}
  </div>;
}
