import { useState, type ReactNode } from "react";
import { CheckCircle2, Copy, ExternalLink, Hexagon, Plug, Receipt, ShieldCheck } from "lucide-react";
import { Badge, Button } from "../../components/ui";

type IntegrationKind = "hedera" | "bazantic" | "mcp";

const AUDIT_MCP = "https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com/mcp";
const GRAPH_MCP = "https://ssr3i3ifazfv3llppiubwpuxqe.bazgateway.com/mcp";
const API_URL = "https://uselute.xyz/openapi.json";

export function IntegrationPage({ kind }: { kind: IntegrationKind }) {
  if (kind === "hedera") return <HederaPage />;
  if (kind === "bazantic") return <BazanticPage />;
  return <McpPage />;
}

function PageShell({ icon: Icon, eyebrow, title, children }: { icon: typeof Hexagon; eyebrow: string; title: string; children: ReactNode }) {
  return <div className="integration-page"><div className="integration-page__hero"><span className="section-kicker">{eyebrow}</span><h1><Icon size={28} /> {title}</h1><p>Connect Lute to your agent workflow without weakening the evidence boundary.</p></div>{children}</div>;
}

function HederaPage() {
  const stages = ["PAYMENT REQUIRED", "PAYMENT RECEIVED", "VERIFICATION RUNNING", "VERIFIED / FAILED", "ATTESTED"];
  return <PageShell icon={Hexagon} eyebrow="Paid verification" title="Hedera Payments"><div className="panel integration-panel"><div className="panel__h"><h2><Receipt size={18} /> x402 payment lifecycle</h2><Badge tone="info">Testnet integration</Badge></div><p className="muted">A buyer authorizes an exact HBAR payment, Lute verifies the request, runs the same independent verifier, and records an attestation only after acceptance.</p><div className="payment-flow">{stages.map((stage, index) => <div key={stage} className="payment-flow__stage"><span>{String(index + 1).padStart(2, "0")}</span><b>{stage}</b>{index < stages.length - 1 && <span className="payment-flow__arrow">→</span>}</div>)}</div><div className="integration-callout"><ShieldCheck size={18} /><div><strong>Fail closed</strong><span>Payment never makes an unverified result deployable. Settlement receipts are shown only when the facilitator returns a valid transaction.</span></div></div><div className="integration-actions"><a className="button button--secondary" href="https://blocky402.com/" target="_blank" rel="noreferrer">Open Blocky402 <ExternalLink size={14} /></a><a className="button button--ghost" href="https://hedera.com/blog/hedera-and-the-x402-payment-standard/" target="_blank" rel="noreferrer">Read Hedera x402 docs <ExternalLink size={14} /></a></div></div><div className="panel integration-panel"><div className="panel__h"><h2>Payment activity</h2><Badge tone="neutral">Unavailable</Badge></div><p className="muted">The current Lute dashboard API does not expose a payment ledger. No transaction count or settlement receipt is fabricated here.</p></div></PageShell>;
}

function BazanticPage() {
  return <PageShell icon={Plug} eyebrow="Agent distribution" title="Bazantic Recipes"><div className="panel integration-panel"><div className="panel__h"><h2><ShieldCheck size={18} /> Verify Before Trust</h2><Badge tone="success">Gateway live</Badge></div><p className="muted">Bazantic exposes Lute as a hosted MCP gateway so Claude, Cursor, ChatGPT/Codex, or another MCP client can call the service. The gateway routes requests to Lute’s live API; it does not replace the deployment gate.</p><div className="recipe-flow"><span>Agent request</span><b>→</b><span>Bazantic gateway</span><b>→</b><span>Lute build / verify</span><b>→</b><span>Evidence-backed result</span></div><div className="url-card"><span>Hosted gateway MCP endpoint</span><code>{AUDIT_MCP}</code><a href={AUDIT_MCP} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a></div><div className="integration-actions"><a className="button button--secondary" href="https://bazantic.com/dashboard" target="_blank" rel="noreferrer">Open Bazantic <ExternalLink size={14} /></a><a className="button button--ghost" href="/docs" target="_blank" rel="noreferrer">Read Lute docs <ExternalLink size={14} /></a></div></div></PageShell>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? <><CheckCircle2 size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</Button>;
}

function McpPage() {
  return <PageShell icon={Plug} eyebrow="Developer access" title="MCP & API"><div className="panel integration-panel"><div className="panel__h"><h2>Use Lute from an agent</h2><Badge tone="success">Hosted</Badge></div><p className="muted">MCP is the adapter, not a second product. Add one hosted URL to an MCP client and the client can discover Lute’s tools. The dashboard remains the human control plane for evidence, repair, and deployment approval.</p><div className="endpoint-list"><div className="url-card"><span>Lute audit MCP</span><code>{AUDIT_MCP}</code><CopyButton value={AUDIT_MCP} /></div><div className="url-card"><span>The Graph provider adapter</span><code>{GRAPH_MCP}</code><CopyButton value={GRAPH_MCP} /></div><div className="url-card"><span>OpenAPI</span><code>{API_URL}</code><CopyButton value={API_URL} /></div></div></div><div className="panel integration-panel"><div className="panel__h"><h2>Quick start</h2><Badge tone="info">MCP client</Badge></div><pre className="dcode"><code>{`# Claude Code\nclaude mcp add --transport http lute-audit ${AUDIT_MCP}\n\n# API discovery\nGET ${API_URL}\n\n# Human workflow\n1. New Run → describe the build\n2. Review evidence and verifier checks\n3. Repair + reverify if blocked\n4. Deploy only after the gate allows it`}</code></pre><p className="muted">Never put private keys in the repository or in an MCP prompt. Payment and deployment signing stay behind the configured service boundary.</p></div></PageShell>;
}
