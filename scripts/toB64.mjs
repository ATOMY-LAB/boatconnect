import fs from "node:fs";
const p = process.argv[2];
if (!p) process.exit(1);
process.stdout.write(fs.readFileSync(p).toString("base64"));
