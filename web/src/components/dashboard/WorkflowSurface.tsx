import { useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, Download, Fingerprint,
  FileCode2, GitBranch, Lock, Package, Play, RefreshCw, ShieldCheck, Terminal, Wrench, XCircle,
} from "lucide-react";
import { Badge, Button, StatusBadge } from "../ui";
import { VerificationLine } from "../VerificationLine";
import type { AuditReport, DashboardSnapshot, DeploymentGateSnapshot, StageState, VerificationRun, WorkflowBuild, WorkflowRepair } from "../../lib/types";

export type ComposerRequest = {
  command: string;
  network: "base";
  pack: "erc4626";
  event: "Deposit" | "Withdraw";
  subgraph: string;
  fromBlock: string;
  toBlock: string;
  compile: boolean;
};

export type ComposerStatus = "idle" | "focused" | "submitting" | "running" | "error";

const DEFAULT_COMMAND = "Build an ERC-4626 Subgraph for 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183 on Base and deploy it if verified.";

function short(value: string | null | undefined, head = 16, tail = 6) {
  if (!value) return "—";
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

function resultLabel(status: string) {
  if (status === "PASS") return "Passed";
  if (status === "FAIL") return "Failed";
  if (status === "INCONCLUSIVE") return "Inconclusive";
  if (status === "UNAVAILABLE") return "Unavailable";
  return "Skipped";
}

function checkDescription(name: string) {
  if (name === "event_count") return "Canonical and indexed event totals";
  if (name === "event_presence") return "Every canonical event is represented";
  if (name === "duplicate_detection") return "No duplicate event identities";
  if (name === "transaction_provenance") return "Transactions resolve to real chain logs";
  if (name === "block_provenance") return "Block numbers agree with the chain";
  if (name.startsWith("field_accuracy:")) return `${name.slice("field_accuracy:".length)} field equality`;
  return name.replaceAll("_", " ");
}

export function CommandComposer({ onSubmit, status = "idle", error = "" }: { onSubmit: (request: ComposerRequest) => void; status?: ComposerStatus; error?: string }) {
  const [command, setCommand] = useState(DEFAULT_COMMAND);
  const [focused, setFocused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [abiName, setAbiName] = useState("");
  const [event, setEvent] = useState<"Deposit" | "Withdraw">("Deposit");
  const [subgraph, setSubgraph] = useState("graphnode:lute/steak-honest");
  const [fromBlock, setFromBlock] = useState("51115000");
  const [toBlock, setToBlock] = useState("51125000");
  const [compile, setCompile] = useState(false);

  const chooseQuickAction = (next: string) => setCommand(next);
  const busy = status === "submitting" || status === "running";

  return <section className={`command-composer ${focused ? "is-focused" : ""} ${busy ? "is-running" : ""}`} aria-labelledby="command-title">
    <div className="composer__eyebrow"><span className="composer__pulse" /> Agent workspace</div>
    <h1 id="command-title">What do you want Lute to do?</h1>
    <p className="composer__subtitle">Describe the outcome. Lute builds the candidate, independently verifies it, and keeps deployment behind the evidence gate.</p>
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ command, network: "base", pack: "erc4626", event, subgraph, fromBlock, toBlock, compile }); }}>
      <textarea
        aria-label="Command for Lute"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
        placeholder="Build an ERC-4626 Subgraph for 0x… on Base and deploy it if verified."
        disabled={busy}
      />
      <div className="composer__controls">
        <label className="composer-control"><FileCode2 size={15} /> {abiName || "Attach ABI"}<input type="file" accept=".json,.abi" onChange={(e) => setAbiName(e.target.files?.[0]?.name ?? "")} /></label>
        <label className="composer-control"><span className="network-dot" /> Base <select aria-label="Network" defaultValue="base"><option value="base">Base</option></select><ChevronDown size={13} /></label>
        <label className="composer-control"><ShieldCheck size={15} /> ERC-4626 (Auto) <select aria-label="Integrity pack" defaultValue="erc4626"><option value="erc4626">ERC-4626 (Auto)</option></select><ChevronDown size={13} /></label>
        <button type="button" className={`composer-control composer-control--button ${moreOpen ? "is-active" : ""}`} onClick={() => setMoreOpen((value) => !value)}><Terminal size={15} /> More options <ChevronDown size={13} /></button>
        <Button type="submit" disabled={busy}><Play size={15} /> {status === "submitting" ? "Creating run…" : status === "running" ? "Lute is working…" : "Run with Lute"}</Button>
      </div>
      {moreOpen && <div className="composer__more">
        <label><span>Index source</span><select value={subgraph} onChange={(e) => setSubgraph(e.target.value)}><option value="graphnode:lute/steak-honest">Graph Node · honest candidate</option><option value="graphnode:lute/steak-bugged">Graph Node · bugged candidate</option><option value="morpho">Morpho · public index</option></select></label>
        <label><span>Event</span><select value={event} onChange={(e) => setEvent(e.target.value as "Deposit" | "Withdraw")}><option>Deposit</option><option>Withdraw</option></select></label>
        <label><span>From block</span><input value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} /></label>
        <label><span>To block</span><input value={toBlock} onChange={(e) => setToBlock(e.target.value)} /></label>
        <label className="composer-check"><input type="checkbox" checked={compile} onChange={(e) => setCompile(e.target.checked)} /> Run Graph codegen/build</label>
      </div>}
    </form>
    {error && <div className="composer__error" role="alert"><CircleAlert size={16} /> {error}</div>}
    <div className="composer__quick"><span>Quick actions</span>{[
      "Build a Subgraph for this contract", "Audit this Subgraph", "Fix the failed mapping", "Explain this divergence", "Monitor this deployment",
    ].map((action) => <button key={action} type="button" onClick={() => chooseQuickAction(action)}>{action}</button>)}</div>
  </section>;
}

