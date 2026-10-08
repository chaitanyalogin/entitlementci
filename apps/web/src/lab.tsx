import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "./lib/api";
const scenarios = [
  {
    id: "healthy",
    name: "Check healthy customer",
    text: "Pro plan and Pro access match.",
  },
  {
    id: "upgrade-propagation",
    name: "Break an upgrade",
    text: "Enterprise is paid for. The application still gives Pro access.",
  },
  {
    id: "downgrade-propagation",
    name: "Break a downgrade",
    text: "The customer moved to Pro but still has Enterprise access.",
  },
  {
    id: "limit-bug",
    name: "Break an API limit",
    text: "500,000 requests are expected. The application enforces 50,000.",
  },
];
export function Lab() {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [runId, setRunId] = useState("");
  const status = useQuery({
    queryKey: ["demo-status"],
    queryFn: () =>
      api<{
        mode: "hosted" | "local" | "unavailable";
        ready: boolean;
        projectId?: string;
        scenarioId?: string;
        canRun: boolean;
      }>("/v1/demo/status"),
    retry: false,
  });
  const setup = useMutation({
    mutationFn: () => api("/v1/demo/setup", { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const regression = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/v1/tests/runs", {
        method: "POST",
        body: JSON.stringify({ scenarioId: status.data?.scenarioId }),
      }),
    onSuccess: (result) => {
      setRunId(result.id);
      qc.invalidateQueries();
    },
  });
  const test = useQuery({
    queryKey: ["sandbox-test", runId],
    queryFn: () => api<{ status: string }>(`/v1/tests/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "QUEUED")
        ? 1500
        : false,
  });
  const violations = useQuery({
    queryKey: ["lab-violations", status.data?.projectId],
    queryFn: () =>
      api<any[]>(
        `/v1/violations${status.data?.mode === "hosted" ? `?projectId=${encodeURIComponent(status.data.projectId!)}` : ""}`,
      ),
    enabled: Boolean(status.data?.ready && status.data?.mode !== "unavailable"),
    refetchInterval: 2000,
  });
  const run = useMutation({
    mutationFn: (scenario: string) =>
      api("/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      }),
    onSuccess: (result, scenario) => {
      if (result.testRunId) setRunId(result.testRunId);
      setMessage(
        scenario === "fix"
          ? "Correct observations sent. The worker will resolve matching incidents." +
              (result.testRunId ? " A regression test is queued below." : "")
          : "Observations sent through the Node SDK. Results update below.",
      );
      qc.invalidateQueries();
    },
  });
  if (status.isLoading)
    return (
      <section className="page">
        <p role="status">Loading your sandbox…</p>
      </section>
    );
  if (status.error)
    return (
      <section className="page">
        <p className="error">{status.error.message}</p>
      </section>
    );
  if (status.data?.mode === "unavailable")
    return (
      <section className="page">
        <h1>Drift lab</h1>
        <p>
          Interactive sample scenarios are not enabled in this environment. You
          can still monitor your own application through the SDK.
        </p>
        <Link to="/projects">Open projects</Link>
      </section>
    );
  if (!status.data?.ready)
    return (
      <section className="page">
        <h1>Try the live sandbox</h1>
        <p>
          Create sample plans and four sample customers in a separate staging
          project. Your existing projects and customer access will not change.
        </p>
        <button
          className="primary"
          disabled={setup.isPending || !status.data?.canRun}
          onClick={() => setup.mutate()}
        >
          {setup.isPending
            ? "Creating sample workspace…"
            : "Create sample workspace"}
        </button>
        {!status.data?.canRun ? (
          <p>A developer or owner can create the sample workspace.</p>
        ) : null}
        {setup.error ? <p className="error">{setup.error.message}</p> : null}
      </section>
    );
  const canRun = status.data.canRun && !run.isPending;
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TASKFLOW SANDBOX</div>
          <h1>Drift lab</h1>
          <p className="subtitle">
            Cause a real entitlement failure, inspect the evidence, then fix it.
          </p>
        </div>
        <span className="badge neutral">
          {status.data.mode === "hosted"
            ? "Live sandbox · Sample data"
            : "Local demo"}
        </span>
      </div>
      <div className="pipeline">
        <div>
          <b>01</b> Subscription promise
        </div>
        <div>
          <b>02</b> Application decision
        </div>
        <div>
          <b>03</b> Deterministic check
        </div>
        <div>
          <b>04</b> Incident or match
        </div>
      </div>
      <div className="lab-grid">
        {scenarios.map((s) => (
          <article className="lab-card" key={s.id}>
            <span className="eyebrow">
              {s.id === "healthy" ? "BASELINE" : "CONTROLLED FAILURE"}
            </span>
            <h2>{s.name}</h2>
            <p>{s.text}</p>
            <button disabled={!canRun} onClick={() => run.mutate(s.id)}>
              {s.id === "healthy"
                ? "Send healthy observations"
                : "Trigger failure"}
            </button>
          </article>
        ))}
      </div>
      <div className="fix-bar">
        <div>
          <h2>Restore correct access</h2>
          <p>Send fresh observations for all three affected customers.</p>
        </div>
        <button
          className="primary"
          disabled={!canRun}
          onClick={() => run.mutate("fix")}
        >
          Fix and verify
        </button>
      </div>
      {status.data.mode === "hosted" ? (
        <p className="notice">
          These are generated sample application decisions. Observations go
          through the real Node SDK, API, queue, and worker. Each organization
          has its own sandbox.
        </p>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {run.error ? (
        <p className="error" role="alert">
          {run.error.message}
        </p>
      ) : null}
      {status.data.mode === "hosted" ? (
        <div className="panel">
          <div className="panel-heading">
            <h2>Regression check</h2>
            <button
              disabled={
                !canRun ||
                regression.isPending ||
                ["QUEUED", "RUNNING"].includes(test.data?.status ?? "")
              }
              onClick={() => regression.mutate()}
            >
              Run regression test
            </button>
          </div>
          <p>
            Checks all four sample customers against their subscription
            promises. A broken scenario fails; correct access passes.
          </p>
          {regression.error ? (
            <p className="error">{regression.error.message}</p>
          ) : null}
          {runId ? (
            <p role="status">
              Regression: <strong>{test.data?.status ?? "QUEUED"}</strong> ·{" "}
              <Link to={`/test-runs/${runId}`}>View test evidence</Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="panel">
        <div className="panel-heading">
          <h2>Incident evidence</h2>
          <Link to="/test-runs">Run a regression test</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Feature</th>
                <th>Expected</th>
                <th>Observed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(violations.data ?? []).map((v: any) => (
                <tr key={v.id}>
                  <td>
                    <Link
                      className="table-link"
                      to={`/customers/${v.customerId}`}
                    >
                      {v.customer.externalCustomerId}
                    </Link>
                  </td>
                  <td>
                    <Link className="table-link" to={`/violations/${v.id}`}>
                      {status.data.mode === "hosted"
                        ? v.featureKey.replace(
                            `sample_${status.data.projectId}_`,
                            "",
                          )
                        : v.featureKey}
                    </Link>
                  </td>
                  <td>{String(v.expectedValue)}</td>
                  <td>{String(v.observedValue)}</td>
                  <td>
                    <span
                      className={`badge ${v.status === "RESOLVED" ? "good" : "bad"}`}
                    >
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!violations.data?.length ? (
            <p className="empty">
              Trigger a failure to collect incident evidence.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
