import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, FileCode2, FolderGit2, Loader2, Play, ShieldCheck, Wrench } from "lucide-react";
import { Badge, Button, StatusBadge } from "../../components/ui";
import { buildProject, listWorkflowBuilds, runVerification } from "../../lib/api";
import type { WorkflowBuild, WorkflowVerification } from "../../lib/types";

type State = "idle" | "running" | "done" | "error";

const DEFAULT_CONTRACT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";

export function Projects({ onNavigate }: { onNavigate?: (section: "runs" | "deployments" | "overview") => void } = {}) {
  const [intent, setIntent] = useState(`Build an ERC-4626 indexer on Base for ${DEFAULT_CONTRACT}`);
  const [contract, setContract] = useState(DEFAULT_CONTRACT);
  const [startBlock, setStartBlock] = useState("51115000");
  const [compile, setCompile] = useState(false);
  const [buildState, setBuildState] = useState<State>("idle");
  const [verifyState, setVerifyState] = useState<State>("idle");
  const [build, setBuild] = useState<WorkflowBuild | null>(null);
  const [verification, setVerification] = useState<WorkflowVerification | null>(null);
  const [event, setEvent] = useState<"Deposit" | "Withdraw">("Deposit");
  const [fromBlock, setFromBlock] = useState("51115000");
  const [toBlock, setToBlock] = useState("51125000");
  const [subgraph, setSubgraph] = useState("morpho");
  const [error, setError] = useState("");

  useEffect(() => {
    listWorkflowBuilds().then(({ builds }) => {
      const latest = builds[0];
      if (!latest) return;
      setBuild(latest);
      setBuildState("done");
      setContract(latest.result.contract);
      setStartBlock(latest.result.startBlock);
      setIntent(`Build an ERC-4626 indexer on Base for ${latest.result.contract}`);
    }).catch(() => { /* an empty build history is a valid first-run state */ });
  }, []);

  const buildCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuildState("running"); setError(""); setBuild(null); setVerification(null);
    try {
      const result = await buildProject({ intent, contract: contract.trim(), startBlock: startBlock.trim(), compile });
      setBuild(result); setBuildState("done");
      onNavigate?.("runs");
    } catch (err) {
      setError((err as Error).message); setBuildState("error");
    }
  };

  const verifyCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyState("running"); setError(""); setVerification(null);
    try {
      const result = await runVerification({
        contract: contract.trim(), event, fromBlock: fromBlock.trim(), toBlock: toBlock.trim(), subgraph,
        candidateRef: build?.buildId ?? "current",
      });
      setVerification(result); setVerifyState("done");
    } catch (err) {
      setError((err as Error).message); setVerifyState("error");
    }
  };

  return <>
    <div className="dash-head">
      <div><h1>Build</h1><p>Describe the Graph infrastructure you need. Lute creates a candidate, then carries it into independent verification before deployment.</p></div>
      <Badge tone="accent">ERC-4626 · Base</Badge>
    </div>

    <div className="panel" style={{ marginBottom: "var(--sp-4)" }}>
      <div className="panel__h"><h2><Boxes size={18} /> Build lifecycle</h2><Badge tone="success">Fail-closed</Badge></div>
      <div className="build-lifecycle" aria-label="Build lifecycle">
        <span className="build-lifecycle__step is-done">BUILD</span><ArrowRight size={16} />
        <span className={build ? "build-lifecycle__step is-done" : "build-lifecycle__step"}>VERIFY</span><ArrowRight size={16} />
        <span className={verification?.run.verdict === "VERIFIED" ? "build-lifecycle__step is-done" : "build-lifecycle__step"}>DEPLOY</span>
      </div>
      <div className="g3">
        <div><strong>1. Build</strong><p className="muted">Scaffold the reviewed template and record an exact candidate hash.</p></div>
        <div><strong>2. Verify</strong><p className="muted">Compare raw Base logs with the index and persist evidence-backed checks.</p></div>
        <div><strong>3. Deploy</strong><p className="muted">Repair with proof, re-verify, and deploy only the matching verified hash.</p></div>
      </div>
    </div>

    <div className="g2 stack">
      <div className="panel">
        <div className="panel__h"><h2><FileCode2 size={18} /> 1 · Build candidate</h2><Badge tone={buildState === "done" ? "success" : "info"}>{buildState === "running" ? "Building…" : buildState === "done" ? "Ready" : "Explicit"}</Badge></div>
        <form className="audit-form" onSubmit={buildCandidate}>
          <div className="field full"><label>Build intent</label><input value={intent} onChange={(e) => setIntent(e.target.value)} /></div>
          <div className="field full"><label>Vault contract</label><input value={contract} onChange={(e) => setContract(e.target.value)} spellCheck={false} /></div>
          <div className="field"><label>Start block</label><input value={startBlock} onChange={(e) => setStartBlock(e.target.value)} /></div>
          <label className="field" style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 22 }}><input type="checkbox" checked={compile} onChange={(e) => setCompile(e.target.checked)} style={{ width: "auto" }} /><span>Run Graph codegen/build</span></label>
          <div className="field full"><Button type="submit" disabled={buildState === "running"}>{buildState === "running" ? <><Loader2 size={15} className="spin" /> Building…</> : <><FileCode2 size={15} /> Build candidate</>}</Button><div className="hint">Compilation is optional and off by default. Build does not verify or deploy.</div></div>
        </form>
        {build && <div style={{ marginTop: "var(--sp-4)" }}><div className="kvrow"><span>Build id</span><span className="mono">{build.buildId}</span></div><div className="kvrow"><span>Candidate hash</span><span className="mono">{build.result.candidate.candidateHash}</span></div><div className="kvrow"><span>Files</span><span>{build.result.candidate.fileCount}</span></div><div className="build-next"><CheckCircle2 size={17} /><div><strong>Candidate created</strong><span>Open Verification Runs to inspect the result.</span></div><Button variant="secondary" onClick={() => onNavigate?.("runs")}>Open Verification <ArrowRight size={14} /></Button></div><div className="dcode" style={{ marginTop: "var(--sp-3)" }}>{build.result.stages.map((stage) => <div key={stage.name}><span className="ln">{stage.status}</span>{stage.name}: {stage.detail}</div>)}</div></div>}
      </div>

      <div className="panel">
        <div className="panel__h"><h2><ShieldCheck size={18} /> 2 · Verify candidate</h2><Badge tone={verification?.run.verdict === "VERIFIED" ? "success" : "info"}>{verifyState === "running" ? "Verifying…" : verification?.run.verdict ?? "Required"}</Badge></div>
        <form className="audit-form" onSubmit={verifyCandidate}>
          <div className="field"><label>Event</label><select value={event} onChange={(e) => setEvent(e.target.value as "Deposit" | "Withdraw")}><option>Deposit</option><option>Withdraw</option></select></div>
          <div className="field"><label>Index source</label><select value={subgraph} onChange={(e) => setSubgraph(e.target.value)}><option value="morpho">Morpho — public index</option><option value="graphnode:lute/steak-honest">Graph Node — honest</option><option value="graphnode:lute/steak-bugged">Graph Node — bugged</option><option value="local:block-id">Local — planted bug</option></select></div>
          <div className="field"><label>From block</label><input value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} /></div>
          <div className="field"><label>To block</label><input value={toBlock} onChange={(e) => setToBlock(e.target.value)} /></div>
          <div className="field full"><Button type="submit" disabled={verifyState === "running"}>{verifyState === "running" ? <><Loader2 size={15} className="spin" /> Running verifier…</> : <><Play size={15} /> Verify and save run</>}</Button><div className="hint">Candidate: <span className="mono">{build?.buildId ?? "current"}</span>. A new persisted run is created every time.</div></div>
        </form>
        {verification && <div style={{ marginTop: "var(--sp-4)" }}><div className="audit-result__verdict"><StatusBadge status={verification.run.verdict} /><span className="muted">{verification.run.report.eventsChecked} events checked · run <span className="mono">{verification.run.runId}</span></span></div><div className="kvrow"><span>Evidence root</span><span className="mono">{verification.run.evidenceRoot}</span></div>{verification.run.verdict === "FAILED" && <div className="workflow-alert workflow-alert--danger"><AlertTriangle size={18} /><div><strong>Deployment Blocked</strong><span>{verification.run.report.firstDivergence ? `First divergence: block ${verification.run.report.firstDivergence.blockNumber}, log ${verification.run.report.firstDivergence.logIndex}.` : "The index disagrees with canonical chain evidence."}</span></div><Button variant="secondary" onClick={() => onNavigate?.("runs")}>Repair Candidate</Button></div>}{verification.run.verdict === "VERIFIED" && <div className="workflow-alert workflow-alert--success"><CheckCircle2 size={18} /><div><strong>Verification passed</strong><span>The candidate is ready for the deployment gate.</span></div><Button onClick={() => onNavigate?.("deployments")}>Deploy Verified Candidate</Button></div>}{verification.run.verdict === "INCONCLUSIVE" && <div className="workflow-alert workflow-alert--warning"><AlertTriangle size={18} /><div><strong>Deployment remains blocked</strong><span>Resolve the incomplete evidence and run verification again.</span></div></div>}</div>}
      </div>
    </div>

    {error && <div className="panel" style={{ borderColor: "var(--danger)" }}><div className="empty"><Wrench size={24} /><h2>Workflow action failed</h2><p>{error}</p></div></div>}
    <div className="panel"><div className="panel__h"><h2><CheckCircle2 size={18} /> 3 · Gate and deploy</h2><Badge tone="neutral">Separate operator action</Badge></div><p className="muted">Open Deploy after verification. Lute recalculates the exact candidate hash, shows the fail-closed gate, and provides a dry-run Graph plan. An external deploy requires explicit confirmation and server authorization.</p></div>
  </>;
}