function stageState(run: VerificationRun | null, gate: DeploymentGateSnapshot | null, build: WorkflowBuild | null, key: "build" | "verify" | "repair" | "deploy" | "monitor"): StageState {
  if (key === "build") return build || run ? "PASSED" : "WAITING";
  if (key === "verify") {
    if (!run) return "WAITING";
    if (run.verdict === "VERIFIED") return "PASSED";
    if (run.verdict === "FAILED") return "FAILED";
    return "WAITING";
  }
  if (key === "repair") return run?.verdict === "FAILED" ? "WAITING" : run ? "SKIPPED" : "WAITING";
  if (key === "deploy") {
    if (gate?.allowed) return "PASSED";
    if (run?.verdict === "FAILED" || run?.verdict === "INCONCLUSIVE" || gate?.state === "BLOCKED" || gate?.state === "STALE") return "BLOCKED";
    return "WAITING";
  }
  if (gate?.allowed && run) return "WAITING";
  return "WAITING";
}

export function LifecyclePipeline({ snapshot, build, onNavigate }: { snapshot: DashboardSnapshot; build: WorkflowBuild | null; onNavigate: (section: string) => void }) {
  const run = snapshot.latest;
  const stages = [
    { key: "build", label: "Build", state: stageState(run, snapshot.gate, build, "build"), detail: build ? "Candidate hash recorded" : "Create a candidate" },
    { key: "verify", label: "Verify", state: stageState(run, snapshot.gate, build, "verify"), detail: run ? `${run.coverage.strongChecksPassed}/${run.coverage.strongChecksTotal} strong checks` : "Independent evidence" },
    { key: "repair", label: "Repair", state: stageState(run, snapshot.gate, build, "repair"), detail: run?.verdict === "FAILED" ? "Repair available" : run ? "Not needed" : "Only when evidence fails" },
    { key: "deploy", label: "Deploy", state: stageState(run, snapshot.gate, build, "deploy"), detail: snapshot.gate?.allowed ? "Verified candidate" : "Fail-closed gate" },
    { key: "monitor", label: "Monitor", state: stageState(run, snapshot.gate, build, "monitor"), detail: snapshot.monitoring.configuredTargets ? `${snapshot.monitoring.configuredTargets} target configured` : "Optional production stage" },
  ];
  return <section className="workflow-section" aria-labelledby="lifecycle-title">
    <div className="section-heading"><div><span className="section-kicker">Lifecycle</span><h2 id="lifecycle-title">Build → Verify → Repair → Deploy</h2></div><span className="section-note">The gate never accepts an unverified candidate.</span></div>
    <div className="lifecycle-panel"><VerificationLine stages={stages} /><div className="lifecycle__footer"><span><Lock size={14} /> Independent approval boundary</span>{run?.verdict === "FAILED" && <Button variant="secondary" onClick={() => onNavigate("runs")}><Wrench size={14} /> Open repair</Button>}{snapshot.gate?.allowed && <Button onClick={() => onNavigate("deployments")}><RocketIcon /> Deploy verified candidate</Button>}</div></div>
  </section>;
}

function RocketIcon() { return <ArrowRight size={15} />; }

