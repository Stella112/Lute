import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Fingerprint, Package, Rocket, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui";
import { getDashboard } from "../../lib/api";
import type { DashboardSnapshot, DeploymentGateSnapshot } from "../../lib/types";

function tone(gate: DeploymentGateSnapshot | null): "success" | "danger" | "warning" | "neutral" {
  if (!gate) return "neutral";
  if (gate.state === "ALLOWED") return "success";
  if (gate.state === "INCOMPLETE") return "warning";
  return "danger";
}

export function Deployments() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { getDashboard().then(setData).catch((err: Error) => setError(err.message)); }, []);

  if (error) return <div className="panel"><div className="empty"><h2>Deployment gate unavailable</h2><p>{error}</p></div></div>;
  if (!data) return <div className="panel"><div className="empty"><h2>Loading deployment gate…</h2><p>Evaluating the current candidate against the latest verification.</p></div></div>;
  const gate = data.gate;
  return <>
    <div className="dash-head"><div><h1>Deployment Gate</h1><p>Only the exact candidate that passed verification can be cleared.</p></div><Badge tone={tone(gate)}>{gate?.state ?? "INCOMPLETE"}</Badge></div>
    <div className="panel">
      <div className="panel__h"><h2>{gate?.allowed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} Gate decision</h2><Badge tone={tone(gate)}>{gate?.allowed ? "ALLOWED" : gate?.state ?? "INCOMPLETE"}</Badge></div>
      <p className="gate__note">{gate ? gate.allowed ? "All required policy checks passed. The exact candidate hash matches the verified run." : gate.reasons.join("; ") : "No VerificationRun is available yet."}</p>
      {gate && <>
        <div className="gate__row"><span><Fingerprint size={15} /> Candidate hash</span><span className="gate__val mono">{gate.candidateHash || "unavailable"}</span></div>
        <div className="gate__row"><span><Fingerprint size={15} /> Verified hash</span><span className="gate__val mono">{gate.verifiedCandidateHash ?? "none"}</span></div>
        <div className="gate__row"><span><Package size={15} /> Integrity pack</span><span className="gate__val mono">{gate.integrityPack}</span></div>
        <div className="gate__row"><span><ShieldCheck size={15} /> Verification run</span><span className="gate__val mono">{gate.verificationRunId}</span></div>
        <div className="gate__row"><span><Rocket size={15} /> Studio deployment</span><a className="panel__link" href="https://thegraph.com/studio/subgraph/lute" target="_blank" rel="noreferrer">Open Lute Studio ↗</a></div>
      </>}
    </div>
    <div className="panel" style={{ marginTop: "var(--sp-4)" }}><p className="gate__note">This page evaluates the gate only. Publishing or deploying with external credentials remains a separate, explicitly authorized operator action.</p></div>
  </>;
}
