import { useState } from "react";
import { FileSearch, Loader2, Play, GitBranch, AlertTriangle } from "lucide-react";
import { Button, Badge, StatusBadge } from "../../components/ui";
import { runVerification } from "../../lib/api";
import type { AuditReport, WorkflowVerification } from "../../lib/types";

type Status = "idle" | "running" | "done" | "error";

const VERDICT_SAY: Record<string, string> = {
  VERIFIED: "The index matches the chain over this range.",
  FAILED: "The index disagrees with the chain — see the first divergence below.",
  INCONCLUSIVE: "The comparison could not be completed reliably (a data source was unavailable, or the range is too near the head).",
};

export function ExternalAudit() {
  const [contract, setContract] = useState("0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183");
  const [event, setEvent] = useState<"Deposit" | "Withdraw">("Deposit");
  const [fromBlock, setFromBlock] = useState("51115000");
  const [toBlock, setToBlock] = useState("51125000");
  const [subgraph, setSubgraph] = useState("morpho");
  const [status, setStatus] = useState<Status>("idle");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [verification, setVerification] = useState<WorkflowVerification | null>(null);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("running"); setError(""); setReport(null);
    try {
      const r = await runVerification({ contract: contract.trim(), event, fromBlock: fromBlock.trim(), toBlock: toBlock.trim(), subgraph, candidateRef: "current" });
      setVerification(r); setReport(r.run.report); setStatus("done");
    } catch (err) {
      setError((err as Error).message); setStatus("error");
    }
  };

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>External Audit</h1>
          <p>Independently verify existing Graph infrastructure against canonical chain evidence — even when Lute didn't build it.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="panel__h"><h2><FileSearch size={18} /> Audit target</h2><Badge tone="accent">Integrity Pack · erc4626@1</Badge></div>
        <form className="audit-form" onSubmit={submit}>
          <div className="field full">
            <label>Vault contract (Base, ERC-4626)</label>
            <input value={contract} onChange={(e) => setContract(e.target.value)} spellCheck={false} placeholder="0x…" />
          </div>
          <div className="field">
            <label>Event</label>
            <select value={event} onChange={(e) => setEvent(e.target.value as "Deposit" | "Withdraw")}>
              <option value="Deposit">Deposit</option>
              <option value="Withdraw">Withdraw</option>
            </select>
          </div>
          <div className="field">
            <label>Index source (candidate)</label>
            <select value={subgraph} onChange={(e) => setSubgraph(e.target.value)}>
              <option value="morpho">Morpho — public index (real)</option>
              <option value="graphnode:lute/steak-honest">Graph Node — honest subgraph</option>
              <option value="graphnode:lute/steak-bugged">Graph Node — bugged subgraph</option>
              <option value="local:none">Local mapping — faithful</option>
              <option value="local:block-id">Local mapping — planted bug</option>
            </select>
          </div>
          <div className="field"><label>From block</label><input value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} /></div>
          <div className="field"><label>To block</label><input value={toBlock} onChange={(e) => setToBlock(e.target.value)} />
            <div className="hint">Use a historical range, well behind the chain head.</div>
          </div>
          <div className="field full">
            <Button type="submit">{status === "running" ? <><Loader2 size={16} className="spin" /> Running audit…</> : <><Play size={15} /> Run Audit</>}</Button>
          </div>
        </form>
      </div>

      {status === "running" && (
        <div className="panel"><div className="empty">
          <span className="empty__icon"><Loader2 size={24} className="spin" /></span>
          <h2>Reconciling against canonical evidence</h2>
          <p>Reading raw chain logs, querying the index, and comparing every event. This runs the real Lute reconciler and takes a few seconds.</p>
        </div></div>
      )}

      {status === "error" && (
        <div className="panel"><div className="empty">
          <span className="empty__icon" style={{ color: "var(--danger)" }}><AlertTriangle size={24} /></span>
          <h2>Audit could not run</h2>
          <p>{error}</p>
          <p className="hint" style={{ marginTop: 12 }}>The reconciler backend must be running (npm run dashboard on :8788). This is expected if only the frontend dev server is up.</p>
        </div></div>
      )}

      {status === "done" && report && <><div className="panel" style={{ marginBottom: "var(--sp-4)" }}><div className="kvrow"><span>Persisted VerificationRun</span><span className="mono">{verification?.run.runId}</span></div><div className="kvrow"><span>Candidate hash</span><span className="mono">{verification?.run.candidateHash}</span></div><p className="hint">This result is saved in Verification Runs and is now eligible for repair/gate evaluation.</p></div><AuditResult report={report} /></>}
    </>
  );
}

