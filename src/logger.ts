// Structured logging. Never logs secrets or full RPC URLs (which may embed
// credentials); endpoints are referred to by alias only.

import { randomUUID } from "node:crypto";

export type LogFields = {
  run_id?: string;
  network?: string;
  contract?: string;
  start_block?: string | number;
  end_block?: string | number;
  source?: string;
  stage?: string;
  duration_ms?: number;
  status?: string;
  [k: string]: unknown;
};

export function newRunId(): string {
  return randomUUID();
}

export class Logger {
  constructor(
    private readonly runId: string,
    private readonly enabled = true,
  ) {}

  private emit(level: string, msg: string, fields: LogFields) {
    if (!this.enabled) return;
    const record = { ts: new Date().toISOString(), level, run_id: this.runId, msg, ...fields };
    // structured single-line JSON to stderr, keeps stdout clean for CLI output
    process.stderr.write(JSON.stringify(record) + "\n");
  }

  info(msg: string, fields: LogFields = {}) {
    this.emit("info", msg, fields);
  }
  warn(msg: string, fields: LogFields = {}) {
    this.emit("warn", msg, fields);
  }
  error(msg: string, fields: LogFields = {}) {
    this.emit("error", msg, fields);
  }

  /** time an async stage and log its duration + status */
  async stage<T>(stage: string, fields: LogFields, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const out = await fn();
      this.emit("info", "stage.complete", { ...fields, stage, duration_ms: Date.now() - t0, status: "ok" });
      return out;
    } catch (e) {
      this.emit("error", "stage.failed", {
        ...fields,
        stage,
        duration_ms: Date.now() - t0,
        status: "error",
        err: (e as Error).message,
      });
      throw e;
    }
  }
}
