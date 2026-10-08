import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "./style.css";

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("demo@taskflow.test");
  const [password, setPassword] = useState("DemoPassword!123");
  const [error, setError] = useState("");
  return (
    <main className="login">
      <div className="login-card">
        <span className="eyebrow">TASKFLOW DEMO</span>
        <h1>Sign in</h1>
        <p>This is the local SaaS application monitored by EntitlementCI.</p>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button
          onClick={async () => {
            try {
              await call("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
              });
              onLogin();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          Sign in
        </button>
      </div>
    </main>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [scenario, setScenario] = useState("none");
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setCustomers(await call("/api/demo/customers"));
      setScenario((await call("/api/demo/state")).bugScenario);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  async function setBug(s: string) {
    try {
      await call("/api/demo/scenario", {
        method: "POST",
        body: JSON.stringify({ scenario: s }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function setPlan(id: string, plan: string) {
    try {
      await call(`/api/demo/customers/${id}/subscription`, {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      await call("/api/demo/observe", {
        method: "POST",
        body: JSON.stringify({ customerId: id }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">ENTITLEMENTCI FAILURE LAB</span>
          <h1>TaskFlow</h1>
          <p>Controlled SaaS environment for entitlement drift testing.</p>
        </div>
        <div className="right-head">
          <div className="badge">BUG MODE: {scenario}</div>
          <button
            onClick={async () => {
              await call("/api/auth/logout", { method: "POST" });
              onLogout();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      <section className="controls">
        <button onClick={() => setBug("none")}>Healthy</button>
        <button onClick={() => setBug("upgrade-propagation")}>
          Upgrade bug
        </button>
        <button onClick={() => setBug("downgrade-propagation")}>
          Downgrade bug
        </button>
        <button onClick={() => setBug("limit-bug")}>Limit bug</button>
      </section>
      <section className="grid">
        {customers.map((c) => (
          <article key={c.external_id}>
            <h2>{c.external_id}</h2>
            <p>
              Commercial plan: <b>{c.plan_name}</b>
            </p>
            <div className="actions">
              <button onClick={() => setPlan(c.external_id, "pro")}>
                Set Pro + observe
              </button>
              <button onClick={() => setPlan(c.external_id, "enterprise")}>
                Set Enterprise + observe
              </button>
            </div>
            <a
              href={`/api/demo/customers/${c.external_id}/entitlements`}
              target="_blank"
            >
              View actual entitlement JSON
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}

function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  useEffect(() => {
    call("/api/auth/me")
      .then(() => setAuth(true))
      .catch(() => setAuth(false));
  }, []);
  if (auth === null) return <main className="loading">Loading…</main>;
  return auth ? (
    <Dashboard onLogout={() => setAuth(false)} />
  ) : (
    <Login onLogin={() => setAuth(true)} />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
