import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DeploymentCommand = {
  purpose: "codegen" | "build" | "create" | "deploy";
  command: string;
  args: string[];
  /** Graph Node returns a non-zero status when the name already exists. */
  allowAlreadyExists?: boolean;
};

export type DeploymentPlanInput = {
  graphCommand: string;
  node: string;
  ipfs: string;
  name: string;
  manifest: string;
  versionLabel: string;
};

export type DeploymentCommandResult = DeploymentCommand & {
  stdout: string;
  stderr: string;
  skipped?: boolean;
};

export function buildDeploymentPlan(input: DeploymentPlanInput): DeploymentCommand[] {
  return [
    { purpose: "codegen", command: input.graphCommand, args: ["codegen", input.manifest] },
    { purpose: "build", command: input.graphCommand, args: ["build", input.manifest] },
    {
      purpose: "create",
      command: input.graphCommand,
      args: ["create", "--node", input.node, input.name],
      allowAlreadyExists: true,
    },
    {
      purpose: "deploy",
      command: input.graphCommand,
      args: ["deploy", "--node", input.node, "--ipfs", input.ipfs, "--version-label", input.versionLabel, input.name, input.manifest],
    },
  ];
}

export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;

export const runCommand: CommandRunner = async (command, args, cwd) => {
  const result = await execFileAsync(command, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

function alreadyExists(error: unknown): boolean {
  const e = error as { stdout?: string; stderr?: string; message?: string };
  return /already exists|already been created|duplicate/i.test(`${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`);
}

export async function executeDeploymentPlan(
  plan: DeploymentCommand[],
  cwd: string,
  runner: CommandRunner = runCommand,
): Promise<DeploymentCommandResult[]> {
  const results: DeploymentCommandResult[] = [];
  for (const step of plan) {
    try {
      const result = await runner(step.command, step.args, cwd);
      results.push({ ...step, ...result });
    } catch (error) {
      if (step.allowAlreadyExists && alreadyExists(error)) {
        const e = error as { stdout?: string; stderr?: string };
        results.push({ ...step, stdout: e.stdout ?? "", stderr: e.stderr ?? "", skipped: true });
        continue;
      }
      throw error;
    }
  }
  return results;
}
