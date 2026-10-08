import { CreateForm } from "./create-form";
import { Lab } from "./lab";
import { createContext, useContext } from "react";
import { useMutationState } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "./lib/api";
import { useState } from "react";
const nav = [
  "Overview",
  "Drift Lab",
  "Projects",
  "Customers",
  "Plans",
  "Features",
  "Violations",
  "Test Runs",
  "Integrations",
  "API Keys",
  "Audit Logs",
  "Team",
  "Settings",
];
function Login() {
  const qc = useQueryClient();
  const [register, setRegister] = useState(false);
  const [org, setOrg] = useState("");
  const nav = useNavigate();
  const [email, setEmail] = useState(
    import.meta.env.DEV ? "owner@demo.entitlementci.test" : "",
  );
  const [pw, setPw] = useState(import.meta.env.DEV ? "DemoPassword!123" : "");
  const [error, setError] = useState("");
  const demoConfig = useQuery({
    queryKey: ["demo-config"],
    queryFn: () => api<{ hosted: boolean }>("/v1/demo/config"),
    retry: false,
  });
  const demo = useMutation({
    mutationFn: () => api("/v1/auth/demo", { method: "POST", body: "{}" }),
    onSuccess: async () => {
      qc.removeQueries({
        predicate: (query) => query.queryKey[0] !== "/v1/auth/me",
      });
      await qc.invalidateQueries({ queryKey: ["/v1/auth/me"] });
      nav("/drift-lab");
    },
    onError: (err) => setError(err.message),
  });
  async function submit(e: any) {
    e.preventDefault();
    try {
      await api(register ? "/v1/auth/register" : "/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: pw, organizationName: org }),
      });
      await qc.invalidateQueries({ queryKey: ["/v1/auth/me"] });
      nav("/");
    } catch (err: any) {
      setError(err.message);
    }
  }
  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <div className="eyebrow">DEVELOPER INFRASTRUCTURE</div>
        <h1>EntitlementCI</h1>
        <p>
          Verify what customers should have against what your application
          actually enforces.
        </p>
        {register ? (
          <label>
            Organization
            <input
              required
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
          </label>
        ) : null}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary">
          {register ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setRegister(!register)}
        >
          {register ? "Use an existing account" : "Create an organization"}
        </button>
        {demoConfig.data?.hosted ? (
          <>
            <button
              type="button"
              disabled={demo.isPending}
              onClick={() => demo.mutate()}
            >
              {demo.isPending ? "Preparing your demo…" : "Try live demo"}
            </button>
            <p className="subtitle">
              No signup needed. Your own sample workspace, with a session
              lasting one hour.
            </p>
          </>
        ) : null}
      </form>
    </div>
  );
}
const ProjectContext = createContext("");
function usePageData(path: string) {
  const project = useContext(ProjectContext);
  const scoped =
    [
      "/v1/overview",
      "/v1/customers",
      "/v1/violations",
      "/v1/tests/runs",
      "/v1/audit-logs",
    ].includes(path) && project
      ? `${path}?projectId=${encodeURIComponent(project)}`
      : path;
  return useQuery({
    queryKey: [path, project],
    queryFn: () => api(scoped),
    refetchInterval: 5000,
  });
}
function Feedback() {
  const errors = useMutationState({
    filters: { status: "error" },
    select: (m) => m.state.error,
  });
  return errors.length ? (
    <div className="global-feedback" role="alert">
      {(errors.at(-1) as Error)?.message}
    </div>
  ) : null;
}

