import { useState } from "react";
import { compareEntitlements } from "@entitlementci/shared";
const plans = {
  pro: {
    sso: false,
    advanced_reports: false,
    analytics: true,
    api_requests: 50000,
  },
  enterprise: {
    sso: true,
    advanced_reports: true,
    analytics: true,
    api_requests: 500000,
  },
};
type Incident = {
  id: string;
  feature: string;
  expected: boolean | number | string | null;
  observed: boolean | number | string | null;
  severity: string;
  reason: string;
  status: string;
};
export function Reviewer() {
  const [page, setPage] = useState("Overview");
  const [actual, setActual] = useState({ ...plans.pro });
  const [expected, setExpected] = useState({ ...plans.enterprise });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [test, setTest] = useState("Not run");
  const [plan, setPlan] = useState("enterprise");
  function observe(state = actual, promise = expected) {
    const r = compareEntitlements("cus_demo_upgrade", promise, state);
    setChecked(true);
    setIncidents((prev) => {
      const next = prev.map((i) => ({
        ...i,
        status: r.mismatches.some((m) => m.feature === i.feature)
          ? "OPEN"
          : "RESOLVED",
      }));
      for (const m of r.mismatches) {
        if (!next.some((i) => i.feature === m.feature && i.status === "OPEN"))
          next.push({ ...m, id: crypto.randomUUID(), status: "OPEN" });
      }
      return next;
    });
    setEvents((e) => [
      `${new Date().toLocaleTimeString()} · ${r.matches ? "Access matches the subscription" : "Drift detected in " + r.mismatches.length + " features"}`,
      ...e,
    ]);
    setTest("Not run");
  }
  function breakUpgrade() {
    setExpected({ ...plans.enterprise });
    setActual({ ...plans.pro });
    setPlan("enterprise");
    observe({ ...plans.pro }, { ...plans.enterprise });
  }
  function fix() {
    setActual({ ...expected });
    observe({ ...expected }, expected);
  }
  const open = incidents.filter((i) => i.status === "OPEN");
  const compare = compareEntitlements("cus_demo_upgrade", expected, actual);
  const pages = [
    "Overview",
    "Customer",
    "Violations",
    "Regression",
    "Architecture",
  ];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          ENTITLEMENT<span>CI</span>
        </div>
        <div className="org">
          TaskFlow workspace
          <br />
          Interactive portfolio demo
        </div>
        {pages.map((n) => (
          <a
            key={n}
            href={"#" + n.toLowerCase()}
            className={page === n ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setPage(n);
            }}
          >
            {n}
          </a>
        ))}
        <div className="review-author">
          Built by
          <br />
          <strong>Chaitanyachidambar S. Kulkarni</strong>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <div className="eyebrow">TASKFLOW / SANDBOX</div>
            <strong>Entitlement verification</strong>
          </div>
          <span className="badge neutral">Browser demo</span>
        </header>
        <div className="review-banner">
          This demo runs the real comparison engine with sample data in your
          browser. The complete source includes the API, PostgreSQL, Redis,
          worker and SDK. Changes reset when you reload.
        </div>
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Architecture"
                  ? "ENGINEERING DESIGN"
                  : "EXPECTED VS OBSERVED"}
              </div>
              <h1>{page === "Overview" ? "Entitlement health" : page}</h1>
              <p className="subtitle">
                {page === "Overview"
                  ? "A subscription can be correct while application access is wrong."
                  : page === "Customer"
                    ? "Inspect every feature promised to this customer."
                    : page === "Violations"
                      ? "Evidence from the observations you send."
                      : page === "Regression"
                        ? "Reproduce the failure before and after correcting access."
                        : "A small, explicit architecture with deterministic decisions."}
              </p>
            </div>
            <span
              className={`badge ${checked ? (open.length ? "bad" : "good") : "neutral"}`}
            >
              {checked
                ? open.length
                  ? "DRIFT DETECTED"
                  : "MATCHING"
                : "AWAITING OBSERVATION"}
            </span>
          </div>
          {page === "Overview" ? (
            <>
              <div className="metrics">
                <div className="metric">
                  <span>Customer in this demo</span>
                  <strong>1</strong>
                </div>
                <div className="metric">
                  <span>Open violations</span>
                  <strong>{open.length}</strong>
                </div>
                <div className="metric">
                  <span>Critical violations</span>
                  <strong>
                    {open.filter((i) => i.severity === "CRITICAL").length}
                  </strong>
                </div>
                <div className="metric">
                  <span>Regression</span>
                  <strong style={{ fontSize: 24 }}>{test}</strong>
                </div>
              </div>
              <div className="pipeline">
                <div>
                  <b>01</b> Enterprise subscription
                </div>
                <div>
                  <b>02</b> Pro application access
                </div>
                <div>
                  <b>03</b> Compare four features
                </div>
                <div>
                  <b>04</b> Evidence and regression
                </div>
              </div>
              <div className="lab-grid">
                <article className="lab-card">
                  <span className="eyebrow">REPRODUCE</span>
                  <h2>Paid for Enterprise. Still on Pro.</h2>
                  <p>
                    The upgrade reaches billing but never reaches the
                    application's feature checks.
                  </p>
                  <button className="primary" onClick={breakUpgrade}>
                    Trigger upgrade failure
                  </button>
                </article>
                <article className="lab-card">
                  <span className="eyebrow">VERIFY THE FIX</span>
                  <h2>Restore what was promised</h2>
                  <p>
                    Send corrected access. Matching observations resolve the
                    open incidents.
                  </p>
                  <button disabled={!checked} onClick={fix}>
                    Fix application access
                  </button>
                </article>
              </div>
              <FeatureMatrix
                expected={expected}
                actual={actual}
                checked={checked}
              />
            </>
          ) : null}
          {page === "Customer" ? (
            <>
              <div className="panel">
                <div className="panel-heading">
                  <h2>cus_demo_upgrade</h2>
                  <span className="badge neutral">Subscription: {plan}</span>
                </div>
                <div className="row">
                  <label className="field">
                    Expected subscription
                    <select
                      value={plan}
                      onChange={(e) => {
                        const p = e.target.value as keyof typeof plans;
                        setPlan(p);
                        setExpected({ ...plans[p] });
                        setChecked(false);
                      }}
                    >
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </label>
                  <label className="field">
                    Application API limit
                    <input
                      className="inline-input"
                      type="number"
                      min="0"
                      value={actual.api_requests}
                      onChange={(e) => {
                        setActual({
                          ...actual,
                          api_requests: Math.max(0, Number(e.target.value)),
                        });
                        setChecked(false);
                      }}
                    />
                  </label>
                  <button className="primary" onClick={() => observe()}>
                    Send observations
                  </button>
                </div>
                <div className="row">
                  {["sso", "analytics", "advanced_reports"].map((f) => (
                    <label className="check-field" key={f}>
                      <input
                        type="checkbox"
                        checked={Boolean(actual[f as keyof typeof actual])}
                        onChange={(e) => {
                          setActual({ ...actual, [f]: e.target.checked });
                          setChecked(false);
                        }}
                      />
                      {f.replaceAll("_", " ")}
                    </label>
                  ))}
                </div>
              </div>
              <FeatureMatrix
                expected={expected}
                actual={actual}
                checked={checked}
              />
            </>
          ) : null}
          {page === "Violations" ? (
            <div className="panel">
              <div className="panel-heading">
                <h2>Incident evidence</h2>
                <button onClick={() => observe()}>Send observations</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Severity</th>
                      <th>Expected</th>
                      <th>Observed</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((i) => (
                      <tr key={i.id}>
                        <td>{i.feature}</td>
                        <td>{i.severity}</td>
                        <td>{String(i.expected)}</td>
                        <td>{String(i.observed)}</td>
                        <td>
                          <span
                            className={`badge ${i.status === "OPEN" ? "bad" : "good"}`}
                          >
                            {i.status}
                          </span>
                        </td>
                        <td>{i.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!incidents.length ? (
                  <p className="empty">
                    Trigger the upgrade failure to collect evidence.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {page === "Regression" ? (
            <>
              <div className="fix-bar">
                <div>
                  <h2>Enterprise access regression</h2>
                  <p>
                    Check SSO, reports, analytics and the API limit against
                    current browser state.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setTest(compare.matches ? "PASSED" : "FAILED");
                    setEvents((e) => [
                      `${new Date().toLocaleTimeString()} · Regression ${compare.matches ? "passed" : "failed"}`,
                      ...e,
                    ]);
                  }}
                >
                  Run regression
                </button>
              </div>
              <div className="notice" role="status">
                Result: {test}. This hosted check uses browser state. Local
                regression tests call TaskFlow over HTTP.
              </div>
              <FeatureMatrix
                expected={expected}
                actual={actual}
                checked={test !== "Not run"}
              />
            </>
          ) : null}
          {page === "Architecture" ? (
            <>
              <div className="panel">
                <div className="panel-heading">
                  <h2>The complete local application</h2>
                </div>
                <div className="architecture-grid">
                  {[
                    [
                      "React dashboard",
                      "Investigate customers, incidents and test results.",
                    ],
                    [
                      "Fastify API",
                      "Validate inputs and enforce organization permissions.",
                    ],
                    [
                      "PostgreSQL + Prisma",
                      "Keep subscription promises, observed decisions and audit evidence.",
                    ],
                    [
                      "Redis + BullMQ",
                      "Process comparisons, signed webhooks and regression jobs.",
                    ],
                    [
                      "Node SDK + TaskFlow",
                      "Report actual access from a separate demonstration SaaS.",
                    ],
                    [
                      "Deterministic engine",
                      "Compare exact boolean and numeric values. No AI decision layer.",
                    ],
                  ].map(([name, text]) => (
                    <article className="lab-card" key={name}>
                      <h2>{name}</h2>
                      <p>{text}</p>
                    </article>
                  ))}
                </div>
              </div>
              <div className="notice">
                The backend services are included in the source package. They
                are not connected to this browser demonstration. A public
                backend requires configured database, Redis, HTTPS and
                production secrets.
              </div>
            </>
          ) : null}
          {events.length ? (
            <div className="panel">
              <div className="panel-heading">
                <h2>Session activity</h2>
              </div>
              <div className="activity-list">
                {events.slice(0, 8).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
function FeatureMatrix({
  expected,
  actual,
  checked,
}: {
  expected: Record<string, boolean | number>;
  actual: Record<string, boolean | number>;
  checked: boolean;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <h2>Customer feature matrix</h2>
        <span className="badge neutral">cus_demo_upgrade</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Subscription promises</th>
              <th>Application enforces</th>
              <th>Comparison</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(expected).map(([feature, value]) => (
              <tr key={feature}>
                <td>{feature.replaceAll("_", " ")}</td>
                <td>
                  {typeof value === "number"
                    ? value.toLocaleString()
                    : value
                      ? "Enabled"
                      : "Disabled"}
                </td>
                <td>
                  {typeof actual[feature] === "number"
                    ? actual[feature].toLocaleString()
                    : actual[feature]
                      ? "Enabled"
                      : "Disabled"}
                </td>
                <td>
                  <span
                    className={`badge ${checked ? (value === actual[feature] ? "good" : "bad") : "neutral"}`}
                  >
                    {checked
                      ? value === actual[feature]
                        ? "MATCH"
                        : "DRIFT"
                      : "Not checked"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