export function CurrentRunCard({ run, onNavigate }: { run: VerificationRun | null; onNavigate: (section: string) => void }) {
  if (!run) return <section className="panel current-run"><div className="empty"><span className="empty__icon"><ShieldCheck size={24} /></span><h2>No current run</h2><p>Use the command composer above to create a candidate and start an independent verification.</p></div></section>;
  const indexed = run.report.subgraphEvidence?.recordCount;
  const canonical = run.report.rawEvidence?.eventCount;
  const violations = run.report.checks.filter((check) => check.status === "FAIL").length;
  const download = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `lute-${run.runId}.json`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <section className="panel current-run" aria-labelledby="current-run-title">
    <div className="panel__h"><h2 id="current-run-title"><RefreshCw size={18} /> Current Run</h2><StatusBadge status={run.verdict} /></div>
    <div className="current-run__identity"><span className="mono">Run #{short(run.runId, 8, 2)}</span><strong>{run.report.event} events · {run.report.target.network.toUpperCase()}</strong><span className="mono">{short(run.report.target.contract, 12, 6)}</span></div>
    <div className="current-run__range"><span>Blocks</span><b className="mono">{run.report.range.startBlock} – {run.report.range.endBlock}</b></div>
    <div className="current-run__stats"><div><b>{indexed ?? "—"}</b><span>Indexed Events</span></div><div><b>{canonical ?? "—"}</b><span>Canonical Events</span></div><div><b>{violations}</b><span>Violations</span></div><div><b>{run.verdict}</b><span>Verdict</span></div></div>
    <div className="current-run__actions"><Button variant="secondary" onClick={() => onNavigate("runs")}>View All Results <ArrowRight size={14} /></Button><Button variant="ghost" onClick={download}><Download size={14} /> Download Report</Button><Button variant="ghost" onClick={() => onNavigate("runs")}>More <ArrowRight size={14} /></Button></div>
  </section>;
}

export function DeploymentGateCard({ snapshot, onNavigate }: { snapshot: DashboardSnapshot; onNavigate: (section: string) => void }) {
  const gate = snapshot.gate;
  const tone = gate?.allowed ? "success" : gate?.state === "INCOMPLETE" ? "warning" : "danger";
  return <section className="panel gate-card" aria-labelledby="gate-title">
    <div className="panel__h"><h2 id="gate-title"><Lock size={18} /> Deployment Gate</h2><Badge tone={tone}>{gate?.state ?? "INCOMPLETE"}</Badge></div>
    <p className="gate__note">{gate?.allowed ? "The exact candidate hash matches the verified run and satisfies the policy." : gate?.reasons.join("; ") ?? "A verification run is required before deployment."}</p>
    <div className="gate__row"><span><Fingerprint size={15} /> Candidate hash</span><span className="gate__val mono">{short(gate?.candidateHash)}</span></div>
    <div className="gate__row"><span><Fingerprint size={15} /> Verified hash</span><span className="gate__val mono">{short(gate?.verifiedCandidateHash)}</span></div>
    <div className="gate__row"><span><Package size={15} /> Integrity pack</span><span className="gate__val mono">{gate?.integrityPack ?? "erc4626@1"}</span></div>
    <div className="gate__row"><span><ShieldCheck size={15} /> Strong checks</span><span className="gate__val">{snapshot.latest ? `${snapshot.latest.coverage.strongChecksPassed}/${snapshot.latest.coverage.strongChecksTotal}` : "—"}</span></div>
    <div className="gate-card__action">{gate?.allowed ? <Button onClick={() => onNavigate("deployments")}>Deploy Verified Candidate <ArrowRight size={14} /></Button> : <Button variant="secondary" onClick={() => onNavigate(snapshot.latest?.verdict === "FAILED" ? "runs" : "overview")}>{snapshot.latest?.verdict === "FAILED" ? "Repair Candidate" : "View required checks"}</Button>}</div>
  </section>;
}

function EvidenceValues({ values }: { values: Record<string, string> | null | undefined }) {
  const fields = ["assets", "shares", "receiver", "owner"];
  return <div className="evidence-values">{fields.map((field) => <div key={field}><span>{field}</span><b className="mono">{values?.[field] ?? "—"}</b></div>)}</div>;
}

