import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDeploymentPlan, executeDeploymentPlan } from "../src/deploy.js";

test("deployment plan builds before create/deploy and never carries credentials", () => {
  const plan = buildDeploymentPlan({
    graphCommand: "graph",
    node: "http://localhost:8020",
    ipfs: "http://localhost:5001",
    name: "lute/steak-honest",
    manifest: "subgraph.yaml",
    versionLabel: "lute-run-1",
  });

  assert.deepEqual(plan.map((step) => step.purpose), ["codegen", "build", "create", "deploy"]);
  assert.equal(plan[3]?.args.at(-1), "subgraph.yaml");
  assert.ok(plan.every((step) => !step.args.some((arg) => /private|secret|key|token/i.test(arg))));
});

test("deployment executor skips only an already-existing Graph Node name", async () => {
  const calls: string[] = [];
  const plan = buildDeploymentPlan({
    graphCommand: "graph",
    node: "http://localhost:8020",
    ipfs: "http://localhost:5001",
    name: "lute/steak-honest",
    manifest: "subgraph.yaml",
    versionLabel: "lute-run-1",
  });
  const results = await executeDeploymentPlan(plan, "C:/candidate", async (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (args[0] === "create") throw Object.assign(new Error("already exists"), { stderr: "subgraph already exists" });
    return { stdout: "ok", stderr: "" };
  });

  assert.equal(calls.length, 4);
  assert.equal(results[2]?.skipped, true);
  assert.equal(results[3]?.purpose, "deploy");
});

test("deployment executor does not hide unrelated create failures", async () => {
  const plan = buildDeploymentPlan({
    graphCommand: "graph",
    node: "http://localhost:8020",
    ipfs: "http://localhost:5001",
    name: "lute/steak-honest",
    manifest: "subgraph.yaml",
    versionLabel: "lute-run-1",
  });

  await assert.rejects(
    executeDeploymentPlan(plan, "C:/candidate", async (_command, args) => {
      if (args[0] === "create") throw Object.assign(new Error("connection refused"), { stderr: "connection refused" });
      return { stdout: "ok", stderr: "" };
    }),
    /connection refused/,
  );
});
