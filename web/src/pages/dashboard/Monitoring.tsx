import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "../../components/ui";
import { getDashboard } from "../../lib/api";
import type { DashboardSnapshot } from "../../lib/types";

export function Monitoring() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard().then(setData).catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="panel"><div className="empty"><span className="empty__icon"><AlertTriangle size={24} /></span><h2>Monitoring unavailable</h2><p>{error}</p></div></div>;
  if (!data) return <div className="panel"><div className="empty"><h2>Loading monitoring…</h2><p>Checking live Lute status.</p></div></div>;

  return <>
    <div className="dash-head"><div><h1>Monitoring</h1><p>Operational signals exposed by this Lute instance.</p></div><Badge tone="success">API healthy</Badge></div>
    <div className="g3">
      <Signal title="Lute API" detail="HTTP service responding" value="Healthy" />
      <Signal title="Integrity-pack catalog" detail="Live pack definitions available" value={`${data.packs.length} pack(s) ready`} />
      <Signal title="Persisted evidence" detail="Verification runs on disk" value={`${data.stats.totalRuns} run(s) stored`} />
    </div>
    <div className="panel" style={{ marginTop: "var(--sp-4)" }}><div className="panel__h"><h2><Activity size={18} /> Service metadata</h2></div><div className="kvrow"><span>Service</span><span className="mono">{data.service}</span></div><div className="kvrow"><span>Status</span><span className="mono">{data.status}</span></div><div className="kvrow"><span>Verifier commit</span><span className="mono">{data.verifierCommit}</span></div></div>
  </>;
}

function Signal({ title, detail, value }: { title: string; detail: string; value: string }) {
  return <div className="panel"><div className="panel__h"><h2><CheckCircle2 size={18} /> {title}</h2><Badge tone="success">Ready</Badge></div><p className="muted">{detail}</p><div className="stat__value" style={{ marginTop: "var(--sp-4)" }}>{value}</div></div>;
}
