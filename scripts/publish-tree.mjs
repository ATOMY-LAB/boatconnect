/**
 * Creates one commit on main with every git-tracked file (UTF-8 text) via GitHub REST.
 * Requires: gh CLI authenticated, run from repo root: node scripts/publish-tree.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const repo = "ATOMY-LAB/boatconnect";

function ghApi(method, route, bodyObj) {
  const input = bodyObj ? JSON.stringify(bodyObj) : "";
  const args = ["api", "-X", method, route];
  if (input) args.push("--input", "-");
  const out = execFileSync("gh", args, {
    encoding: "utf8",
    cwd: root,
    input: input || undefined,
    maxBuffer: 32 * 1024 * 1024,
  });
  return out ? JSON.parse(out) : {};
}

function gitLsFiles() {
  return execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}

function createBlobUtf8(absPath) {
  const content = fs.readFileSync(absPath, "utf8");
  return ghApi("POST", `repos/${repo}/git/blobs`, { content, encoding: "utf-8" });
}

const files = gitLsFiles();
const tree = [];
for (const rel of files) {
  const posix = rel.split(path.sep).join("/");
  const abs = path.join(root, rel);
  process.stderr.write(`blob ${posix}\n`);
  const { sha } = createBlobUtf8(abs);
  tree.push({ path: posix, mode: "100644", type: "blob", sha });
}

const { sha: treeSha } = ghApi("POST", `repos/${repo}/git/trees`, { tree });
const parentSha = ghApi("GET", `repos/${repo}/commits/main`).sha;
const { sha: commitSha } = ghApi("POST", `repos/${repo}/git/commits`, {
  message: "Import full boatconnect library",
  tree: treeSha,
  parents: [parentSha],
});
ghApi("PATCH", `repos/${repo}/git/refs/heads/main`, { sha: commitSha });
process.stderr.write(`Updated main -> ${commitSha}\n`);
