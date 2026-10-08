import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
type Field = {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
  type?: string;
  placeholder?: string;
};
export function CreateForm({
  title,
  path,
  fields,
  transform,
}: {
  title: string;
  path: string;
  fields: Field[];
  transform?: (v: Record<string, string>) => unknown;
}) {
  const [value, setValue] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api(path, {
        method: "POST",
        body: JSON.stringify(transform ? transform(value) : value),
      }),
    onSuccess: () => {
      setValue({});
      qc.invalidateQueries();
    },
  });
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="row">
          {fields.map((f) => (
            <label className="field" key={f.key}>
              {f.label}
              {f.options ? (
                <select
                  required
                  value={value[f.key] ?? ""}
                  onChange={(e) =>
                    setValue({ ...value, [f.key]: e.target.value })
                  }
                >
                  <option value="">Choose</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "json" ? (
                <textarea
                  required
                  placeholder={f.placeholder}
                  value={value[f.key] ?? ""}
                  onChange={(e) =>
                    setValue({ ...value, [f.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  required
                  className="inline-input"
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={value[f.key] ?? ""}
                  onChange={(e) =>
                    setValue({ ...value, [f.key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <button className="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        {mutation.error ? (
          <p className="error" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
