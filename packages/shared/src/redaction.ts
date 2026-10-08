const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|cookie|card|cvv|cvc|bank|api[_-]?key/i;
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[REDACTED_DEPTH]";
  if (Array.isArray(value))
    return value.slice(0, 100).map((v) => redactMetadata(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>))
      out[key] = SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : redactMetadata(val, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 4096)
    return `${value.slice(0, 4096)}…[TRUNCATED]`;
  return value;
}