export function FirstDivergenceCard({ report, onNavigate }: { report: AuditReport | null; onNavigate: (section: string) => void }) {
  const divergence = report?.firstDivergence;
  return <section className={`panel divergence-card ${divergence ? "has-divergence" : ""}`} aria-labelledby="divergence-title">
    <div className="panel__h"><h2 id="divergence-title"><AlertTriangle size={18} /> First Divergence</h2><Badge tone={divergence ? "danger" : "success"}>{divergence ? "Missing event" : "No divergence"}</Badge></div>
    {!report && <div className="empty"><p>Evidence will appear after the first verification run.</p></div>}
    {report && !divergence && <div className="divergence-empty"><CheckCircle2 size={20} /><div><strong>The index matches canonical chain evidence.</strong><span>{report.eventsChecked} events cross-checked over {report.range.startBlock} → {report.range.endBlock}.</span></div></div>}
    {report && divergence && <>
      <div className="divergence-meta"><div><span>Block</span><b className="mono">{divergence.blockNumber}</b></div><div><span>Transaction</span><b className="mono">{short(divergence.transactionHash, 18, 8)}</b></div><div><span>Log Index</span><b className="mono">{divergence.logIndex}</b></div><div><span>Event</span><b>{divergence.event}</b></div></div>
      <div className="evidence-columns"><div><div className="evidence-heading"><span className="evidence-dot evidence-dot--expected" /> ONCHAIN / EXPECTED</div><EvidenceValues values={divergence.raw} /></div><div><div className="evidence-heading"><span className="evidence-dot evidence-dot--actual" /> INDEXED / ACTUAL</div><EvidenceValues values={divergence.indexed} /></div></div>
      <p className="divergence-explanation">The {divergence.event} event exists onchain but does not match the indexed data. Lute stopped at the first evidence-backed disagreement.</p>
      <Button variant="secondary" onClick={() => onNavigate("runs")}>View Full Evidence <ArrowRight size={14} /></Button>
    </>}
  </section>;
}

export function DiagnosisCard({ run, onApply, repairState, repairResult }: { run: VerificationRun | null; onApply: () => void; repairState: "idle" | "running" | "done" | "error"; repairResult: WorkflowRepair | null }) {
  const divergence = run?.report.firstDivergence;
  if (!run || run.verdict !== "FAILED" || !divergence) return <section className="panel diagnosis-card diagnosis-card--quiet"><div className="panel__h"><h2><Wrench size={18} /> AI Diagnosis / Repair</h2><Badge tone="neutral">Waiting</Badge></div><p className="muted">When independent evidence finds a divergence, Lute will show an evidence-bound diagnosis here. The AI may suggest a fix; only the verifier can approve the result.</p></section>;
  return <section className="panel diagnosis-card" aria-labelledby="diagnosis-title">
    <div className="panel__h"><h2 id="diagnosis-title"><Wrench size={18} /> AI Diagnosis</h2><Badge tone="warning">Repair available</Badge></div>
    <p className="diagnosis__summary">The mapping is not producing the same {divergence.event} record as the canonical chain at the first divergence.</p>
    <div className="diagnosis__fix"><strong>Suggested Fix</strong><span>Inspect the event handler and preserve the chain identity: transaction hash plus log index. Reverification is required after every candidate change.</span></div>
    <pre className="code-preview"><code>{`export function handle${divergence.event}(event: ${divergence.event}): void {\n  let entity = new ${divergence.event}(\n    event.transaction.hash.toHex() + "-" + event.logIndex.toString()\n  )\n  entity.save()\n}`}</code></pre>
    {repairResult?.applied && <div className="repair-result"><CheckCircle2 size={16} /><span>Candidate changed: <b className="mono">{short(repairResult.candidate?.candidateHash ?? repairResult.context.candidateHash)}</b>. Reverification is required.</span></div>}
    <Button variant="secondary" onClick={onApply} disabled={repairState === "running"}>{repairState === "running" ? <><RefreshCw size={15} className="spin" /> Repair running…</> : repairState === "done" ? <><CheckCircle2 size={15} /> Fix applied — reverify</> : <><Wrench size={15} /> Apply Fix with AI Agent</>}</Button>
  </section>;
}

export function VerificationChecksTable({ run }: { run: VerificationRun | null }) {
  if (!run) return <div className="empty"><p>Verification checks will appear after a run.</p></div>;
  return <div className="checks-wrap"><table className="dtable verification-table"><thead><tr><th>Check</th><th>Description</th><th>Result</th><th>Details</th></tr></thead><tbody>{run.report.checks.map((check) => <tr key={check.name}><td className="mono">{check.name}</td><td>{checkDescription(check.name)}</td><td><StatusBadge status={check.status} /><span className="sr-only">{resultLabel(check.status)}</span></td><td className="muted">{check.detail ?? resultLabel(check.status)}</td></tr>)}</tbody></table></div>;
}

