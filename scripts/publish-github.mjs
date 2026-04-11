/**
 * Pushes git-tracked files to an empty GitHub repo using the Git Data API.
 * Requires: Node 20+, gh CLI logged in, run from repo root: node scripts/publish-github.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "ATOMY-LAB/boatconnect";

function ghApiJson(args) {
  const out = execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out);
}

function gitLsFiles(root) {
  const out = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

const root = join(import.meta.dirname, "..");
const paths = gitLsFiles(root);
if (paths.length === 0) throw new Error("No tracked files");

const tree = [];
for (const rel of paths) {
  const full = join(root, rel);
  const buf = readFileSync(full);
  const content = buf.toString("base64");
  process.stderr.write(`blob ${rel} (${buf.length} bytes)\n`);
  const blob = ghApiJson([`repos/${REPO}/git/blobs`, "-X", "POST", "-f", "encoding=base64", "-f", `content=${content}`]);
  tree.push({ path: rel.replace(/\\/g, "/"), mode: "100644", type: "blob", sha: blob.sha });
}

process.stderr.write("creating tree...\n");
const treeRes = ghApiJson([`repos/${REPO}/git/trees`, "-X", "POST", "--input", "-"], {
  input: JSON.stringify({ tree }),
});

process.stderr.write("creating commit...\n");
const commitRes = ghApiJson([`repos/${REPO}/git/commits`, "-X", "POST", "--input", "-"], {
  input: JSON.stringify({
    message: "Initial commit: boatconnect binary codec, transports, firmware refs",
    tree: treeRes.sha,
    parents: [],
  }),
});

process.stderr.write(`updating main -> ${commitRes.sha}\n`);
try {
  ghApiJson([`repos/${REPO}/git/refs/heads/main`]);
  ghApiJson([`repos/${REPO}/git/refs/heads/main`, "-X", "PATCH", "-f", `sha=${commitRes.sha}`, "-F", "force=true"]);
} catch {
  ghApiJson([`repos/${REPO}/git/refs`, "-X", "POST", "-f", "ref=refs/heads/main", "-f", `sha=${commitRes.sha}`]);
}

process.stderr.write(`Done: https://github.com/${REPO}\n`);
