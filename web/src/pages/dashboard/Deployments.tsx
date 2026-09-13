import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Fingerprint, Loader2, Package, Rocket, ShieldCheck } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { deployVerified, getDashboard, previewDeployment } from "../../lib/api";
import type { DashboardSnapshot, DeploymentGateSnapshot, WorkflowDeployment } from "../../lib/types";

function tone(gate: DeploymentGateSnapshot | null): "success" | "danger" | "warning" | "neutral" {
  if (!gate) return "neutral";
  if (gate.state === "ALLOWED") return "success";
  if (gate.state === "INCOMPLETE") return "warning";
  return "danger";
}

export function Deployments() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"idle" | "previewing" | "deploying">("idle");
  const [plan, setPlan] = useState<WorkflowDeployment | null>(null);
  useEffect(() => { getDashboard().then(setData).catch((err: Error) => setError(err.message)); }, []);

  if (error) return <div className="panel"><div className="empty"><h2>Deployment gate unavailable</h2><p>{error}</p></div></div>;
  if (!data) return <div className="panel"><div className="empty"><h2>Loading deployment gate…</h2><p>Evaluating the current candidate against the latest verification.</p></div></div>;
  const gate = data.gate;
  const preview = async () => {
    if (!gate?.verificationRunId) return;
    setAction("previewing"); setError("");
    try { setPlan(await previewDeployment(gate.verificationRunId)); } catch (err) { setError((err as Error).message); } finally { setAction("idle"); }
  };
  const deploy = async () => {
    if (!gate?.verificationRunId || !window.confirm("Deploy this exact verified candidate to Graph Node? This is an external state change.")) return;
    setAction("deploying"); setError("");
    try { setPlan(await deployVerified(gate.verificationRunId)); } catch (err) { setError((err as Error).message); } finally { setAction("idle"); }
  };
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
        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-4)" }}><Button variant="secondary" onClick={preview} disabled={action !== "idle"}>{action === "previewing" ? <><Loader2 size={15} className="spin" /> Preparing…</> : "Preview Graph deploy"}</Button>{gate.allowed && <Button onClick={deploy} disabled={action !== "idle"}>{action === "deploying" ? <><Loader2 size={15} className="spin" /> Deploying…</> : "Deploy verified candidate"}</Button>}</div>
      </>}
    </div>
    {error && <div className="panel" style={{ marginTop: "var(--sp-4)", borderColor: "var(--danger)" }}><p className="muted">{error}</p></div>}
    {plan && <div className="panel" style={{ marginTop: "var(--sp-4)" }}><div className="panel__h"><h2><Rocket size={18} /> {plan.dryRun ? "Deployment preview" : "Deployment receipt"}</h2><Badge tone={plan.gate.allowed ? "success" : "danger"}>{plan.gate.state}</Badge></div><p className="muted">{plan.gate.allowed ? "The plan is bound to the exact verified candidate hash below." : plan.gate.reasons.join("; ")}</p><div className="kvrow"><span>Candidate hash</span><span className="mono">{plan.candidate.candidateHash}</span></div><div className="kvrow"><span>Verification run</span><span className="mono">{plan.verificationRunId}</span></div><table className="dtable"><thead><tr><th>Step</th><th>Command</th><th>Arguments</th></tr></thead><tbody>{plan.plan.map((step) => <tr key={step.purpose}><td>{step.purpose}</td><td className="mono">{step.command}</td><td className="mono">{step.args.join(" ")}</td></tr>)}</tbody></table>{plan.receipt && <p className="hint">Receipt saved on the server: <span className="mono">{plan.receipt.file}</span></p>}</div>}
    <div className="panel" style={{ marginTop: "var(--sp-4)" }}><p className="gate__note">This page evaluates the gate only. Publishing or deploying with external credentials remains a separate, explicitly authorized operator action.</p></div>
  </>;
}
