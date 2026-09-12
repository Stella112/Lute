import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Play, RefreshCw } from "lucide-react";
import { Badge, Button, StatusBadge } from "../../components/ui";
import { getDashboard, runMonitoring as triggerMonitoring } from "../../lib/api";
import type { DashboardSnapshot, MonitoringRun } from "../../lib/types";

export function Monitoring() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<MonitoringRun | null>(null);

  const refresh = () => getDashboard().then(setData).catch((err: Error) => setError(err.message));
  useEffect(() => { refresh(); }, []);

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const result = await triggerMonitoring();
      setLastRun(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  if (error) return <div className="panel"><div className="empty"><span className="empty__icon"><AlertTriangle size={24} /></span><h2>Monitoring unavailable</h2><p>{error}</p></div></div>;
  if (!data) return <div className="panel"><div className="empty"><h2>Loading monitoring…</h2><p>Checking live Lute status.</p></div></div>;

  const monitoring = data.monitoring;
  const openIncidents = data.incidents.filter((incident) => incident.status !== "RESOLVED").length;
  return <>
    <div className="dash-head"><div><h1>Monitoring</h1><p>Run the configured watchlist against raw chain evidence and the live index.</p></div><Button variant="primary" onClick={run} disabled={running}>{running ? <><RefreshCw size={15} className="spin" /> Running…</> : <><Play size={15} /> Run monitoring</>}</Button></div>
    {error && <div className="panel" style={{ marginBottom: "var(--sp-4)" }}><p className="muted"><AlertTriangle size={15} /> {error}</p></div>}
    <div className="g3">
      <Signal title="Lute API" detail="HTTP service responding" value="Healthy" />
      <Signal title="Configured watchlist" detail="Operator-controlled monitoring targets" value={`${monitoring.configuredTargets} target(s)`} />
      <Signal title="Open incidents" detail="Non-VERIFIED monitoring outcomes" value={`${openIncidents} open`} tone={openIncidents ? "warning" : "success"} />
    </div>
    <div className="g2 stack" style={{ marginTop: "var(--sp-4)" }}>
      <div className="panel"><div className="panel__h"><h2><Activity size={18} /> Last monitoring run</h2>{monitoring.lastVerdict ? <StatusBadge status={monitoring.lastVerdict} /> : <Badge tone="neutral">Not run</Badge>}</div><div className="kvrow"><span>Run id</span><span className="mono">{monitoring.lastRunId ?? "—"}</span></div><div className="kvrow"><span>Started</span><span className="mono">{monitoring.lastRunAt ?? "—"}</span></div>{monitoring.lastSummary && <><div className="kvrow"><span>Targets checked</span><span>{monitoring.lastSummary.total}</span></div><div className="kvrow"><span>Result</span><span>{monitoring.lastSummary.verified} verified · {monitoring.lastSummary.failed} failed · {monitoring.lastSummary.inconclusive} inconclusive</span></div></>}</div>
      <div className="panel"><div className="panel__h"><h2><CheckCircle2 size={18} /> Service metadata</h2><Badge tone="success">{data.status}</Badge></div><div className="kvrow"><span>Service</span><span className="mono">{data.service}</span></div><div className="kvrow"><span>Integrity packs</span><span className="mono">{data.packs.length} ready</span></div><div className="kvrow"><span>Persisted evidence</span><span className="mono">{data.stats.totalRuns} run(s)</span></div><div className="kvrow"><span>Verifier commit</span><span className="mono">{data.verifierCommit}</span></div></div>
    </div>
    {lastRun && <div className="panel"><div className="panel__h"><h2><Activity size={18} /> This run</h2><StatusBadge status={lastRun.batch.verdict} /></div><table className="dtable"><thead><tr><th>Target</th><th>Verdict</th><th>Events</th><th>Incident</th></tr></thead><tbody>{lastRun.batch.results.map((result, index) => <tr key={`${lastRun.monitorRunId}-${result.name}`}><td>{result.name}</td><td><StatusBadge status={result.verdict} /></td><td>{result.report?.eventsChecked ?? "—"}</td><td className="mono">{lastRun.resultIncidentIds[index] ?? "—"}</td></tr>)}</tbody></table></div>}
  </>;
}

function Signal({ title, detail, value, tone = "success" }: { title: string; detail: string; value: string; tone?: "success" | "warning" }) {
  return <div className="panel"><div className="panel__h"><h2><CheckCircle2 size={18} /> {title}</h2><Badge tone={tone}>{tone === "success" ? "Ready" : "Attention"}</Badge></div><p className="muted">{detail}</p><div className="stat__value" style={{ marginTop: "var(--sp-4)" }}>{value}</div></div>;
}
