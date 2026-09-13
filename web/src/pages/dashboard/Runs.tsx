import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { Badge, Button, StatusBadge } from "../../components/ui";
import { getDashboard, getRepairContext, runVerification } from "../../lib/api";
import type { DashboardSnapshot, VerificationRun, WorkflowRepair, WorkflowVerification } from "../../lib/types";

function age(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function coverage(run: VerificationRun): string {
  const { strongChecksPassed, strongChecksTotal } = run.coverage;
  return strongChecksTotal ? `${strongChecksPassed}/${strongChecksTotal}` : "—";
}

export function Runs() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [selected, setSelected] = useState<VerificationRun | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard().then((snapshot) => { setData(snapshot); setSelected(snapshot.latest); }).catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="panel"><div className="empty"><h2>Verification history unavailable</h2><p>{error}</p></div></div>;
  if (!data) return <div className="panel"><div className="empty"><h2>Loading verification history…</h2><p>Reading persisted runs from Lute.</p></div></div>;

  return <>
    <div className="dash-head"><div><h1>Verification Runs</h1><p>Every persisted audit result, its candidate binding, and its evidence root.</p></div><Badge tone="info">{data.runs.length} stored</Badge></div>
    {!data.runs.length ? <div className="panel"><div className="empty"><span className="empty__icon"><ShieldCheck size={24} /></span><h2>No verification runs yet</h2><p>Run an External Audit to create a verifiable, persisted result.</p></div></div> : <div className="g2 stack">
      <div className="panel"><div className="panel__h"><h2><ShieldCheck size={18} /> History</h2></div><table className="dtable"><thead><tr><th>Run</th><th>Verdict</th><th>Checks</th><th>Events</th><th>Created</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.runId} onClick={() => setSelected(run)} style={{ cursor: "pointer" }}><td className="mono">{run.runId}</td><td><StatusBadge status={run.verdict} /></td><td>{coverage(run)}</td><td>{run.coverage.eventsChecked}</td><td className="mono">{age(run.createdAt)}</td></tr>)}</tbody></table></div>
      {selected ? <RunDetail run={selected} /> : <div className="panel"><div className="empty"><p>Select a run to inspect its evidence binding.</p></div></div>}
    </div>}
  </>;
}

function RunDetail({ run }: { run: VerificationRun }) {
  const divergence = run.report.firstDivergence;
  const [repair, setRepair] = useState<WorkflowRepair | null>(null);
  const [reverification, setReverification] = useState<WorkflowVerification | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState("");
  const inspectRepair = async () => {
    setRepairing(true); setRepairError("");
    try { setRepair(await getRepairContext(run.runId)); } catch (err) { setRepairError((err as Error).message); } finally { setRepairing(false); }
  };
  const applyRepair = async () => {
    if (!window.confirm("Apply Lute's known ERC-4626 identity repair to the configured candidate? You must re-verify afterward.")) return;
    setRepairing(true); setRepairError("");
    try { setRepair(await getRepairContext(run.runId, "current", true)); } catch (err) { setRepairError((err as Error).message); } finally { setRepairing(false); }
  };
  const reverify = async () => {
    if (!repair?.applied) return;
    setRepairing(true); setRepairError(""); setReverification(null);
    try {
      setReverification(await runVerification({
        contract: run.report.target.contract,
        event: run.report.event as "Deposit" | "Withdraw",
        fromBlock: run.report.range.startBlock,
        toBlock: run.report.range.endBlock,
        subgraph: run.report.target.subgraph,
        candidateRef: "current",
      }));
    } catch (err) { setRepairError((err as Error).message); } finally { setRepairing(false); }
  };
  return <div className="panel"><div className="panel__h"><h2><ShieldCheck size={18} /> Run details</h2><StatusBadge status={run.verdict} /></div><div className="kvrow"><span>Run id</span><span className="mono">{run.runId}</span></div><div className="kvrow"><span>Candidate hash</span><span className="mono">{run.candidateHash}</span></div><div className="kvrow"><span>Evidence root</span><span className="mono">{run.evidenceRoot}</span></div><div className="kvrow"><span>Range</span><span className="mono">{run.coverage.blocksChecked}</span></div><div className="kvrow"><span>Sources complete</span><span>{run.coverage.sourcesComplete ? <Badge tone="success">Yes</Badge> : <Badge tone="warning">No</Badge>}</span></div>{divergence && <div className="panel" style={{ marginTop: "var(--sp-4)" }}><div className="panel__h"><h2><AlertTriangle size={18} /> First divergence</h2><Badge tone="danger">{divergence.check}</Badge></div><div className="kvrow"><span>Block / log</span><span className="mono">{divergence.blockNumber} / {divergence.logIndex}</span></div><div className="kvrow"><span>Transaction</span><span className="mono">{divergence.transactionHash}</span></div></div>}{run.verdict === "FAILED" && <div style={{ marginTop: "var(--sp-4)" }}><div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}><Button variant="secondary" onClick={inspectRepair} disabled={repairing}>{repairing ? <><Loader2 size={15} className="spin" /> Working…</> : <><Wrench size={15} /> Diagnose repair</>}</Button>{repair && <Button onClick={applyRepair} disabled={repairing}>Apply known fix</Button>}{repair?.applied && repair.reverifyRequired && <Button onClick={reverify} disabled={repairing}>{repairing ? <><Loader2 size={15} className="spin" /> Re-verifying…</> : <><ShieldCheck size={15} /> Reverify Candidate</>}</Button>}</div>{repairError && <p className="hint" style={{ color: "var(--danger)" }}>{repairError}</p>}{repair && <div className="dcode" style={{ marginTop: "var(--sp-3)" }}><div>failed checks: {repair.context.failedChecks.join(", ") || "none"}</div><div>reverify required: {repair.reverifyRequired ? "yes" : "no"}</div>{repair.applied && <div>changed: {repair.applied.file}</div>}</div>}{reverification && <div className={`workflow-alert ${reverification.run.verdict === "VERIFIED" ? "workflow-alert--success" : reverification.run.verdict === "FAILED" ? "workflow-alert--danger" : "workflow-alert--warning"}`}><StatusBadge status={reverification.run.verdict} /><div><strong>{reverification.run.verdict === "VERIFIED" ? "Reverification passed" : "Reverification did not pass"}</strong><span>{reverification.run.report.eventsChecked} events checked. Refresh Deploy to recalculate the deployment gate.</span></div></div>}</div>}</div>;
}
