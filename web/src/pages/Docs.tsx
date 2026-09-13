import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  GitBranch,
  Layers3,
  LockKeyhole,
  Network,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Nav } from "../components/landing/Nav";
import { Button, Container, Eyebrow } from "../components/ui";

type Icon = typeof BookOpen;

function DocSection({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="docs-section">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function InfoCard({ icon: Icon, title, children, className = "" }: { icon: Icon; title: string; children: ReactNode; className?: string }) {
  return (
    <article className={"docs-card " + className}>
      <span className="docs-card__icon"><Icon size={19} /></span>
      <h3>{title}</h3>
      <div className="docs-card__body">{children}</div>
    </article>
  );
}

function NumberedStep({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <article className="docs-numbered-step">
      <span className="docs-numbered-step__number">{number}</span>
      <div><h3>{title}</h3><p>{children}</p></div>
    </article>
  );
}

function LinkArrow({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) {
  return <a className="docs-link" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{children} {external ? <ExternalLink size={14} /> : <ArrowRight size={14} />}</a>;
}

function ArchitectureDiagram() {
  return (
    <div className="docs-architecture" aria-label="Lute architecture diagram">
      <div className="docs-architecture__column">
        <div className="docs-architecture__label">Source of truth</div>
        <div className="docs-architecture__node docs-architecture__node--chain"><Database size={20} /><span><b>Blockchain</b><small>Events recorded on Base</small></span></div>
        <div className="docs-architecture__line" aria-hidden="true"><span>read directly</span><ArrowRight size={17} /></div>
        <div className="docs-architecture__node"><ShieldCheck size={20} /><span><b>Lute verifier</b><small>Builds an independent expectation</small></span></div>
      </div>
      <div className="docs-architecture__compare">
        <div className="docs-architecture__compare-ring"><CheckCircle2 size={26} /></div>
        <span>compare</span>
      </div>
      <div className="docs-architecture__column">
        <div className="docs-architecture__label">Reported data</div>
        <div className="docs-architecture__node docs-architecture__node--candidate"><GitBranch size={20} /><span><b>Subgraph / indexer</b><small>Fast data people query</small></span></div>
        <div className="docs-architecture__line" aria-hidden="true"><span>query</span><ArrowRight size={17} /></div>
        <div className="docs-architecture__node"><FileCheck2 size={20} /><span><b>Candidate records</b><small>What the index says happened</small></span></div>
      </div>
      <div className="docs-architecture__result">
        <div className="docs-architecture__result-icon"><FileText size={19} /></div>
        <div><b>Evidence-backed result</b><small>VERIFIED, FAILED, or INCONCLUSIVE</small></div>
      </div>
    </div>
  );
}

function DocsHero() {
  return (
    <header className="docs-hero">
      <div className="docs-hero__grid">
        <div>
          <div className="docs-kicker"><BookOpen size={15} /> Lute documentation</div>
          <h1>Make blockchain data easier to trust.</h1>
          <p className="docs-hero__lead">
            Lute is a safety layer for indexed blockchain data. It checks what a subgraph reports against what the chain actually recorded, explains disagreements, and helps teams ship only verified changes.
          </p>
          <div className="docs-hero__actions">
            <Button to="/app" size="lg" icon>Open the dashboard</Button>
            <Button href="#architecture" variant="secondary" size="lg">See how it works</Button>
          </div>
          <div className="docs-hero__trust"><span><Check size={15} /> No wallet needed to explore</span><span><Check size={15} /> Fail-closed results</span><span><Check size={15} /> Evidence you can inspect</span></div>
        </div>
        <div className="docs-hero__card">
          <div className="docs-hero__card-top"><span className="docs-live-dot" /> A simple promise</div>
          <p>“If the index says it happened, Lute should be able to show the matching event on the chain.”</p>
          <div className="docs-hero__card-foot"><ShieldCheck size={17} /><span>Independent verification</span></div>
        </div>
      </div>
    </header>
  );
}

function DocsToc() {
  return (
    <aside className="docs-toc" aria-label="Documentation sections">
      <div className="docs-toc__title">On this page</div>
      <a href="#what-is-lute">What is Lute?</a>
      <a href="#architecture">The architecture</a>
      <a href="#workflow">Build → Verify → Repair → Deploy</a>
      <a href="#dashboard">Using the dashboard</a>
      <a href="#verdicts">Understanding results</a>
      <a href="#evidence">Evidence &amp; Trust Manifests</a>
      <a href="#connections">Connections</a>
      <a href="#mcp">Using Lute with AI</a>
      <a href="#quickstart">Quick start</a>
    </aside>
  );
}

function Connections() {
  return (
    <div className="docs-connection-grid">
      <InfoCard icon={Network} title="Base + RPC"><p>The chain is the reference point. Lute reads canonical Base events directly instead of trusting the index to tell it what to expect.</p></InfoCard>
      <InfoCard icon={GitBranch} title="The Graph"><p>The Graph or Graph Node supplies the candidate data that Lute checks. Lute can audit an existing deployment even when it did not build it.</p></InfoCard>
      <InfoCard icon={Layers3} title="Substreams"><p>Substreams can provide another independent data path for comparison. If the provider is unavailable or its credential is invalid, Lute reports <i>INCONCLUSIVE</i>.</p></InfoCard>
      <InfoCard icon={ShieldCheck} title="Integrity Packs"><p>A pack tells Lute what to check for a supported data shape. The current live pack is ERC-4626 vault events on Base.</p></InfoCard>
      <InfoCard icon={Bot} title="MCP + Bazantic"><p>AI clients can discover and call Lute as tools. The local MCP server exposes the complete workflow; a published gateway can expose selected operations remotely.</p></InfoCard>
      <InfoCard icon={LockKeyhole} title="Hedera x402"><p>The paid verification path uses an exact x402 payment flow. Payment verification happens before settlement, and receipts can be checked on Hedera.</p></InfoCard>
    </div>
  );
}

function DocsFooter() {
  return (
    <footer className="docs-footer">
      <Container>
        <div className="docs-footer__inner">
          <div><span className="docs-footer__mark">L</span><span><b>Lute</b><small>Build trusted data.</small></span></div>
          <div className="docs-footer__links"><LinkArrow href="/app">Dashboard</LinkArrow><LinkArrow href="/openapi.json" external>API reference</LinkArrow><LinkArrow href="https://github.com/Stella112/Lute" external>Source code</LinkArrow></div>
        </div>
      </Container>
    </footer>
  );
}

export default function Docs() {
  return (
    <>
      <Nav />
      <main className="docs-page">
        <DocsHero />
        <Container>
          <div className="docs-layout">
            <DocsToc />
            <div className="docs-content">
              <DocSection id="what-is-lute" eyebrow="Start here" title="What is Lute?">
                <p className="docs-intro">A subgraph makes blockchain data fast and easy to use. But an index can be out of date, decode an event incorrectly, or silently miss a record. A healthy-looking index is not automatically a correct one.</p>
                <p>Lute is the independent check. It reads the original on-chain events, reads the index separately, and compares the two. The result is designed to be understandable to a person and useful to an automated deployment system.</p>
                <div className="docs-callout docs-callout--green"><CheckCircle2 size={20} /><div><b>The important distinction</b><span>Lute never asks the candidate index to define what “correct” means. The chain supplies the evidence; the index is the thing being checked.</span></div></div>
                <div className="docs-card-grid docs-card-grid--three">
                  <InfoCard icon={ShieldCheck} title="Independent"><p>Raw chain evidence and indexed records are collected through separate paths.</p></InfoCard>
                  <InfoCard icon={Activity} title="Deterministic"><p>The same inputs produce the same candidate hash, checks, and verdict.</p></InfoCard>
                  <InfoCard icon={FileText} title="Explainable"><p>Each run keeps its range, sources, checks, and evidence root for review.</p></InfoCard>
                </div>
              </DocSection>

              <DocSection id="architecture" eyebrow="The mental model" title="Two paths in, one answer out">
                <p>Lute keeps the two sides of the comparison separate. One path asks the blockchain what happened. The other asks the index what it believes happened. Lute then produces evidence and a verdict from the comparison.</p>
                <ArchitectureDiagram />
                <p className="docs-caption">This separation is what prevents a broken index from becoming its own proof.</p>
              </DocSection>

              <DocSection id="workflow" eyebrow="The core loop" title="Build → Verify → Repair → Deploy">
                <p>Every change follows the same safety loop. You can use the dashboard buttons, the REST API, or an AI client connected through MCP.</p>
                <div className="docs-step-list">
                  <NumberedStep number="01" title="Build">Create a candidate from your workflow inputs. Lute records a stable candidate hash so later actions refer to one exact version.</NumberedStep>
                  <NumberedStep number="02" title="Verify">Compare raw chain events with the index over a chosen block range. Checks cover counts, presence, duplicates, provenance, and supported decoded fields.</NumberedStep>
                  <NumberedStep number="03" title="Repair">If a check fails, Lute points to the disagreement. Repair starts as a diagnosis; a known safe fix can be applied only when you explicitly approve it, then the candidate must be verified again.</NumberedStep>
                  <NumberedStep number="04" title="Deploy">Preview the deployment gate and plan first. A real deployment is allowed only for the exact candidate hash that passed verification and the configured policy.</NumberedStep>
                </div>
                <div className="docs-callout docs-callout--amber"><CircleAlert size={20} /><div><b>Deployments are intentionally guarded</b><span>Preview is safe by default. Live deployment requires explicit confirmation and server-side enablement; Lute does not ask you to paste a private key into the dashboard.</span></div></div>
              </DocSection>

              <DocSection id="dashboard" eyebrow="Operator guide" title="Using the dashboard">
                <p className="docs-intro">If you just want to use Lute, start here. You do not need to understand Graph Node, RPC topics, or MCP to run a normal verification.</p>
                <div className="docs-dashboard-flow">
                  <div className="docs-dashboard-flow__items">
                    <NumberedStep number="1" title="Build &amp; Ship">Open <b>Build &amp; Ship</b> in the left navigation, choose the supported workflow, and select <b>Build candidate</b>. You will receive a candidate hash and build id.</NumberedStep>
                    <NumberedStep number="2" title="Run verification">Choose the network, contract, event, and block range, then select <b>Run verification</b>. Lute saves the result as a Verification Run.</NumberedStep>
                    <NumberedStep number="3" title="Read the result">Open <b>Verification Runs</b> for the checks and evidence. A green VERIFIED result means the indexed records matched the raw chain over that range.</NumberedStep>
                    <NumberedStep number="4" title="Repair only when needed">For a failed run, open its details and choose <b>Diagnose repair</b>. Apply a known fix only when the diagnosis matches, then verify the new candidate.</NumberedStep>
                    <NumberedStep number="5" title="Preview, then deploy">Open <b>Deployments</b>, preview the deployment gate, and confirm that the hash, verdict, evidence, and freshness policy all match. Only then use the live deploy action.</NumberedStep>
                    <NumberedStep number="6" title="Keep watching">Use <b>Monitoring</b> to keep a watchlist of supported targets. A later non-verified result becomes an incident you can investigate.</NumberedStep>
                  </div>
                </div>
              </DocSection>

              <DocSection id="verdicts" eyebrow="Read the language" title="Understanding Lute’s results">
                <p>A verdict is not a score hiding uncertainty. It tells you whether Lute had enough evidence to make a specific decision.</p>
                <div className="docs-verdict-grid">
                  <InfoCard icon={CheckCircle2} title="VERIFIED" className="docs-card--success"><p>The raw chain and candidate index agree over the requested range, and the required checks passed.</p></InfoCard>
                  <InfoCard icon={CircleAlert} title="FAILED" className="docs-card--danger"><p>Lute found a real disagreement, such as a missing, extra, duplicate, or incorrectly decoded record. Open the run to find the first divergence.</p></InfoCard>
                  <InfoCard icon={FileText} title="INCONCLUSIVE" className="docs-card--warning"><p>Lute could not safely complete the comparison because a source, credential, range, or infrastructure dependency was unavailable. This is not a pass.</p></InfoCard>
                </div>
                <div className="docs-table-wrap"><table className="docs-table"><thead><tr><th>Check</th><th>Plain-language question</th></tr></thead><tbody>
                  <tr><td>Event count</td><td>Did both sides see the same number of events?</td></tr>
                  <tr><td>Event presence</td><td>Is every chain event represented in the index, with no extras?</td></tr>
                  <tr><td>Duplicate detection</td><td>Did the index accidentally record one event more than once?</td></tr>
                  <tr><td>Transaction / block provenance</td><td>Do the indexed records point to real transactions and blocks?</td></tr>
                  <tr><td>Field accuracy</td><td>Do supported values such as sender, owner, assets, and shares match?</td></tr>
                </tbody></table></div>
              </DocSection>

              <DocSection id="evidence" eyebrow="Proof you can carry" title="Evidence &amp; Trust Manifests">
                <p>A result is more useful when somebody else can inspect why it was produced. Lute persists the important links around each run instead of displaying a bare “pass”.</p>
                <div className="docs-evidence-grid">
                  <div className="docs-evidence-list">
                    {[
                      ["Candidate hash", "Which exact build was checked"],
                      ["Run id", "Which verification produced the result"],
                      ["Range", "Which blocks were covered"],
                      ["Sources", "Where raw and indexed data came from"],
                      ["Evidence root", "A compact reference to the evidence set"],
                    ].map(([label, value]) => <div className="docs-evidence-row" key={label}><Check size={15} /><span><b>{label}</b><small>{value}</small></span></div>)}
                  </div>
                  <div className="docs-manifest"><div className="docs-manifest__head"><FileText size={16} /> integrity-pack.json <span>portable</span></div><pre>{"{\n  \"verdict\": \"VERIFIED\",\n  \"eventsChecked\": 75,\n  \"range\": \"51115000 → 51125000\",\n  \"sourcesComplete\": true,\n  \"evidenceRoot\": \"…\"\n}"}</pre></div>
                </div>
                <p className="docs-caption">A Trust Manifest or Integrity Pack can be reviewed by a teammate, attached to a release, or consumed by an automated gate.</p>
              </DocSection>

              <DocSection id="connections" eyebrow="Where Lute fits" title="Connections, explained simply">
                <p>Lute is an integrity layer. It does not replace the systems that create, index, stream, or pay for data; it connects them with a verifiable decision.</p>
                <Connections />
              </DocSection>

              <DocSection id="mcp" eyebrow="For AI clients" title="Using Lute as an MCP server">
                <p>MCP lets an AI assistant discover Lute’s capabilities as tools. It is a connection method, not a separate copy of Lute and not something a normal dashboard user needs to download.</p>
                <div className="docs-mcp-choices">
                  <InfoCard icon={ShieldCheck} title="1. Use the dashboard"><p>For a normal user or judge, open <a className="docs-inline-link" href="/app">uselute.xyz/app</a>. The website talks to Lute’s API directly. There is no MCP setup and no local process to keep running.</p></InfoCard>
                  <InfoCard icon={Bot} title="2. Use the hosted MCP link"><p>An AI client connects to Bazantic’s hosted endpoint and discovers Lute’s tools remotely. Nothing is installed on the user’s computer.</p><a className="docs-inline-link" href="https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com/mcp" target="_blank" rel="noreferrer">Open the Lute MCP endpoint <ExternalLink size={13} /></a></InfoCard>
                  <InfoCard icon={Terminal} title="3. Run MCP locally"><p>Developers can clone Lute, run <code>npm install</code>, then <code>npm run mcp</code>. Dependencies download once to that computer; the local MCP stops when that computer is shut down.</p></InfoCard>
                </div>
                <div className="docs-mcp-integration">
                  <div className="docs-mcp-integration__title"><Network size={16} /> How the hosted link is integrated</div>
                  <div className="docs-mcp-integration__flow"><span>AI client</span><ArrowRight size={16} /><span>Bazantic MCP gateway</span><ArrowRight size={16} /><span>Lute API on Qevor</span><ArrowRight size={16} /><span>same verifier</span></div>
                  <p>Bazantic reads Lute’s public API description, <a className="docs-inline-link" href="/openapi.json">openapi.json</a>, turns the API operations into MCP tools, and forwards calls to <b>uselute.xyz</b>. The dashboard and MCP therefore reach the same verification engine and produce the same evidence-backed result.</p>
                  <p className="docs-mcp-note">Lute audit MCP: <a href="https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com/mcp" target="_blank" rel="noreferrer">hosted endpoint</a> · Graph provider adapter: <a href="https://ssr3i3ifazfv3llppiubwpuxqe.bazgateway.com/mcp" target="_blank" rel="noreferrer">hosted endpoint</a> · Verify Before Trust Recipe: <code>verify-before-trust-graph-lute</code></p>
                </div>
                <p>The assistant can then follow the same safe sequence as a human operator:</p>
                <div className="docs-mcp-flow"><span>lute_build</span><ArrowRight size={16} /><span>lute_verify</span><ArrowRight size={16} /><span>lute_repair</span><ArrowRight size={16} /><span>lute_deployment_gate</span><ArrowRight size={16} /><span>lute_deploy</span></div>
                <div className="docs-mcp-grid">
                  <div className="docs-code-card"><div className="docs-code-card__title"><Terminal size={16} /> Local MCP is for builders</div><pre>{"npm install\nnpm run mcp"}</pre><p>The local server uses stdio and exposes the complete workflow. It runs wherever the MCP client runs, so it is optional for people using the hosted dashboard.</p></div>
                  <div className="docs-code-card"><div className="docs-code-card__title"><Bot size={16} /> Hosted MCP is for agents</div><p>Remote agents can discover Lute without cloning the repository. Discovery is separate from paid execution when the gateway is configured for x402; a caller uses its own account or approved credit.</p><LinkArrow href="/openapi.json" external>View the public API description</LinkArrow></div>
                </div>
                <div className="docs-callout docs-callout--blue"><LockKeyhole size={20} /><div><b>Credential safety</b><span>MCP tools follow the same guardrails as the dashboard: deploy is gated, uncertain verification is not promoted to a pass, and private keys should stay in the server or wallet that owns them.</span></div></div>
              </DocSection>

              <DocSection id="quickstart" eyebrow="Ready to try it" title="A five-minute quick start">
                <div className="docs-quickstart-grid">
                  <NumberedStep number="1" title="Open Lute">Visit <a className="docs-inline-link" href="https://uselute.xyz">uselute.xyz</a> and select <b>Start Verifying</b>.</NumberedStep>
                  <NumberedStep number="2" title="Build a candidate">Go to <b>Build &amp; Ship</b> and run the supported Base / ERC-4626 build.</NumberedStep>
                  <NumberedStep number="3" title="Verify">Run the audit over a historical block range and wait for the saved Verification Run.</NumberedStep>
                  <NumberedStep number="4" title="Inspect evidence">Open the run details and review the checks, sources, range, and evidence root.</NumberedStep>
                  <NumberedStep number="5" title="Preview the gate">Use <b>Deployments</b> to preview what would be released. Deploy only after the gate is VERIFIED.</NumberedStep>
                </div>
                <div className="docs-final-cta"><div><Eyebrow>Start with the product</Eyebrow><h3>See the workflow, not just the explanation.</h3><p>Run a real audit and open its evidence in the dashboard.</p></div><Button to="/app" size="lg" icon>Open Lute</Button></div>
              </DocSection>
            </div>
          </div>
        </Container>
      </main>
      <DocsFooter />
    </>
  );
}
