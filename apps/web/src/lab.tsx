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
  const violations = useQuery({
    queryKey: ["lab-violations"],
    queryFn: () => api<any[]>("/v1/violations"),
    refetchInterval: 2000,
  });
  const run = useMutation({
    mutationFn: (scenario: string) =>
      api("/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      }),
    onSuccess: (_, scenario) => {
      setMessage(
        scenario === "fix"
          ? "Correct observations sent. The worker will resolve matching incidents."
          : "Observations sent through the Node SDK. Results update below.",
      );
      qc.invalidateQueries();
    },
  });
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
        <span className="badge neutral">Local demo</span>
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
            <button disabled={run.isPending} onClick={() => run.mutate(s.id)}>
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
          disabled={run.isPending}
          onClick={() => run.mutate("fix")}
        >
          Fix and verify
        </button>
      </div>
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
                      {v.featureKey}
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
