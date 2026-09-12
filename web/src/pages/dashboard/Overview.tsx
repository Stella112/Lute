import { useEffect, useMemo, useState } from "react";
import {
  Boxes, AlertTriangle, ShieldCheck, Clock, TrendingUp, Rocket, FileText, Copy, Check,
  Package, ScrollText, BadgeCheck, ArrowRight, Fingerprint, Activity,
} from "lucide-react";
import { Badge, StatusBadge } from "../../components/ui";
import { getDashboard } from "../../lib/api";
import type { DashboardSnapshot, DeploymentGateSnapshot, VerificationRun } from "../../lib/types";

const STAT_ICON: Record<string, typeof Boxes> = {
  verified: Boxes, failed: AlertTriangle, checks: ShieldCheck, last: Clock,
};

function age(iso: string | null): string {
  if (!iso) return "No runs yet";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function runCoverage(run: VerificationRun): string {
  const { strongChecksPassed, strongChecksTotal } = run.coverage;
  return strongChecksTotal > 0 ? `${Math.round((strongChecksPassed / strongChecksTotal) * 100)}%` : "—";
}

function manifestFor(run: VerificationRun | null): string {
  if (!run) return "No verification manifest has been created yet.";
  return JSON.stringify({
    runId: run.runId,
    candidateHash: run.candidateHash,
    integrityPack: `${run.integrityPack.id}@${run.integrityPack.version}`,
    verdict: run.verdict,
    evidenceRoot: run.evidenceRoot,
    createdAt: run.createdAt,
  }, null, 2);
}

function gateTone(gate: DeploymentGateSnapshot | null): "success" | "danger" | "warning" | "neutral" {
  if (!gate) return "neutral";
  if (gate.state === "ALLOWED") return "success";
  if (gate.state === "INCOMPLETE") return "warning";
  return "danger";
}

export function Overview({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDashboard().then(setSnapshot).catch((err: Error) => setError(err.message));
  }, []);

  const latest = snapshot?.latest ?? null;
  const gate = snapshot?.gate ?? null;
  const manifest = useMemo(() => manifestFor(latest), [latest]);
  const stats = snapshot ? [
    { key: "verified", label: "Verified Runs", value: String(snapshot.stats.verifiedRuns), delta: `${snapshot.stats.totalRuns} total runs`, tone: snapshot.stats.verifiedRuns ? "up" : "muted" },
    { key: "failed", label: "Failed Runs", value: String(snapshot.stats.failedRuns), delta: snapshot.stats.failedRuns ? "Needs attention" : "No failures recorded", tone: snapshot.stats.failedRuns ? "warn" : "muted" },
    { key: "checks", label: "Latest Strong Checks", value: latest ? runCoverage(latest) : "—", delta: latest ? `${latest.coverage.strongChecksPassed}/${latest.coverage.strongChecksTotal} passed` : "No completed runs", tone: latest?.verdict === "VERIFIED" ? "up" : "muted" },
    { key: "last", label: "Last Verification", value: age(snapshot.stats.lastVerificationAt), delta: latest ? latest.runId : "Run an audit to begin", tone: "muted" },
  ] as const : [];

  const copyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard may be unavailable */ }
  };

  if (error) return (
    <>
      <div className="dash-head"><div><h1>Overview</h1><p>Your live trust and verification control center.</p></div></div>
      <div className="panel"><div className="empty"><span className="empty__icon"><AlertTriangle size={24} /></span><h2>Dashboard unavailable</h2><p>{error}</p><p className="hint">The Lute API health endpoint did not respond. Try refreshing in a moment.</p></div></div>
    </>
  );

  if (!snapshot) return (
    <>
      <div className="dash-head"><div><h1>Overview</h1><p>Loading live verification data from Lute…</p></div></div>
      <div className="panel"><div className="empty"><span className="empty__icon"><Activity size={24} /></span><h2>Connecting to Lute</h2><p>Reading persisted verification runs and service status.</p></div></div>
    </>
  );

  const divergence = latest?.report.firstDivergence ?? null;
  const failedRuns = snapshot.runs.filter((run) => run.verdict === "FAILED");

  return (
    <>
      <div className="demo-notice" role="status"><strong>Live dashboard data</strong><span>Runs, verdicts, evidence, and integrity packs are read from this Lute instance.</span></div>
      <div className="dash-head">
        <div><h1>Overview</h1><p>Your live trust and verification control center for Graph infrastructure.</p></div>
        <div className="dash-head__tag">Trusted data. Stronger networks.<br />Build. Verify. Repair. Deploy.</div>
      </div>

      <div className="stats">
        {stats.map((s) => {
          const Icon = STAT_ICON[s.key] ?? Boxes;
          const danger = s.key === "failed";
          return <div className="stat" key={s.key}>
            <div className="stat__top"><span className={`stat__icon ${danger ? "is-danger" : "is-accent"}`}><Icon size={20} /></span></div>
            <div className="stat__label">{s.label}</div><div className="stat__value">{s.value}</div>
            <div className={`stat__foot ${s.tone}`}>{s.tone === "up" && <TrendingUp size={13} />}{s.tone === "warn" && <AlertTriangle size={13} />}{s.tone === "muted" && <BadgeCheck size={13} />}{s.delta}</div>
          </div>;
        })}
      </div>

      <div className="g2 stack">
        <div className="panel run">
          <div className="panel__h"><h2><ShieldCheck size={18} /> Latest Verification</h2><span className="panel__link" onClick={() => onNavigate("runs")}>View Details <ArrowRight size={14} /></span></div>
          {latest ? <><p className="run__desc"><span className="mono">{latest.runId}</span> · {latest.report.target.network} · {latest.report.target.contract}</p><div className="audit-result__verdict"><StatusBadge status={latest.verdict} /><span className="muted">{latest.report.eventsChecked} events checked over blocks {latest.report.range.startBlock} → {latest.report.range.endBlock}</span></div></> : <div className="empty"><h2>No verification runs yet</h2><p>Run an External Audit to create the first persisted Verification Run.</p></div>}
        </div>

        <div className="panel">
          <div className="panel__h"><h2><FileText size={18} /> Deployment Gate</h2><Badge tone={gateTone(gate)}>{gate?.state ?? "INCOMPLETE"}</Badge></div>
          <p className="gate__note">{gate ? gate.allowed ? "The exact current candidate matches the verified run and satisfies the deployment policy." : gate.reasons.join("; ") : "Run a verification before evaluating the deployment gate."}</p>
          {gate && <>
            <div className="gate__row"><span><Fingerprint size={15} /> Current candidate hash</span><span className="gate__val mono">{gate.candidateHash ? `${gate.candidateHash.slice(0, 16)}…` : "unavailable"}</span></div>
            <div className="gate__row"><span><Fingerprint size={15} /> Verified candidate hash</span><span className="gate__val mono">{gate.verifiedCandidateHash ? `${gate.verifiedCandidateHash.slice(0, 16)}…` : "none"}</span></div>
            <div className="gate__row"><span><Package size={15} /> Integrity pack</span><span className="gate__val mono">{gate.integrityPack}</span></div>
            <div className="gate__row"><span><ShieldCheck size={15} /> Verification</span><span className="gate__val mono">{gate.verificationRunId}</span></div>
          </>}
        </div>
      </div>

      <div className="g2 stack">
        <div className="panel">
          <div className="panel__h"><h2><AlertTriangle size={18} style={{ color: "var(--warning)" }} /> Latest Evidence</h2><span className="panel__link" onClick={() => onNavigate("runs")}>View Full Evidence <ArrowRight size={14} /></span></div>
          {divergence ? <div className="fd__grid"><div className="fd__item"><div className="k">Block Number</div><div className="v">{divergence.blockNumber}</div></div><div className="fd__item"><div className="k">Event</div><div className="v">{divergence.event}</div></div><div className="fd__item fd__expl"><div className="k">Transaction Hash</div><div className="v mono">{divergence.transactionHash}</div></div><div className="fd__item"><div className="k">Log Index</div><div className="v">{divergence.logIndex}</div></div><div className="fd__item"><div className="k">Violation</div><div className="v"><Badge tone="danger">{divergence.check}</Badge></div></div></div> : <div className="empty"><h2>No divergence in the latest run</h2><p>{latest ? "The latest report did not identify a first divergence." : "Run an audit to generate chain-vs-index evidence."}</p></div>}
        </div>

        <div className="panel">
          <div className="panel__h"><h2><ScrollText size={18} /> Machine-readable Trust</h2><span className="panel__link" onClick={copyManifest}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Manifest</>}</span></div>
          <div className="dcode">{manifest.split("\n").map((line, i) => <div key={i}><span className="ln">{i + 1}</span>{colorize(line)}</div>)}</div>
        </div>
      </div>

      <div className="g3">
        <div className="panel"><div className="panel__h"><h2><ShieldCheck size={18} /> Recent Verification Runs</h2><span className="panel__link" onClick={() => onNavigate("runs")}>View All <ArrowRight size={14} /></span></div>{snapshot.runs.length ? <table className="dtable"><thead><tr><th>Run</th><th>Pack</th><th>Verdict</th><th>Checks</th><th>Updated</th></tr></thead><tbody>{snapshot.runs.slice(0, 5).map((run) => <tr key={run.runId}><td className="mono">{run.runId}</td><td className="mono">{run.integrityPack.id}@{run.integrityPack.version}</td><td><StatusBadge status={run.verdict} /></td><td>{runCoverage(run)}</td><td className="mono">{age(run.createdAt)}</td></tr>)}</tbody></table> : <div className="empty"><p>No persisted runs yet.</p></div>}</div>

        <div className="panel"><div className="panel__h"><h2><AlertTriangle size={18} style={{ color: "var(--danger)" }} /> Failed Verifications</h2><span className="panel__link" onClick={() => onNavigate("runs")}>View All <ArrowRight size={14} /></span></div>{failedRuns.length ? <div className="inc">{failedRuns.slice(0, 4).map((run) => <div className="inc__row" key={run.runId}><span className="inc__dot sev2" /><div className="inc__body"><div className="inc__title">{run.report.firstDivergence?.check ?? "Verification failed"}</div><div className="inc__meta">{run.runId} · {age(run.createdAt)}</div></div><Badge tone="danger">FAILED</Badge></div>)}</div> : <div className="empty"><p>No failed verifications recorded.</p></div>}</div>

        <div className="panel"><div className="panel__h"><h2><Rocket size={18} /> Monitoring</h2><Badge tone="success">API healthy</Badge></div><div className="mon__row healthy"><span className="dot" /><span className="lbl">Lute API</span><span className="st">Healthy</span><span className="val">{snapshot.status}</span></div><div className="mon__row healthy"><span className="dot" /><span className="lbl">Integrity-pack catalog</span><span className="st">Ready</span><span className="val">{snapshot.packs.length} pack(s)</span></div><div className="mon__row healthy"><span className="dot" /><span className="lbl">Persisted evidence</span><span className="st">Available</span><span className="val">{snapshot.stats.totalRuns} run(s)</span></div></div>
      </div>
    </>
  );
}

function colorize(line: string) {
  const m = line.match(/^(\s*)("[^"]+":\s*)?(.*)$/);
  if (!m) return line;
  const [, indent, key, rest] = m;
  return <>{indent}{key && <span className="k">{key}</span>}<span className={/^\d/.test(rest ?? "") ? "n" : /^"/.test(rest ?? "") ? "s" : ""}>{rest}</span></>;
}
