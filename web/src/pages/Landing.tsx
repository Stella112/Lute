import { motion, useReducedMotion } from "framer-motion";
import {
  Code2, ShieldCheck, Wrench, Rocket, FileText, Boxes, Share2, Activity,
  Check, Hexagon, Network, Plug, Layers, Copy, Play, ArrowRight,
} from "lucide-react";
import { Nav } from "../components/landing/Nav";
import { Logo } from "../components/Logo";
import { Button, Container, Eyebrow, Badge } from "../components/ui";
import { VerificationLine } from "../components/VerificationLine";
import { demo } from "../lib/api";

const reveal = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }),
};

function Section({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) {
  return <section id={id} className={`section ${className}`}><Container>{children}</Container></section>;
}

/* ---------------- hero ---------------- */
function Hero() {
  const reduce = useReducedMotion();
  const words = ["Build.", "Verify.", "Repair.", "Deploy."];
  return (
    <Section id="top" className="hero">
      <div className="hero__grid">
        <div className="hero__copy">
          <Eyebrow>Trusted data. Stronger networks.</Eyebrow>
          <h1 className="hero__title">
            {words.map((w, i) => (
              <motion.span
                key={w}
                initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: reduce ? 0 : 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="hero__word"
              >
                {w}{i === 1 ? <br /> : " "}
              </motion.span>
            ))}
          </h1>
          <p className="hero__sub">
            Lute is the AI-native CI/CD and integrity layer for The Graph. We help teams ship
            verifiable, reliable, and resilient subgraphs with evidence-based trust.
          </p>
          <div className="hero__cta">
            <Button to="/app" size="lg" icon>Start Audit</Button>
            <Button href="#audit" variant="secondary" size="lg"><Play size={15} /> View Live Demo</Button>
          </div>
          <ul className="hero__checks">
            {["Open-source friendly", "Works with your stack", "Built for The Graph"].map((c) => (
              <li key={c}><Check size={15} strokeWidth={3} /> {c}</li>
            ))}
          </ul>
        </div>

        <motion.div
          className="hero__preview"
          initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="glow" aria-hidden="true" />
          <ProductPreview />
        </motion.div>
      </div>
    </Section>
  );
}

function Donut({ value = 100 }: { value?: number }) {
  const r = 42, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return (
    <svg viewBox="0 0 100 100" className="donut" role="img" aria-label={`Integrity score ${value}%`}>
      <circle cx="50" cy="50" r={r} className="donut__bg" />
      <motion.circle cx="50" cy="50" r={r} className="donut__fg"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: off }}
        viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      <text x="50" y="54" className="donut__label">{value}%</text>
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className="preview">
      <div className="preview__bar">
        <span className="preview__dots"><i /><i /><i /></span>
        <span className="preview__search">Search…</span>
      </div>
      <div className="preview__body">
        <div className="preview__head">
          <div>
            <div className="preview__muted">Project</div>
            <div className="preview__title">edge-market-subgraph <Badge tone="success">Verified</Badge></div>
          </div>
          <span className="preview__deploy">Deploy</span>
        </div>
        <div className="preview__panels">
          <div className="preview__panel">
            <div className="preview__panel-h">Verification Pipeline</div>
            <VerificationLine stages={demo.pipeline()} animate />
          </div>
          <div className="preview__panel preview__panel--score">
            <div className="preview__panel-h">Integrity Score</div>
            <Donut value={100} />
            <ul className="preview__score-list">
              {["Schema valid", "Mappings verified", "Data sources reachable", "No critical issues"].map((x) => (
                <li key={x}><Check size={13} strokeWidth={3} /> {x}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="preview__banner">
          <Check size={16} strokeWidth={3} />
          <div><b>This subgraph is ready to deploy</b><span>All verification checks have passed. View evidence for full details.</span></div>
          <span className="preview__evidence">View Evidence <ArrowRight size={14} /></span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ecosystem ---------------- */
const ECO = [
  { name: "The Graph", icon: Network }, { name: "Hedera", icon: Hexagon },
  { name: "Bazantic", icon: Boxes }, { name: "MCP", icon: Plug }, { name: "Substreams", icon: Layers },
];
function Ecosystem() {
  return (
    <Section id="ecosystem" className="eco">
      <p className="eco__label">Built for an open ecosystem</p>
      <div className="eco__row">
        {ECO.map((e) => (
          <div key={e.name} className="eco__item"><e.icon size={20} /> <span>{e.name}</span></div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- lifecycle ---------------- */
const LIFECYCLE = [
  { icon: Code2, title: "Build", body: "AI-assisted creation of Graph infrastructure with best practices built in." },
  { icon: ShieldCheck, title: "Verify", body: "Independent deterministic reconciliation of code, data, and logic against canonical evidence." },
  { icon: Wrench, title: "Repair", body: "Evidence-driven repair through coding agents — guided or automatic." },
  { icon: Rocket, title: "Deploy", body: "Only the exact verified candidate can pass the deployment gate." },
];
const ASSURANCE = [
  { icon: FileText, title: "External Audit", body: "Audit supported existing Graph infrastructure, even when Lute didn't build it." },
  { icon: Boxes, title: "Integrity Packs", body: "Reusable standardized verification profiles such as ERC-4626 and AMM/LP." },
  { icon: Share2, title: "Evidence Graph", body: "Trace every verdict back to canonical, machine-readable evidence." },
  { icon: Activity, title: "Continuous Monitoring", body: "Detect integrity drift after deployment — before it becomes an incident." },
];

function CardGrid({ items }: { items: { icon: typeof Code2; title: string; body: string }[] }) {
  return (
    <div className="cardgrid">
      {items.map((it, i) => (
        <motion.div key={it.title} className="feature" custom={i} variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
          <span className="feature__icon"><it.icon size={20} /></span>
          <h3>{it.title}</h3>
          <p>{it.body}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------------- workflow ---------------- */
function Workflow() {
  const steps = [
    { n: 1, icon: Code2, title: "Build", body: "Write and iterate with AI." },
    { n: 2, icon: ShieldCheck, title: "Verify", body: "Run automated checks and analysis." },
    { n: 3, icon: Wrench, title: "Repair", body: "Fix issues with AI guidance." },
    { n: 4, icon: Rocket, title: "Deploy", body: "Ship with evidence and monitor." },
  ];
  return (
    <Section id="workflow" className="workflow">
      <Eyebrow>The Lute workflow</Eyebrow>
      <div className="section__head">
        <h2>From idea to impact</h2>
        <p>A continuous loop of higher quality, greater trust, and faster delivery.</p>
      </div>
      <div className="wf">
        {steps.map((s, i) => (
          <div className="wf__item" key={s.n}>
            <motion.div className="wf__card" variants={reveal} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <span className="wf__icon"><s.icon size={18} /></span>
              <span className="wf__n">{s.n}</span>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
            </motion.div>
            {i < steps.length - 1 && <ArrowRight className="wf__arrow" size={18} />}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- trust manifest ---------------- */
const MANIFEST = [
  ['{', ""],
  ['  "name": ', '"edge-market-subgraph",'],
  ['  "version": ', '"1.0.3",'],
  ['  "commit": ', '"3a4f2c1e9d8a7...",'],
  ['  "integrityPack": ', '"erc4626@1",'],
  ['  "verdict": ', '"VERIFIED",'],
  ['  "evidenceRoot": ', '"ipfs://bafy..."'],
  ['}', ""],
];
function TrustManifest() {
  const summary = [
    ["Candidate Hash", "3a4f2c1e9d8a7…"], ["Test Coverage", "96.4%"],
    ["Integrity Score", "100%"], ["Policy Compliance", "Pass"], ["Final Verdict", "Verified"],
  ];
  return (
    <Section id="trust" className="trust">
      <div className="trust__grid">
        <div>
          <Eyebrow>Trust you can see</Eyebrow>
          <h2>Machine-readable Trust</h2>
          <p className="trust__lead">
            Every deployment carries a cryptographic, machine-readable Trust Manifest. Verify
            what's running, why it's trustworthy, and trace it back to canonical evidence.
          </p>
          <Button href="#audit" variant="secondary">Learn about Trust Manifests <ArrowRight size={15} /></Button>
        </div>
        <div className="trust__panels">
          <div className="code trust__code">
            <div className="trust__code-h"><span>trust-manifest.json</span><Badge tone="success">Valid</Badge></div>
            <pre>{MANIFEST.map(([k, v], i) => (
              <div key={i}><span className="ln">{String(i + 1).padStart(2, " ")}</span>  <span className="k">{k}</span><span className="s">{v}</span></div>
            ))}</pre>
          </div>
          <div className="card trust__summary">
            <div className="trust__summary-h">Verification Summary</div>
            {summary.map(([k, v]) => (
              <div className="trust__summary-row" key={k}>
                <span>{k}</span>
                <span className="mono">{v === "Verified" || v === "Pass" ? <Badge tone="success">{v}</Badge> : v}</span>
              </div>
            ))}
            <div className="trust__summary-actions">
              <button className="btn btn--secondary btn--md"><Copy size={14} /> Copy Manifest</button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- final CTA + footer ---------------- */
function FinalCTA() {
  return (
    <Section className="finalcta">
      <Eyebrow>Build a more trusted decentralized future</Eyebrow>
      <h2>Ship Graph infrastructure you can trust.</h2>
      <p>Join teams building a more open, verifiable, and resilient web.</p>
      <div className="finalcta__row">
        <Button to="/app" size="lg" icon>Start Verifying</Button>
        <Button href="#audit" variant="secondary" size="lg">View Demo</Button>
      </div>
    </Section>
  );
}

function Footer() {
  const cols = [
    ["Product", ["Overview", "Integrations", "Docs", "About"]],
    ["Resources", ["Trust Manifest", "Integrity Packs", "Evidence Graph"]],
  ] as const;
  return (
    <footer className="footer">
      <Container>
        <div className="footer__grid">
          <div className="footer__brand"><Logo /><p className="muted">The AI-native CI/CD and integrity layer for The Graph.</p></div>
          {cols.map(([h, links]) => (
            <div key={h} className="footer__col"><h5>{h}</h5>{links.map((l) => <a key={l} href="#top">{l}</a>)}</div>
          ))}
        </div>
        <div className="footer__base">
          <span className="muted">© 2026 Lute. Open ecosystem. Stronger together.</span>
        </div>
      </Container>
    </footer>
  );
}

export default function Landing() {
  return (
    <>
      <Nav />
      <main className="landing">
        <Hero />
        <Ecosystem />
        <Section id="lifecycle">
          <Eyebrow>From code to confidence</Eyebrow>
          <div className="section__head"><h2>A complete integrity lifecycle</h2>
            <p>Lute brings AI-native verification, automated repair, and continuous assurance to your subgraph development workflow.</p></div>
          <CardGrid items={LIFECYCLE} />
        </Section>
        <Section id="assurance">
          <Eyebrow>Why teams use Lute</Eyebrow>
          <div className="section__head"><h2>Built for real-world assurance</h2>
            <p>From independent audits to continuous monitoring, Lute gives teams the tools to build and ship with confidence.</p></div>
          <CardGrid items={ASSURANCE} />
        </Section>
        <Workflow />
        <TrustManifest />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
