import { useState } from "react";
import {
  Boxes, AlertTriangle, ShieldCheck, Clock, TrendingUp, Rocket, FileText, Copy, Check,
  Package, Percent, ScrollText, BadgeCheck, ArrowRight, Fingerprint,
} from "lucide-react";
import { Badge, StatusBadge } from "../../components/ui";
import { VerificationLine } from "../../components/VerificationLine";
import { demo } from "../../lib/api";

const STAT_ICON: Record<string, typeof Boxes> = {
  verified: Boxes, incidents: AlertTriangle, integrity: ShieldCheck, last: Clock,
};

export function Overview({ onNavigate }: { onNavigate: (section: string) => void }) {
  const stats = demo.stats();
  const gate = demo.gate();
  const div = demo.divergence();
  const manifest = demo.manifest();
  const [copied, setCopied] = useState(false);

  const copyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifest.json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard may be unavailable */ }
  };

  return (
    <>
      <div className="demo-notice" role="status">
        <strong>Product preview data</strong>
        <span>Overview cards and history are sample UI fixtures. Run External Audit for live-backed results.</span>
      </div>
      <div className="dash-head">
        <div>
          <h1>Overview</h1>
          <p>Your trust and deployment control center for Graph infrastructure.</p>
        </div>
        <div className="dash-head__tag">Trusted data. Stronger networks.<br />Build. Verify. Repair. Deploy.</div>
      </div>

      {/* stat cards */}
      <div className="stats">
        {stats.map((s) => {
          const Icon = STAT_ICON[s.key] ?? Boxes;
          const danger = s.key === "incidents";
          return (
            <div className="stat" key={s.key}>
              <div className="stat__top">
                <span className={`stat__icon ${danger ? "is-danger" : "is-accent"}`}><Icon size={20} /></span>
              </div>
              <div className="stat__label">{s.label}</div>
              <div className="stat__value">{s.value}</div>
              <div className={`stat__foot ${s.tone}`}>
                {s.tone === "up" && <TrendingUp size={13} />}
                {s.tone === "warn" && <AlertTriangle size={13} />}
                {s.tone === "muted" && <BadgeCheck size={13} />}
                {s.delta}
              </div>
            </div>
          );
        })}
      </div>

      {/* run + gate */}
      <div className="g2 stack">
        <div className="panel run">
          <div className="panel__h">
            <h2><ShieldCheck size={18} /> Current Verification Run</h2>
            <span className="panel__link" onClick={() => onNavigate("runs")}>View Details <ArrowRight size={14} /></span>
          </div>
          <p className="run__desc">Automated verification and repair pipeline for edge-market-subgraph.</p>
          <VerificationLine stages={demo.pipeline()} animate />
        </div>

        <div className="panel">
          <div className="panel__h">
            <h2><FileText size={18} /> Deployment Gate</h2>
            <Badge tone="success"><Check size={13} strokeWidth={3} /> Deployment Allowed</Badge>
          </div>
          <p className="gate__note">Deployment is allowed because the verified hash matches the candidate and all policy checks pass.</p>
          <div className="gate__row"><span><Fingerprint size={15} /> Candidate Hash</span><span className="gate__val mono">{gate.candidateHash}</span></div>
          <div className="gate__row"><span><Package size={15} /> Integrity Pack</span><span className="gate__val mono">{gate.integrityPack}</span></div>
          <div className="gate__row"><span><Percent size={15} /> Test Coverage</span><span className="gate__val">{gate.testCoverage}</span></div>
          <div className="gate__row"><span><ShieldCheck size={15} /> Policy Compliance</span><Badge tone="success">{gate.policyCompliance}</Badge></div>
          <div className="gate__row"><span><BadgeCheck size={15} /> Final Verdict</span><StatusBadge status={gate.finalVerdict} /></div>
        </div>
      </div>

      {/* divergence + manifest */}
      <div className="g2 stack">
        <div className="panel">
          <div className="panel__h">
            <h2><AlertTriangle size={18} style={{ color: "var(--warning)" }} /> First Divergence / Evidence</h2>
            <span className="panel__link" onClick={() => onNavigate("runs")}>View Full Evidence <ArrowRight size={14} /></span>
          </div>
          <div className="fd__grid">
            <div className="fd__item"><div className="k">Block Number</div><div className="v">{div.block}</div></div>
            <div className="fd__item"><div className="k">Expected Event</div><div className="v">{div.expected}</div></div>
            <div className="fd__item"><div className="k">Transaction Hash</div><div className="v">{div.tx}</div></div>
            <div className="fd__item"><div className="k">Indexed Event</div><div className="v">{div.indexed}</div></div>
            <div className="fd__item"><div className="k">Log Index</div><div className="v">{div.log}</div></div>
            <div className="fd__item"><div className="k">Violation</div><div className="v"><Badge tone="danger">{div.violation}</Badge></div></div>
            <div className="fd__item fd__expl"><div className="k">Explanation</div><div className="v">{div.explanation}</div></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__h">
            <h2><ScrollText size={18} /> Machine-readable Trust</h2>
            <span className="panel__link" onClick={copyManifest}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Manifest</>}</span>
          </div>
          <div className="dcode">
            {manifest.json.split("\n").map((line, i) => (
              <div key={i}><span className="ln">{i + 1}</span>{colorize(line)}</div>
            ))}
          </div>
        </div>
      </div>

      {/* recent runs + incidents + monitoring */}
      <div className="g3">
        <div className="panel">
          <div className="panel__h"><h2><ShieldCheck size={18} /> Recent Verification Runs</h2><span className="panel__link" onClick={() => onNavigate("runs")}>View All <ArrowRight size={14} /></span></div>
          <table className="dtable">
            <thead><tr><th>Project</th><th>Pack</th><th>Verdict</th><th>Coverage</th><th>Updated</th></tr></thead>
            <tbody>
              {demo.recentRuns().map((r) => (
                <tr key={r.project}>
                  <td>{r.project}</td>
                  <td className="mono">{r.pack}</td>
                  <td><StatusBadge status={r.verdict} /></td>
                  <td>{r.coverage}</td>
                  <td className="mono">{r.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel__h"><h2><AlertTriangle size={18} style={{ color: "var(--danger)" }} /> Open Incidents</h2><span className="panel__link" onClick={() => onNavigate("incidents")}>View All <ArrowRight size={14} /></span></div>
          <div className="inc">
            {demo.incidents().map((inc) => (
              <div className="inc__row" key={inc.title}>
                <span className={`inc__dot ${inc.severity.toLowerCase().replace("-", "")}`} />
                <div className="inc__body">
                  <div className="inc__title">{inc.title}</div>
                  <div className="inc__meta">{inc.project} · {inc.age}</div>
                </div>
                <Badge tone={inc.severity === "SEV-3" ? "warning" : "danger"}>{inc.severity}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__h"><h2><Rocket size={18} /> Monitoring</h2><Badge tone="success">All Systems Operational</Badge></div>
          {demo.monitoring().map((m) => (
            <div className={`mon__row ${m.state.toLowerCase()}`} key={m.label}>
              <span className="dot" /><span className="lbl">{m.label}</span>
              <span className="st">{m.state}</span><span className="val">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function colorize(line: string) {
  const m = line.match(/^(\s*)("[^"]+":\s*)?(.*)$/);
  if (!m) return line;
  const [, indent, key, rest] = m;
  return (
    <>
      {indent}
      {key && <span className="k">{key}</span>}
      <span className={/^\d/.test(rest ?? "") ? "n" : /^"/.test(rest ?? "") ? "s" : ""}>{rest}</span>
    </>
  );
}
