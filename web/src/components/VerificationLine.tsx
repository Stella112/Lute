// The Verification Line — Lute's recurring visual language for Build → Verify → Repair
// → Deploy. Green progress travels through completed stages; a failed stage stops the
// line. Orientation adapts (horizontal on wide, vertical when stacked).

import { Check, X, Loader2, Lock, Minus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { VerificationStage, StageState } from "../lib/types";

const ICON: Record<StageState, JSX.Element> = {
  PASSED: <Check size={15} strokeWidth={3} />,
  RUNNING: <Loader2 size={15} strokeWidth={3} className="spin" />,
  FAILED: <X size={15} strokeWidth={3} />,
  BLOCKED: <Lock size={13} strokeWidth={2.6} />,
  WAITING: <Minus size={13} strokeWidth={2.6} />,
  SKIPPED: <Minus size={13} strokeWidth={2.6} />,
};

function stateClass(s: StageState) {
  if (s === "PASSED") return "vl-node--pass";
  if (s === "RUNNING") return "vl-node--run";
  if (s === "FAILED") return "vl-node--fail";
  if (s === "BLOCKED") return "vl-node--block";
  return "vl-node--wait";
}

export function VerificationLine({ stages, animate = true }: { stages: VerificationStage[]; animate?: boolean }) {
  const reduce = useReducedMotion();
  const lastDone = stages.reduce((acc, s, i) => (s.state === "PASSED" ? i : acc), -1);
  const progress = stages.length > 1 ? Math.max(0, lastDone) / (stages.length - 1) : 0;

  return (
    <div className="vl">
      <div className="vl-track">
        <motion.div
          className="vl-track__fill"
          initial={{ scaleX: animate && !reduce ? 0 : progress }}
          animate={{ scaleX: progress }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </div>
      <ol className="vl-nodes">
        {stages.map((s, i) => (
          <motion.li
            key={s.key}
            className="vl-node"
            initial={{ opacity: animate && !reduce ? 0 : 1, y: animate && !reduce ? 8 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={`vl-node__dot ${stateClass(s.state)}`}>{ICON[s.state]}</span>
            <span className="vl-node__body">
              <span className="vl-node__label">{s.label}</span>
              <span className={`vl-node__state ${stateClass(s.state)}`}>
                {s.state === "PASSED" ? "Completed" : s.state === "RUNNING" ? "Running" : s.state === "BLOCKED" ? "Blocked" : s.state === "FAILED" ? "Failed" : "Waiting"}
                {s.timing ? ` · ${s.timing}` : ""}
              </span>
              {s.detail && <span className="vl-node__detail">{s.detail}</span>}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
