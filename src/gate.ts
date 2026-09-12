// Deployment Gate (contract §26).
//
// A deterministic decision that only clears a candidate for deployment when the exact
// candidate that will be deployed is the one that was verified (candidateHash ===
// verifiedCandidateHash), the verdict is VERIFIED, required checks passed, sources were
// complete, the verification is fresh, and it isn't revoked. Fail closed: anything
// unknown/incomplete → not ALLOWED. AI cannot bypass this (Invariants F/G/I).

export type GateState = "ALLOWED" | "BLOCKED" | "STALE" | "REVOKED" | "INCOMPLETE";

export type GateInput = {
  verdict: "VERIFIED" | "FAILED" | "INCONCLUSIVE";
  /** hash of the artifact about to be deployed */
  candidateHash: string;
  /** hash the VerificationRun actually ran against (null = never verified) */
  verifiedCandidateHash: string | null;
  requiredStrongChecksPassed: boolean;
  sourcesComplete: boolean;
  /** false => verification too old for policy; undefined/true => ok */
  freshnessOk?: boolean;
  revoked?: boolean;
};

export type GateDecision = { state: GateState; allowed: boolean; reasons: string[] };

/**
 * Precedence (most disqualifying first): REVOKED → INCOMPLETE (inconclusive / incomplete
 * sources) → BLOCKED (failed / required checks failed / never verified) → STALE (hash
 * mismatch or stale) → ALLOWED.
 */
export function decideGate(i: GateInput): GateDecision {
  if (i.revoked) return { state: "REVOKED", allowed: false, reasons: ["verification has been revoked"] };

  if (i.verdict === "INCONCLUSIVE" || !i.sourcesComplete) {
    return {
      state: "INCOMPLETE",
      allowed: false,
      reasons: [
        i.verdict === "INCONCLUSIVE" ? "verdict is INCONCLUSIVE" : "",
        !i.sourcesComplete ? "one or more required sources were incomplete" : "",
      ].filter(Boolean),
    };
  }

  if (i.verdict === "FAILED") return { state: "BLOCKED", allowed: false, reasons: ["verdict is FAILED"] };
  if (!i.requiredStrongChecksPassed) return { state: "BLOCKED", allowed: false, reasons: ["required strong checks did not all pass"] };
  if (i.verifiedCandidateHash === null) return { state: "BLOCKED", allowed: false, reasons: ["candidate has not been verified"] };

  if (i.candidateHash !== i.verifiedCandidateHash) {
    return {
      state: "STALE",
      allowed: false,
      reasons: [`candidate hash ${i.candidateHash.slice(0, 12)}… does not match the verified hash ${i.verifiedCandidateHash.slice(0, 12)}…`],
    };
  }
  if (i.freshnessOk === false) return { state: "STALE", allowed: false, reasons: ["verification is older than the freshness policy allows"] };

  return { state: "ALLOWED", allowed: true, reasons: ["verified candidate hash matches and all policy checks pass"] };
}
