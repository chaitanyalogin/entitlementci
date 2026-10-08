export type FailureMode = "observe_only" | "fail_open" | "fail_closed";
export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  failureMode?: FailureMode;
  retries?: number;
}
export interface DecisionInput {
  customerId: string;
  feature: string;
  allowed: boolean;
  plan?: string;
  limit?: number;
  used?: number;
  metadata?: Record<string, unknown>;
  requestId?: string;
}
export interface UsageInput {
  customerId: string;
  feature: string;
  used: number;
  limit?: number;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export class EntitlementCIError extends Error {
  status?: number;
  code?: string;
  requestId?: string;
  constructor(
    message: string,
    init?: { status?: number; code?: string; requestId?: string },
  ) {
    super(message);
    this.name = "EntitlementCIError";
    this.status = init?.status;
    this.code = init?.code;
    this.requestId = init?.requestId;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function backoff(attempt: number) {
  return (
    Math.min(1000 * Math.pow(2, attempt), 5000) +
    Math.floor(Math.random() * 100)
  );
}

export class EntitlementCI {
  private readonly opts: Required<Omit<ClientOptions, "apiKey" | "baseUrl">> &
    Pick<ClientOptions, "apiKey" | "baseUrl">;
  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error("apiKey is required");
    if (!options.baseUrl) throw new Error("baseUrl is required");
    this.opts = {
      timeoutMs: options.timeoutMs ?? 1500,
      failureMode: options.failureMode ?? "observe_only",
      retries: options.retries ?? 0,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl.replace(/\/$/, ""),
    };
  }
  private async request(path: string, body: unknown): Promise<any> {
    let last: unknown;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const requestId =
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        const res = await fetch(`${this.opts.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.opts.apiKey}`,
            "x-request-id": requestId,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new EntitlementCIError(
            data?.error?.message ?? `HTTP ${res.status}`,
            {
              status: res.status,
              code: data?.error?.code,
              requestId: data?.error?.requestId,
            },
          );
        }
        return data;
      } catch (error) {
        last = error;
        if (
          attempt < this.opts.retries &&
          (!(error instanceof EntitlementCIError) ||
            error.status === 429 ||
            !error.status ||
            error.status >= 500)
        ) {
          await sleep(backoff(attempt));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw last instanceof Error
      ? last
      : new Error("EntitlementCI request failed");
  }
  private async safe(path: string, body: unknown) {
    try {
      return await this.request(path, body);
    } catch (error) {
      if (this.opts.failureMode === "fail_closed") throw error;
      if (this.opts.failureMode === "observe_only")
        return { accepted: false, degraded: true };
      return { accepted: false, degraded: true };
    }
  }
  async recordDecision(input: DecisionInput) {
    return this.safe("/v1/decisions", input);
  }
  async recordUsage(input: UsageInput) {
    return this.safe("/v1/usage", input);
  }
  async identifyCustomer(input: {
    customerId: string;
    emailHash?: string;
    plan?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.safe("/v1/customers/identify", input);
  }
}