function EvidenceNode({ label, value, children, open = false }: { label: string; value?: string; children?: ReactNode; open?: boolean }) {
  return <details className="evidence-node" open={open}><summary><span className="evidence-node__marker" /><span>{label}</span>{value && <b className="mono">{value}</b>}</summary>{children && <div className="evidence-node__children">{children}</div>}</details>;
}

export function EvidenceGraph({ run }: { run: VerificationRun | null }) {
  if (!run) return <div className="empty"><p>Run evidence is not available yet.</p></div>;
  const d = run.report.firstDivergence;
  const block = d?.blockNumber ?? run.report.range.startBlock;
  const tx = d?.transactionHash ?? run.report.rawEvidence?.rpcAlias;
  const nodes = [
    ["BLOCK", block],
    ["TRANSACTION", short(tx, 20, 6)],
    ["LOG", d ? String(d.logIndex) : "matched"],
    ["DECODED EVENT", run.report.event],
    ["CANONICAL FACT", d ? "divergence found" : "verified"],
    ["EXPECTED ENTITY", d ? "onchain" : `${run.report.eventsChecked} records`],
    ["INDEXED ENTITY", d ? "missing or mismatched" : `${run.report.subgraphEvidence?.recordCount ?? "—"} records`],
    ["CHECK", d?.check ?? "all strong checks"],
    ["VIOLATION", d ? "present" : "none"],
    ["VERDICT", run.verdict],
  ] as const;
  const renderNode = (index: number): ReactNode => {
    const [label, value] = nodes[index]!;
    return <EvidenceNode label={label} value={value} open={index < 6}>{index < nodes.length - 1 ? renderNode(index + 1) : null}</EvidenceNode>;
  };
  return <div className="evidence-graph">{renderNode(0)}</div>;
}

export function ChainVsIndexedCard({ run }: { run: VerificationRun | null }) {
  const canonical = run?.report.rawEvidence?.eventCount ?? null;
  const indexed = run?.report.subgraphEvidence?.recordCount ?? null;
  const rate = canonical && indexed !== null ? Math.min(100, (indexed / canonical) * 100) : null;
  return <section className="panel comparison-card"><div className="panel__h"><h2><GitBranch size={18} /> Chain vs indexed</h2><Badge tone={rate === 100 ? "success" : rate === null ? "neutral" : "danger"}>{rate === null ? "Waiting" : `${rate.toFixed(1)}% match`}</Badge></div><div className="comparison-bars"><div><span>Onchain events</span><b>{canonical ?? "—"}</b><div className="comparison-bar"><i style={{ width: "100%" }} /></div></div><div><span>Indexed events</span><b>{indexed ?? "—"}</b><div className="comparison-bar"><i className={rate !== 100 ? "is-diverged" : ""} style={{ width: `${rate ?? 0}%` }} /></div></div></div>{rate !== null && rate !== 100 && <p className="comparison-warning"><XCircle size={15} /> Divergence point is recorded in First Divergence above.</p>}{run && rate === 100 && <p className="comparison-success"><CheckCircle2 size={15} /> Every event in this range was cross-checked.</p>}</section>;
}

export function IntegrationConnections({ snapshot }: { snapshot: DashboardSnapshot }) {
  const connections = [
    { name: "The Graph", detail: snapshot.latest ? "Subgraph evidence connected" : "Subgraphs and GraphQL data", tone: snapshot.latest ? ("success" as const) : ("neutral" as const) },
    { name: "Hedera", detail: "Paid verification integration", tone: "info" as const },
    { name: "Bazantic", detail: "Recipe and gateway integration", tone: "info" as const },
    { name: "MCP & API", detail: "Agent access and OpenAPI", tone: "info" as const },
    { name: "Substreams", detail: "Optional independent source", tone: "neutral" as const },
  ];
  return <section className="integration-connections"><div className="section-heading"><div><span className="section-kicker">Connections</span><h2>Graph infrastructure, with trust around it.</h2></div><span className="section-note">Sponsor integrations stay below the product workflow.</span></div><div className="connection-grid">{connections.map((connection) => <div className="connection-card" key={connection.name}><span className="connection-card__mark">{connection.name.slice(0, 1)}</span><div><strong>{connection.name}</strong><span>{connection.detail}</span></div><Badge tone={connection.tone}>{connection.tone === "success" ? "Connected" : "Available"}</Badge></div>)}</div></section>;
}

export { DEFAULT_COMMAND };
