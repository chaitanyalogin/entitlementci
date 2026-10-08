import fs from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
const root = process.cwd();
const output =
  process.env.RELEASE_OUTPUT ??
  path.join(root, "../EntitlementCI_Complete_2026_10_08.zip");
const directories = new Set([
  "apps",
  "packages",
  "workers",
  "tests",
  "docs",
  "scripts",
  "infrastructure",
  ".github",
]);
const rootFiles = new Set([
  "README.md",
  "START_HERE.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  "Dockerfile",
  "docker-compose.yml",
  "eslint.config.mjs",
  ".env.example",
  ".gitignore",
  ".dockerignore",
  ".prettierignore",
]);
const excluded = new Set([
  "node_modules",
  "dist",
  "dist-web",
  "review-dist",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
  "ci-logs",
  ".vite",
  ".prisma",
]);
const files = [];
function walk(dir, relative = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env.example")
      continue;
    if (entry.name === ".taskflow-api-key" || /\.(log|zip)$/.test(entry.name))
      continue;
    if (
      !relative &&
      !(entry.isDirectory()
        ? directories.has(entry.name)
        : rootFiles.has(entry.name))
    )
      continue;
    const rel = relative ? relative + "/" + entry.name : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    else
      files.push({
        name: "entitlementci/" + rel,
        data: fs.readFileSync(path.join(dir, entry.name)),
      });
  }
}
walk(root);
files.sort((a, b) => a.name.localeCompare(b.name));
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name),
    data = deflateRawSync(file.data),
    crc = crc32(file.data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0x5d48, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(file.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const index = Buffer.alloc(46);
  index.writeUInt32LE(0x02014b50, 0);
  index.writeUInt16LE(20, 4);
  index.writeUInt16LE(20, 6);
  index.writeUInt16LE(0x800, 8);
  index.writeUInt16LE(8, 10);
  index.writeUInt16LE(0x5d48, 14);
  index.writeUInt32LE(crc, 16);
  index.writeUInt32LE(data.length, 20);
  index.writeUInt32LE(file.data.length, 24);
  index.writeUInt16LE(name.length, 28);
  index.writeUInt32LE(offset, 42);
  central.push(index, name);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
fs.writeFileSync(output, Buffer.concat([...local, directory, end]));
console.log(
  `${files.length} source and documentation files packaged at ${output}`,
);
