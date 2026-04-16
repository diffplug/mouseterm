import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const outPath = resolve(__dirname, "../src/data/dependencies.json");
const themeExtensionsPath = resolve(repoRoot, "lib/src/lib/themes/bundled-extensions.json");

const raw = JSON.parse(
  execSync("pnpm licenses list --prod --json", { cwd: repoRoot, encoding: "utf-8" })
);

const deps = [];
for (const [license, packages] of Object.entries(raw)) {
  for (const pkg of packages) {
    deps.push({
      name: pkg.name,
      version: pkg.versions.join(", "),
      license,
      author: pkg.author || null,
      homepage: pkg.homepage || null,
    });
  }
}

// Merge in bundled theme extensions from OpenVSX
const themeExtensions = JSON.parse(readFileSync(themeExtensionsPath, "utf-8"));
deps.push(...themeExtensions);

deps.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(outPath, JSON.stringify(deps, null, 2) + "\n");
console.log(`Wrote ${deps.length} dependencies to src/data/dependencies.json`);