function AuditResult({ report: r }: { report: AuditReport }) {
  return (
    <>
      <div className="panel" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="audit-result__verdict">
          <span className={`vbadge v-${r.verdict}`}><span className="dot" />{r.verdict}</span>
          <span className="muted">{VERDICT_SAY[r.verdict]}</span>
        </div>
        {r.inconclusiveReason && <p className="muted" style={{ marginTop: -4 }}>{r.inconclusiveReason}</p>}
        <div className="audit-counts">
          <div className="audit-count"><b>{r.rawEvidence?.eventCount ?? "—"}</b><small>Lute · from raw chain</small></div>
          <div className="audit-count"><b>{r.subgraphEvidence?.recordCount ?? "—"}</b><small>Index · reported</small></div>
          <div className="audit-count"><b>{r.eventsChecked}</b><small>events cross-checked</small></div>
        </div>
      </div>

      {r.firstDivergence && (
        <div className="panel" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="panel__h"><h2><AlertTriangle size={18} style={{ color: "var(--danger)" }} /> First Divergence</h2><Badge tone="danger">{r.firstDivergence.check}</Badge></div>
          <div className="fd__grid">
            <div className="fd__item"><div className="k">Block</div><div className="v">{r.firstDivergence.blockNumber}</div></div>
            <div className="fd__item"><div className="k">Log Index</div><div className="v">{r.firstDivergence.logIndex}</div></div>
            <div className="fd__item fd__expl"><div className="k">Transaction</div><div className="v">{r.firstDivergence.transactionHash}</div></div>
            <div className="fd__item"><div className="k">On chain (truth)</div><div className="v">{r.firstDivergence.raw ? JSON.stringify(r.firstDivergence.raw) : "(present)"}</div></div>
            <div className="fd__item"><div className="k">In the index</div><div className="v">{r.firstDivergence.indexed ? JSON.stringify(r.firstDivergence.indexed) : "(missing)"}</div></div>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="panel__h"><h2><GitBranch size={18} /> Checks</h2></div>
        <table className="dtable checks-table">
          <thead><tr><th>Check</th><th>Class</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            {r.checks.map((c) => (
              <tr key={c.name}>
                <td className="mono">{c.name}</td>
                <td><span className="cls">{c.class}</span></td>
                <td><StatusBadge status={c.status} /></td>
                <td className="muted">{c.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel__h"><h2>Evidence &amp; provenance</h2></div>
        <div className="kvrow"><span>Network / contract</span><span className="mono">{r.target.network} · {r.target.contract}</span></div>
        <div className="kvrow"><span>Range</span><span className="mono">{r.range.startBlock} → {r.range.endBlock} (safe head {r.range.safeHead})</span></div>
        {r.rawEvidence && <div className="kvrow"><span>Raw source</span><span className="mono">{r.rawEvidence.rpcAlias} · topic0 {r.rawEvidence.topic0.slice(0, 14)}… · {r.rawEvidence.chunkCount} chunk(s)</span></div>}
        {r.subgraphEvidence && <div className="kvrow"><span>Index source</span><span className="mono">{r.subgraphEvidence.endpoint} · {r.subgraphEvidence.entity} · {r.subgraphEvidence.pageCount} page(s)</span></div>}
        <div className="kvrow"><span>Run id</span><span className="mono">{r.runId}</span></div>
      </div>
    </>
  );
}
