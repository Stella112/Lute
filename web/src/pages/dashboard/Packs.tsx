import { Boxes } from "lucide-react";
import { Badge } from "../../components/ui";
import { demo } from "../../lib/api";

const STATUS_TONE = { STABLE: "success", BETA: "info", COMING_SOON: "neutral" } as const;
const STATUS_LABEL = { STABLE: "Stable", BETA: "Beta", COMING_SOON: "Coming soon" } as const;

export function Packs() {
  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Integrity Packs</h1>
          <p>Reusable, standardized verification profiles. Each pack defines the strong and conditional checks, and the fields, that a target is verified against.</p>
        </div>
      </div>

      <div className="packs">
        {demo.packs().map((p) => (
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
              <div className="field"><label>Conditional checks</label></div>
              <div className="pack__checks">
                {p.conditionalChecks.map((c) => <span className="chip" key={c}>{c}</span>)}
              </div>
            </div>

            <div>
              <div className="field"><label>Fields</label></div>
              <div className="pack__checks">
                {p.fields.map((c) => <span className="chip" key={c}>{c}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