function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navTo = useNavigate();
  const loc = useLocation();
  const me = usePageData("/v1/auth/me");
  const [projectId, setProjectId] = useState("");
  const projects = usePageData("/v1/projects");
  const signout = useMutation({
    mutationFn: () => api("/v1/auth/logout", { method: "POST" }),
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.removeQueries({
        predicate: (query) =>
          query.queryKey.length !== 1 || query.queryKey[0] !== "/v1/auth/me",
      });
      qc.setQueryData(["/v1/auth/me"], null);
      navTo("/login", { replace: true });
    },
  });
  const active = loc.pathname.split("/")[1] || "overview";
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          ENTITLEMENT<span>CI</span>
        </div>
        <div className="org">{me.data?.organization?.name ?? "Loading…"}</div>
        {nav.map((n) => {
          const slug = n.toLowerCase().replace(/\s+/g, "-");
          return (
            <Link
              className={active === slug ? "active" : ""}
              key={n}
              to={slug === "overview" ? "/" : `/${slug}`}
            >
              {n}
            </Link>
          );
        })}
        <button className="signout" onClick={() => signout.mutate()}>
          Sign out
        </button>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <div className="eyebrow">MONITORED PROJECT</div>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {(projects.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.environment}
                </option>
              ))}
            </select>
          </div>
          <div className="user-pill">{me.data?.user?.email}</div>
        </header>
        <ProjectContext.Provider value={projectId}>
          <Feedback />
          {children}
        </ProjectContext.Provider>
      </main>
    </div>
  );
}
function Overview() {
  const q = usePageData("/v1/overview");
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data;
  return (
    <Page title="Overview" kicker="ENTITLEMENT HEALTH">
      <div className="metrics">
        <Metric label="Customers monitored" value={d.customersMonitored} />
        <Metric label="Open violations" value={d.openViolations} />
        <Metric label="Critical" value={d.criticalViolations} />
        <Metric
          label="Billing providers"
          value={d.connectedBillingProviders.length}
        />
      </div>
      <div className="split">
        <Panel title="Recent violations">
          <Table
            rows={d.recentViolations.map((v: any) => [
              v.severity,
              v.featureKey,
              v.customer?.externalCustomerId,
              v.status,
              new Date(v.lastDetectedAt).toLocaleString(),
            ])}
            headers={[
              "Severity",
              "Feature",
              "Customer",
              "Status",
              "Last detected",
            ]}
          />
        </Panel>
        <Panel title="Recent test runs">
          <Table
            rows={d.recentTestRuns.map((r: any) => [
              r.status,
              r.scenario?.name,
              new Date(r.createdAt).toLocaleString(),
            ])}
            headers={["Status", "Scenario", "Created"]}
          />
        </Panel>
      </div>
    </Page>
  );
}
function Projects() {
  const q = usePageData("/v1/projects");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("PRODUCTION");
  const create = useMutation({
    mutationFn: () =>
      api("/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name, environment }),
      }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["/v1/projects"] });
    },
  });
  return (
    <Page title="Projects" kicker="TENANCY">
      <Panel title="Create project">
        <div className="row">
          <input
            className="inline-input"
            placeholder="TaskFlow Staging"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option>DEVELOPMENT</option>
            <option>STAGING</option>
            <option>PRODUCTION</option>
          </select>
          <button
            className="primary"
            disabled={!name || create.isPending}
            onClick={() => create.mutate()}
          >
            Create
          </button>
        </div>
      </Panel>
      <Panel title="Projects">
        <Table
          headers={["Name", "Environment", "Status", "Created"]}
          rows={(q.data ?? []).map((p: any) => [
            p.name,
            p.environment,
            p.status,
            new Date(p.createdAt).toLocaleString(),
          ])}
        />
      </Panel>
    </Page>
  );
}
function Customers() {
  const q = usePageData("/v1/customers");
  const projects = usePageData("/v1/projects");
  const plans = usePageData("/v1/plans");
  return (
    <Page title="Customers" kicker="EXPECTED VS ACTUAL">
      <CreateForm
        title="Monitor a customer"
        path="/v1/customers"
        fields={[
          { key: "customerId", label: "External customer ID" },
          {
            key: "projectId",
            label: "Project",
            options: (projects.data ?? []).map((p: any) => ({
              value: p.id,
              label: p.name,
            })),
          },
          {
            key: "plan",
            label: "Plan",
            options: (plans.data ?? []).map((p: any) => ({
              value: p.key,
              label: p.name,
            })),
          },
        ]}
      />
      <Panel title="Monitored customers">
        <Table
          headers={["Customer", "Project", "Plan", "Updated"]}
          rows={(q.data ?? []).map((c: any) => [
            <Link className="table-link" to={`/customers/${c.id}`}>
              {c.externalCustomerId}
            </Link>,
            c.projectId,
            c.subscriptions?.[0]?.plan?.name ?? "—",
            new Date(c.updatedAt).toLocaleString(),
          ])}
        />
      </Panel>
    </Page>
  );
}
function Plans() {
  const q = usePageData("/v1/plans");
  return (
    <Page title="Plans" kicker="EXPECTED ENTITLEMENTS">
      <CreateForm
        title="Create plan"
        path="/v1/plans"
        fields={[
          { key: "key", label: "Plan key", placeholder: "enterprise" },
          { key: "name", label: "Plan name" },
          {
            key: "entitlements",
            label: "Feature values (JSON)",
            type: "json",
            placeholder: '{"sso": true, "api_requests": 500000}',
          },
        ]}
        transform={(v) => ({
          ...v,
          entitlements: JSON.parse(v.entitlements ?? "{}"),
        })}
      />
      <div className="card-grid">
        {(q.data ?? []).map((p: any) => (
          <Panel key={p.id} title={p.name}>
            <div className="kv">
              {p.entitlements.map((e: any) => (
                <div key={e.id}>
                  <span>{e.feature.name}</span>
                  <b>{String(e.value)}</b>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </Page>
  );
}
function Features() {
  const q = usePageData("/v1/features");
  return (
    <Page title="Features" kicker="ENTITLEMENT MODEL">
      <CreateForm
        title="Create feature"
        path="/v1/features"
        fields={[
          { key: "key", label: "Feature key", placeholder: "sso" },
          { key: "name", label: "Name" },
          {
            key: "type",
            label: "Value type",
            options: [
              { value: "BOOLEAN", label: "Enabled / disabled" },
              { value: "LIMIT", label: "Numeric limit" },
              { value: "VALUE", label: "Value" },
            ],
          },
        ]}
      />
      <Panel title="Configured features">
        <Table
          headers={["Key", "Name", "Type", "Plan mappings", "Violations"]}
          rows={(q.data ?? []).map((f: any) => [
            f.key,
            f.name,
            f.type,
            f.planEntitlements.length,
            f._count.violations,
          ])}
        />
      </Panel>
    </Page>
  );
}
function Violations() {
  const q = usePageData("/v1/violations");
  return (
    <Page title="Violations" kicker="DRIFT DETECTION">
      <Panel title="Open and historical violations">
        <Table
          headers={[
            "Severity",
            "Feature",
            "Customer",
            "Expected",
            "Observed",
            "Status",
            "Occurrences",
          ]}
          rows={(q.data ?? []).map((v: any) => [
            v.severity,
            <Link className="table-link" to={`/violations/${v.id}`}>
              {v.featureKey}
            </Link>,
            v.customer.externalCustomerId,
            JSON.stringify(v.expectedValue),
            JSON.stringify(v.observedValue),
            v.status,
            v.occurrenceCount,
          ])}
        />
      </Panel>
    </Page>
  );
}
function TestRuns() {
  const q = usePageData("/v1/tests/runs");
  const scenarios = usePageData("/v1/tests/scenarios");
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const run = useMutation({
    mutationFn: () =>
      api("/v1/tests/runs", {
        method: "POST",
        body: JSON.stringify({ scenarioId: selected }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/v1/tests/runs"] }),
  });
  return (
    <Page title="Test Runs" kicker="SYNTHETIC REGRESSION">
      <Panel title="Run scenario">
        <div className="row">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose scenario</option>
            {(scenarios.data ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={!selected || run.isPending}
            onClick={() => run.mutate()}
          >
            Run test
          </button>
        </div>
      </Panel>
      <Panel title="History">
        <Table
          headers={["Status", "Scenario", "Started", "Finished"]}
          rows={(q.data ?? []).map((r: any) => [
            r.status,
            <Link className="table-link" to={`/test-runs/${r.id}`}>
              {r.scenario.name}
            </Link>,
            r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : "—",
            r.finishedAt ? new Date(r.finishedAt).toLocaleTimeString() : "—",
          ])}
        />
      </Panel>
    </Page>
  );
}
function Integrations() {
  const q = usePageData("/v1/integrations");
  return (
    <Page title="Integrations" kicker="BILLING CONNECTORS">
      <CreateForm
        title="Connect a Stripe webhook"
        path="/v1/integrations/stripe"
        fields={[
          { key: "projectId", label: "Project ID" },
          { key: "accountIdentifier", label: "Stripe account label" },
          {
            key: "environment",
            label: "Environment",
            options: [
              { value: "DEVELOPMENT", label: "Development" },
              { value: "STAGING", label: "Staging" },
              { value: "PRODUCTION", label: "Production" },
            ],
          },
          { key: "secretKey", label: "Stripe test key", type: "password" },
          {
            key: "webhookSecret",
            label: "Webhook signing secret",
            type: "password",
          },
        ]}
      />
      <Panel title="Stripe">
        <Table
          headers={[
            "Environment",
            "Status",
            "Account",
            "Last webhook",
            "Failures",
          ]}
          rows={(q.data ?? []).map((x: any) => [
            x.environment,
            x.status,
            x.accountIdentifier ?? "—",
            x.lastWebhookAt ? new Date(x.lastWebhookAt).toLocaleString() : "—",
            x.webhookFailures,
          ])}
        />
      </Panel>
    </Page>
  );
}
function Keys() {
  const q = usePageData("/v1/api-keys");
  const projects = usePageData("/v1/projects");
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [label, setLabel] = useState("SDK key");
  const [environment, setEnvironment] = useState("PRODUCTION");
  const [secret, setSecret] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api("/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ projectId, label, environment }),
      }),
    onSuccess: (d: any) => {
      setSecret(d.secret);
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/api-keys/${id}/revoke`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/v1/api-keys"] }),
  });
  const rotate = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/api-keys/${id}/rotate`, { method: "POST" }),
    onSuccess: (d: any) => {
      setSecret(d.secret);
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
    },
  });
  return (
    <Page title="API Keys" kicker="SDK ACCESS">
      <Panel title="Create project key">
        <div className="row">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Choose project</option>
            {(projects.data ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="inline-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
          />
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option>DEVELOPMENT</option>
            <option>STAGING</option>
            <option>PRODUCTION</option>
          </select>
          <button
            className="primary"
            disabled={!projectId || create.isPending}
            onClick={() => create.mutate()}
          >
            Create key
          </button>
        </div>
      </Panel>
      <Panel title="Project keys">
        <Table
          headers={[
            "Label",
            "Prefix",
            "Environment",
            "Status",
            "Last used",
            "Actions",
          ]}
          rows={(q.data ?? []).map((x: any) => [
            x.label,
            x.prefix,
            x.environment,
            x.status,
            x.lastUsedAt ? new Date(x.lastUsedAt).toLocaleString() : "Never",
            <div className="table-actions">
              <button
                onClick={() => rotate.mutate(x.id)}
                disabled={x.status !== "ACTIVE"}
              >
                Rotate
              </button>
              <button
                onClick={() => revoke.mutate(x.id)}
                disabled={x.status !== "ACTIVE"}
              >
                Revoke
              </button>
            </div>,
          ])}
        />
        <p className="hint">
          Secrets are only returned at creation or rotation time. Store the
          revealed value in the monitored application's server-side secret
          manager.
        </p>
      </Panel>
      {secret && (
        <div className="secret-modal">
          <div className="secret-card">
            <h2>Copy this secret now</h2>
            <p>The plaintext secret will not be shown again.</p>
            <code>{secret}</code>
            <button
              className="primary"
              onClick={() => navigator.clipboard?.writeText(secret)}
            >
              Copy secret
            </button>
            <button onClick={() => setSecret("")}>Close</button>
          </div>
        </div>
      )}
    </Page>
  );
}
function CustomerDetail() {
  const id = useLocation().pathname.split("/")[2];
  const q = usePageData(`/v1/customers/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return <ErrorState message={q.error?.message ?? "Customer unavailable"} />;
  const c = q.data;
  return (
    <Page title={c.externalCustomerId} kicker="CUSTOMER INVESTIGATION">
      <div className="metrics">
        <Metric
          label="Expected plan"
          value={c.subscriptions?.[0]?.plan?.name ?? "—"}
        />
        <Metric
          label="Observed decisions"
          value={c.observedDecisions?.length ?? 0}
        />
        <Metric label="Violations" value={c.violations?.length ?? 0} />
        <Metric
          label="Current match"
          value={c.comparison?.matches ? "HEALTHY" : "DRIFT"}
        />
      </div>
      <Panel title="Feature matrix">
        <div className="matrix-heading">
          <span>Feature</span>
          <span>Expected</span>
          <span>Observed</span>
          <span>Status</span>
        </div>
        <div className="matrix">
          {c.expectedEntitlements.map((e: any) => {
            const observed = c.observedDecisions.find(
              (o: any) => o.featureKey === e.feature.key,
            );
            const expected = String(e.value);
            const actual = observed
              ? String(observed.value ?? observed.allowed)
              : "—";
            return (
              <div
                className={
                  expected === actual ? "matrix-row" : "matrix-row fail"
                }
                key={e.id}
              >
                <span>{e.feature.name}</span>
                <b>{expected}</b>
                <b>{actual}</b>
                <span>{expected === actual ? "OK" : "FAIL"}</span>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Recent violations">
        <Table
          headers={["Feature", "Severity", "Status", "Occurrences"]}
          rows={(c.violations ?? []).map((v: any) => [
            <Link className="table-link" to={`/violations/${v.id}`}>
              {v.featureKey}
            </Link>,
            v.severity,
            v.status,
            v.occurrenceCount,
          ])}
        />
      </Panel>
    </Page>
  );
}
function ViolationDetail() {
  const id = useLocation().pathname.split("/")[2];
  const q = usePageData(`/v1/violations/${id}`);
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: string) =>
      api(`/v1/violations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [`/v1/violations/${id}`] }),
  });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return <ErrorState message={q.error?.message ?? "Incident unavailable"} />;
  const v = q.data;
  return (
    <Page title={`Violation · ${v.featureKey}`} kicker="INCIDENT TIMELINE">
      <div className="metrics">
        <Metric label="Severity" value={v.severity} />
        <Metric label="Status" value={v.status} />
        <Metric label="Occurrences" value={v.occurrenceCount} />
        <Metric label="Customer" value={v.customer.externalCustomerId} />
      </div>
      <Panel title="Expected vs observed">
        <div className="compare">
          <div>
            <span>Expected</span>
            <strong>{JSON.stringify(v.expectedValue)}</strong>
          </div>
          <div>
            <span>Observed</span>
            <strong>{JSON.stringify(v.observedValue)}</strong>
          </div>
        </div>
        <div className="row">
          <button onClick={() => update.mutate("ACKNOWLEDGED")}>
            Acknowledge
          </button>
          <button className="primary" onClick={() => update.mutate("RESOLVED")}>
            Resolve
          </button>
          <button onClick={() => update.mutate("IGNORED")}>Ignore</button>
        </div>
      </Panel>
      <Panel title="Timeline">
        <Table
          headers={["Time", "Expected", "Observed", "Source", "Request ID"]}
          rows={(v.occurrences ?? []).map((o: any) => [
            new Date(o.createdAt).toLocaleString(),
            JSON.stringify(o.expectedValue),
            JSON.stringify(o.observedValue),
            o.source,
            o.requestId ?? "—",
          ])}
        />
      </Panel>
    </Page>
  );
}

function Audit() {
  const q = usePageData("/v1/audit-logs");
  return (
    <Page title="Audit Logs" kicker="TRACEABILITY">
      <Panel title="Recent actions">
        <Table
          headers={["Action", "Resource", "Actor", "Timestamp", "Request"]}
          rows={(q.data ?? []).map((x: any) => [
            x.action,
            x.resource,
            x.actor?.email ?? "system",
            new Date(x.createdAt).toLocaleString(),
            x.requestId ?? "—",
          ])}
        />
      </Panel>
    </Page>
  );
}
function Team() {
  const q = usePageData("/v1/organizations");
  return (
    <Page title="Team" kicker="RBAC">
      <CreateForm
        title="Add an existing account"
        path="/v1/organizations/members"
        fields={[
          { key: "email", label: "Account email", type: "email" },
          {
            key: "role",
            label: "Role",
            options: [
              { value: "VIEWER", label: "Viewer" },
              { value: "DEVELOPER", label: "Developer" },
              { value: "ADMIN", label: "Admin" },
            ],
          },
        ]}
      />
      <Panel title="Members">
        <Table
          headers={["Email", "Role", "Joined"]}
          rows={(q.data?.memberships ?? []).map((m: any) => [
            m.user.email,
            m.role,
            new Date(m.createdAt).toLocaleString(),
          ])}
        />
      </Panel>
    </Page>
  );
}
function Settings() {
  return (
    <Page title="Settings" kicker="PLATFORM">
      <div className="card-grid">
        <Panel title="Security baseline">
          <p>HTTP-only session cookie</p>
          <p>Double-submit CSRF protection</p>
          <p>Tenant-scoped server authorization</p>
          <p>Hashed project API secrets</p>
        </Panel>
        <Panel title="Data minimization">
          <p>External customer IDs</p>
          <p>Optional email hashes</p>
          <p>Redactable metadata</p>
          <p>Retention requires the maintenance command</p>
        </Panel>
      </div>
    </Page>
  );
}
function Page({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{kicker}</div>
          <h1>{title}</h1>
        </div>
      </div>
      {children}
    </section>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((x, j) => (
                  <td key={j}>{x === undefined || x === null ? "—" : x}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="empty">
                No records
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Loading() {
  return <div className="loading">Loading…</div>;
}
function ErrorState({ message }: { message: string }) {
  return <div className="error-state">{message}</div>;
}
function TestDetail() {
  const id = useLocation().pathname.split("/")[2];
  const q = usePageData(`/v1/tests/runs/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return <ErrorState message={q.error?.message ?? "Test unavailable"} />;
  const d = q.data;
  return (
    <Page title={d.scenario.name} kicker="REGRESSION EVIDENCE">
      <div className="notice">{d.status}</div>
      <Panel title="Executed steps">
        <Table
          headers={["Step", "Action", "Result", "Evidence", "Duration"]}
          rows={d.results.map((r: any) => [
            r.step,
            r.name,
            r.status,
            r.error ?? JSON.stringify(r.observed),
            `${r.durationMs} ms`,
          ])}
        />
      </Panel>
    </Page>
  );
}
function RouterView() {
  const path = useLocation().pathname;
  if (path === "/") return <Overview />;
  if (path.startsWith("/test-runs/")) return <TestDetail />;
  if (path.startsWith("/violations/")) return <ViolationDetail />;
  if (path.startsWith("/customers/")) return <CustomerDetail />;
  const map: any = {
    "/drift-lab": Lab,
    "/projects": Projects,
    "/customers": Customers,
    "/plans": Plans,
    "/features": Features,
    "/violations": Violations,
    "/test-runs": TestRuns,
    "/integrations": Integrations,
    "/api-keys": Keys,
    "/audit-logs": Audit,
    "/team": Team,
    "/settings": Settings,
  };
  const C = map[path] ?? Overview;
  return <C />;
}
export function App() {
  const me = useQuery({
    queryKey: ["/v1/auth/me"],
    queryFn: () => api("/v1/auth/me"),
    retry: false,
  });
  if (me.isLoading) return <Loading />;
  if (me.isError || !me.data) return <Login />;
  return (
    <AppShell>
      <RouterView />
    </AppShell>
  );
}
