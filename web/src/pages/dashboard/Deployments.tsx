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

export function Deployments({ mode = "deploy" }: { mode?: "deploy" | "gate" | "history" } = {}) {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"idle" | "previewing" | "deploying">("idle");
  const [plan, setPlan] = useState<WorkflowDeployment | null>(null);
  useEffect(() => { getDashboard().then(setData).catch((err: Error) => setError(err.message)); }, []);

  if (error) return <div className="panel"><div className="empty"><h2>Deployment gate unavailable</h2><p>{error}</p></div></div>;
  if (!data) return <div className="panel"><div className="empty"><h2>Loading deployment gate…</h2><p>Evaluating the current candidate against the latest verification.</p></div></div>;
  const gate = data.gate;
  const title = mode === "gate" ? "Deployment Gate" : mode === "history" ? "Deployments" : "Deploy";
  const description = mode === "gate" ? "A fail-closed decision that only allows the exact candidate Lute verified." : mode === "history" ? "Review verified candidates, Graph Studio status, and release evidence." : "Deploy the exact candidate that passed verification — with the gate and evidence visible first.";
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
    <div className="dash-head"><div><h1>{title}</h1><p>{description}</p></div><Badge tone={tone(gate)}>{gate?.state ?? "INCOMPLETE"}</Badge></div>
    <div className="panel">
      <div className="panel__h"><h2>{gate?.allowed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} Gate decision</h2><Badge tone={tone(gate)}>{gate?.allowed ? "ALLOWED" : gate?.state ?? "INCOMPLETE"}</Badge></div>
      <p className="gate__note">{gate ? gate.allowed ? "All required policy checks passed. The exact candidate hash matches the verified run." : gate.reasons.join("; ") : "No VerificationRun is available yet."}</p>
      {gate && <>
        <div className="gate__row"><span><Fingerprint size={15} /> Candidate hash</span><span className="gate__val mono">{gate.candidateHash || "unavailable"}</span></div>
        <div className="gate__row"><span><Fingerprint size={15} /> Verified hash</span><span className="gate__val mono">{gate.verifiedCandidateHash ?? "none"}</span></div>
        <div className="gate__row"><span><Package size={15} /> Integrity pack</span><span className="gate__val mono">{gate.integrityPack}</span></div>
        <div className="gate__row"><span><ShieldCheck size={15} /> Verification run</span><span className="gate__val mono">{gate.verificationRunId}</span></div>
        <div className="gate__row"><span><Rocket size={15} /> Graph Studio deployment</span><a className="panel__link" href="https://thegraph.com/studio/subgraph/lute" target="_blank" rel="noreferrer">Open Lute Studio ↗</a></div>
        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-4)" }}><Button variant="secondary" onClick={preview} disabled={action !== "idle"}>{action === "previewing" ? <><Loader2 size={15} className="spin" /> Preparing…</> : "Preview Graph deploy"}</Button>{gate.allowed && <Button onClick={deploy} disabled={action !== "idle"}>{action === "deploying" ? <><Loader2 size={15} className="spin" /> Deploying…</> : "Deploy Verified Candidate"}</Button>}</div>
      </>}
    </div>
    <div className="deploy-overview-grid">
      <div className="panel">
        <div className="panel__h"><h2><Package size={18} /> Release target</h2><Badge tone="accent">Base</Badge></div>
        <div className="kvrow"><span>Candidate hash</span><span className="mono">{gate?.candidateHash || "Not created"}</span></div>
        <div className="kvrow"><span>Verified hash</span><span className="mono">{gate?.verifiedCandidateHash || "Not verified"}</span></div>
        <div className="kvrow"><span>Integrity pack</span><span className="mono">{gate?.integrityPack || "erc4626@1"}</span></div>
        <div className="kvrow"><span>Target contract</span><span className="mono">{data.latest?.report.target.contract || "Not selected"}</span></div>
      </div>
      <div className="panel">
        <div className="panel__h"><h2><CheckCircle2 size={18} /> Smoke-query status</h2><Badge tone={data.latest?.report.subgraphEvidence ? "success" : "warning"}>{data.latest?.report.subgraphEvidence ? "PASS" : "WAITING"}</Badge></div>
        <p className="gate__note">{data.latest?.report.subgraphEvidence ? "The candidate index responded during verification and supplied records for comparison." : "A successful index response is required before Lute can show smoke-query evidence."}</p>
        {data.latest?.report.subgraphEvidence && <><div className="kvrow"><span>Entity</span><span className="mono">{data.latest.report.subgraphEvidence.entity}</span></div><div className="kvrow"><span>Records returned</span><span className="mono">{data.latest.report.subgraphEvidence.recordCount}</span></div></>}
      </div>
    </div>
    <div className="panel deploy-history">
      <div className="panel__h"><h2><ShieldCheck size={18} /> Verification history</h2><Badge tone="neutral">{data.runs.length} run(s)</Badge></div>
      {data.runs.length ? <table className="dtable"><thead><tr><th>Run</th><th>Candidate</th><th>Verdict</th><th>Events</th><th>Created</th></tr></thead><tbody>{data.runs.slice(0, 8).map((run) => <tr key={run.runId}><td className="mono">{run.runId}</td><td className="mono">{run.candidateHash.slice(0, 16)}…</td><td><Badge tone={run.verdict === "VERIFIED" ? "success" : run.verdict === "FAILED" ? "danger" : "warning"}>{run.verdict}</Badge></td><td>{run.report.eventsChecked}</td><td className="mono">{new Date(run.createdAt).toLocaleString()}</td></tr>)}</tbody></table> : <div className="empty"><p>No verification history yet.</p></div>}
    </div>
    {error && <div className="panel" style={{ marginTop: "var(--sp-4)", borderColor: "var(--danger)" }}><p className="muted">{error}</p></div>}
    {plan && <div className="panel" style={{ marginTop: "var(--sp-4)" }}><div className="panel__h"><h2><Rocket size={18} /> {plan.dryRun ? "Deployment preview" : "Deployment receipt"}</h2><Badge tone={plan.gate.allowed ? "success" : "danger"}>{plan.gate.state}</Badge></div><p className="muted">{plan.gate.allowed ? "The plan is bound to the exact verified candidate hash below." : plan.gate.reasons.join("; ")}</p><div className="kvrow"><span>Candidate hash</span><span className="mono">{plan.candidate.candidateHash}</span></div><div className="kvrow"><span>Verification run</span><span className="mono">{plan.verificationRunId}</span></div><table className="dtable"><thead><tr><th>Step</th><th>Command</th><th>Arguments</th></tr></thead><tbody>{plan.plan.map((step) => <tr key={step.purpose}><td>{step.purpose}</td><td className="mono">{step.command}</td><td className="mono">{step.args.join(" ")}</td></tr>)}</tbody></table>{plan.receipt && <p className="hint">Receipt saved on the server: <span className="mono">{plan.receipt.file}</span></p>}</div>}
    <div className="panel" style={{ marginTop: "var(--sp-4)" }}><p className="gate__note">This page evaluates the gate only. Publishing or deploying with external credentials remains a separate, explicitly authorized operator action.</p></div>
  </>;
}
