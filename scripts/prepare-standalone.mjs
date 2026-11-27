import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error("ERROR: .next/standalone not found. Run `npm run build` first.");
  process.exit(1);
}

const copyRecursive = (src, dest) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
};

copyRecursive(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyRecursive(path.join(root, "public"), path.join(standaloneDir, "public"));

console.log("Prepared .next/standalone with static assets and public directory.");
