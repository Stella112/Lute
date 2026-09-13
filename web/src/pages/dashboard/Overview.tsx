import { useEffect, useState } from "react";
import { Activity, AlertTriangle, FileText, GitBranch, Settings, ShieldCheck } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { buildProject, getDashboard, getRepairContext, listWorkflowBuilds, runVerification } from "../../lib/api";
import type { DashboardSnapshot, WorkflowBuild, WorkflowRepair } from "../../lib/types";
import {
  ChainVsIndexedCard, CommandComposer, CurrentRunCard, DeploymentGateCard, DiagnosisCard,
  EvidenceGraph, FirstDivergenceCard, IntegrationConnections, LifecyclePipeline,
  type ComposerRequest, type ComposerStatus, VerificationChecksTable,
} from "../../components/dashboard/WorkflowSurface";

type DetailTab = "checks" | "evidence" | "logs" | "configuration";

export function Overview({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [builds, setBuilds] = useState<WorkflowBuild[]>([]);
  const [loadError, setLoadError] = useState("");
  const [composerStatus, setComposerStatus] = useState<ComposerStatus>("idle");
  const [composerError, setComposerError] = useState("");
  const [tab, setTab] = useState<DetailTab>("checks");
  const [repairState, setRepairState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [repairResult, setRepairResult] = useState<WorkflowRepair | null>(null);

  const refresh = async () => {
    const [dashboard, workflowBuilds] = await Promise.all([getDashboard(), listWorkflowBuilds()]);
    setSnapshot(dashboard);
    setBuilds(workflowBuilds.builds);
  };

  useEffect(() => { refresh().catch((err: Error) => setLoadError(err.message)); }, []);

  const runCommand = async (request: ComposerRequest) => {
    setComposerError(""); setRepairResult(null); setComposerStatus("submitting");
    const address = request.command.match(/0x[a-f-f0-9]{40}/i)?.[0];
    if (!address) {
      setComposerStatus("error");
      setComposerError("Use a full 42-character EVM contract address so Lute can bind the candidate to a real target.");
      return;
    }
    let candidateCreated = false;
    try {
      const build = await buildProject({ intent: request.command, contract: address, startBlock: request.fromBlock, compile: request.compile });
      candidateCreated = true;
      setComposerStatus("running");
      await runVerification({ contract: address, event: request.event, fromBlock: request.fromBlock, toBlock: request.toBlock, subgraph: request.subgraph, candidateRef: build.buildId });
      await refresh();
      setComposerStatus("idle");
    } catch (err) {
      setComposerStatus("error");
      setComposerError(candidateCreated ? `The candidate was created, but verification could not finish: ${(err as Error).message}` : (err as Error).message);
      try { await refresh(); } catch { /* retain the actionable original error */ }
    }
  };

  const applyRepair = async () => {
    if (!snapshot?.latest || snapshot.latest.verdict !== "FAILED") return;
    if (!window.confirm("Apply the evidence-bound repair to the current candidate? Its hash will change and deployment will remain blocked until reverification.")) return;
    setRepairState("running");
    try {
      const result = await getRepairContext(snapshot.latest.runId, "current", true);
      setRepairResult(result);
      await refresh();
      setRepairState("done");
    } catch (err) {
      setRepairState("error");
      setComposerError((err as Error).message);
    }
  };

  return <>
    <CommandComposer onSubmit={runCommand} status={composerStatus} error={composerError} />
    {loadError && <div className="panel dashboard-error" role="alert"><AlertTriangle size={18} /><div><strong>Live data unavailable</strong><span>{loadError}</span></div><Button variant="secondary" onClick={() => { setLoadError(""); refresh().catch((err: Error) => setLoadError(err.message)); }}>Retry</Button></div>}
    {!snapshot && !loadError && <div className="panel"><div className="empty"><span className="empty__icon"><Activity size={24} /></span><h2>Connecting to Lute</h2><p>Loading the current run, evidence, and deployment gate.</p></div></div>}
    {snapshot && <>
      <LifecyclePipeline snapshot={snapshot} build={builds[0] ?? null} onNavigate={onNavigate} />
      <div className="workflow-grid workflow-grid--run"><CurrentRunCard run={snapshot.latest} onNavigate={onNavigate} /><DeploymentGateCard snapshot={snapshot} onNavigate={onNavigate} /></div>
      <div className="workflow-grid workflow-grid--evidence"><FirstDivergenceCard report={snapshot.latest?.report ?? null} onNavigate={onNavigate} /><DiagnosisCard run={snapshot.latest} onApply={applyRepair} repairState={repairState} repairResult={repairResult} /></div>

      <section className="detail-tabs" aria-label="Verification detail tabs">
        <div className="detail-tabs__bar" role="tablist">{[
          ["checks", "Verification Checks", ShieldCheck], ["evidence", "Evidence Graph", GitBranch], ["logs", "Logs", FileText], ["configuration", "Configuration", Settings],
        ].map(([key, label, Icon]) => { const ItemIcon = Icon as typeof ShieldCheck; return <button key={key as string} role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key as DetailTab)}><ItemIcon size={15} />{label as string}</button>; })}</div>
        <div className="detail-tabs__content">
          {tab === "checks" && <><div className="section-heading"><div><span className="section-kicker">Independent verifier</span><h2>Verification Checks</h2></div><span className="section-note">Pass, fail, inconclusive, unavailable, and skipped remain distinct.</span></div><VerificationChecksTable run={snapshot.latest} /></>}
          {tab === "evidence" && <><div className="section-heading"><div><span className="section-kicker">Traceability</span><h2>Evidence Graph</h2></div><span className="section-note">Expand each node from block to verdict.</span></div><EvidenceGraph run={snapshot.latest} /></>}
          {tab === "logs" && <LogsPanel snapshot={snapshot} />}
          {tab === "configuration" && <ConfigurationPanel snapshot={snapshot} />}
        </div>
      </section>

      <div className="workflow-grid workflow-grid--comparison"><ChainVsIndexedCard run={snapshot.latest} /><IntegritySnapshot snapshot={snapshot} /></div>
      <IntegrationConnections snapshot={snapshot} />
    </>}
  </>;
}

function LogsPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
  const run = snapshot.latest;
  return <div className="logs-panel"><div className="section-heading"><div><span className="section-kicker">Run output</span><h2>Logs</h2></div><Badge tone={run ? "success" : "neutral"}>{run ? "Persisted" : "Empty"}</Badge></div>{run ? <div className="dcode"><div><span className="ln">INFO</span> verification run {run.runId}</div><div><span className="ln">INFO</span> candidate {run.candidateHash}</div><div><span className="ln">INFO</span> {run.report.eventsChecked} event(s) cross-checked</div><div><span className="ln">INFO</span> evidence root {run.evidenceRoot}</div><div><span className="ln">STATE</span> verdict {run.verdict}</div></div> : <div className="empty"><p>No run logs yet.</p></div>}</div>;
}

function ConfigurationPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
  const run = snapshot.latest;
  return <div className="configuration-panel"><div className="section-heading"><div><span className="section-kicker">Bound inputs</span><h2>Configuration</h2></div><Badge tone="info">Read-only run binding</Badge></div><div className="config-grid"><div><span>Network</span><b>{run?.report.target.network ?? "Base"}</b></div><div><span>Integrity Pack</span><b>{run ? `${run.integrityPack.id}@${run.integrityPack.version}` : snapshot.packs[0] ? `${snapshot.packs[0].id}@${snapshot.packs[0].version}` : "erc4626@1"}</b></div><div><span>Contract</span><b className="mono">{run?.report.target.contract ?? "Not selected"}</b></div><div><span>Range</span><b className="mono">{run ? `${run.report.range.startBlock} → ${run.report.range.endBlock}` : "Not selected"}</b></div><div><span>Index source</span><b className="mono">{run?.report.target.subgraph ?? "Not selected"}</b></div><div><span>Verifier</span><b className="mono">{snapshot.verifierCommit}</b></div></div></div>;
}

function IntegritySnapshot({ snapshot }: { snapshot: DashboardSnapshot }) {
  const pack = snapshot.packs[0];
  return <section className="panel integrity-snapshot"><div className="panel__h"><h2><ShieldCheck size={18} /> Integrity Pack</h2><Badge tone="success">{pack ? `${pack.id}@${pack.version}` : "Unavailable"}</Badge></div>{pack ? <><p className="muted">{pack.standard} · fail-closed policy</p><div className="pack__checks">{pack.events.map((event) => <span className="chip" key={event}>{event}</span>)}{pack.strongChecks.map((check) => <span className="chip" key={check}>{check}</span>)}</div><div className="kvrow"><span>Required sources</span><span className="mono">{pack.requiredSources.join(" + ")}</span></div><div className="kvrow"><span>Supported chains</span><span>{pack.supportedChains.join(", ")}</span></div></> : <div className="empty"><p>No integrity pack is available.</p></div>}</section>;
}