export function ProjectList({ onBuild }: { onBuild: () => void }) {
  const [builds, setBuilds] = useState<WorkflowBuild[]>([]);
  useEffect(() => { listWorkflowBuilds().then(({ builds: storedBuilds }) => setBuilds(storedBuilds)).catch(() => { /* show the project even before its first build */ }); }, []);
  const latest = builds[0] ?? null;
  return <>
    <div className="dash-head"><div><h1>Projects</h1><p>Projects are the candidates Lute builds, verifies, repairs, and deploys.</p></div><Button onClick={onBuild}><FileCode2 size={15} /> New Build</Button></div>
    <div className="panel">
      <div className="panel__h"><h2><FolderGit2 size={18} /> steak-honest</h2><Badge tone="success">Active</Badge></div>
      <div className="kvrow"><span>Workflow</span><span className="mono">ERC-4626 · Base</span></div>
      <div className="kvrow"><span>Contract</span><span className="mono">{latest?.result.contract ?? DEFAULT_CONTRACT}</span></div>
      <div className="kvrow"><span>Latest candidate</span><span className="mono">{latest?.result.candidate.candidateHash ?? "Not created"}</span></div>
      <div className="kvrow"><span>Lifecycle</span><span className="muted">{latest ? "Candidate ready for verification." : "Build a new candidate to begin."}</span></div>
      <Button variant="secondary" onClick={onBuild}>Open Build <ArrowRight size={14} /></Button>
    </div>
  </>;
}
