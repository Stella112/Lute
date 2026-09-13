#!/usr/bin/env node

// Public, no-secrets smoke test for judges and reviewers. This exercises only the
// read-only health/metadata surfaces by default; --audit adds one free live audit.

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base-url");
const suppliedBaseUrl = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
const baseUrl = (suppliedBaseUrl ?? process.env.LUTE_BASE_URL ?? "https://uselute.xyz").replace(/\/$/, "");
const runAudit = args.includes("--audit");

if (!baseUrl || baseUrl.startsWith("--")) {
  console.error("usage: node scripts/judge-smoke.mjs [--base-url https://uselute.xyz] [--audit]");
  process.exit(2);
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { accept: "application/json" } });
  let body = null;
  try { body = await response.json(); } catch { /* status is reported below */ }
  return { path, status: response.status, body };
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  return { path, status: response.status, body: await response.json() };
}

const checks = [];
for (const path of ["/v1/health", "/openapi.json", "/v1/integrity-packs/erc4626@1", "/api/events"]) {
  try { checks.push(await get(path)); } catch (error) { checks.push({ path, status: 0, error: String(error) }); }
}

let audit = null;
if (runAudit) {
  try {
    audit = await post("/v1/audits", {
      contract: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
      event: "Deposit",
      fromBlock: 51115000,
      toBlock: 51125000,
      subgraph: "morpho",
    });
  } catch (error) { audit = { path: "/v1/audits", status: 0, error: String(error) }; }
}

const metadataOk = checks.every((check) => check.status === 200);
const auditOk = !audit || (audit.status === 200 && audit.body?.verdict === "VERIFIED");
const result = {
  ok: metadataOk && auditOk,
  baseUrl,
  checks: checks.map(({ path, status }) => ({ path, status })),
  ...(audit ? { audit: { status: audit.status, verdict: audit.body?.verdict ?? null, eventsChecked: audit.body?.eventsChecked ?? null, evidenceRoot: audit.body?.evidenceRoot ?? null } } : {}),
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
