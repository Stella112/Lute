import { Boxes } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui";
import { getIntegrityPacks } from "../../lib/api";
import type { IntegrityPack } from "../../lib/types";

const STATUS_TONE = { STABLE: "success", BETA: "info", COMING_SOON: "neutral" } as const;
const STATUS_LABEL = { STABLE: "Stable", BETA: "Beta", COMING_SOON: "Coming soon" } as const;

export function Packs() {
  const [packs, setPacks] = useState<IntegrityPack[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getIntegrityPacks().then(setPacks).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <div className="demo-notice" role="status">
        <strong>Live integrity-pack catalog</strong>
        <span>These are the verification profiles currently exposed by this Lute instance.</span>
      </div>
      <div className="dash-head">
        <div>
          <h1>Integrity Packs</h1>
          <p>Reusable, standardized verification profiles. Each pack defines the strong and conditional checks, and the fields, that a target is verified against.</p>
        </div>
      </div>

      {error && <div className="panel"><div className="empty"><h2>Pack catalog unavailable</h2><p>{error}</p></div></div>}
      {!error && packs.length === 0 && <div className="panel"><div className="empty"><h2>Loading integrity packs…</h2><p>Reading the live catalog from Lute.</p></div></div>}
      <div className="packs">
        {packs.map((p) => (
          <div className="pack" key={p.id}>
            <div className="pack__h">
              <div className="pack__name"><Boxes size={20} /> {p.name} <span className="pack__ver">{p.version}</span></div>
              <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
            </div>
            <p className="pack__meta">{p.standard}</p>

            <div style={{ marginBottom: "var(--sp-4)" }}>
              <div className="field"><label>Strong checks</label></div>
              <div className="pack__checks">
                {p.strongChecks.map((c) => <span className="chip" key={c}>{c}</span>)}
              </div>
            </div>

            <div style={{ marginBottom: "var(--sp-4)" }}>
              <div className="field"><label>Events</label></div>
              <div className="pack__checks">
                {p.events.map((c) => <span className="chip" key={c}>{c}</span>)}
              </div>
            </div>

            <div>
              <div className="field"><label>Unsupported claims</label></div>
              <div className="pack__checks">
                {p.unsupportedClaims.map((c) => <span className="chip" key={c}>{c}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
