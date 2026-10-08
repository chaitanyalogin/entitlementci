import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = process.cwd();
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      [
        "node_modules",
        ".git",
        "dist",
        "dist-web",
        "review-dist",
        "coverage",
        "test-results",
        "playwright-report",
      ].includes(e.name)
    )
      continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}
walk(root);
let errors = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const diagnostics = sf.parseDiagnostics;
  if (diagnostics.length) {
    errors += diagnostics.length;
    console.error(file);
    for (const d of diagnostics)
      console.error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  }
}
if (errors) process.exit(1);
console.log(
  `TypeScript syntax validation passed for ${files.length} source files.`,
);
