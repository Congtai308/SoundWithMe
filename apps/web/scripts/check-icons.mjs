// Fails when the code shows an icon that src/components/ui/icon-names.ts
// doesn't list: the page only loads the listed glyphs, so a missing one
// would render as its name in plain text. Run by `pnpm lint`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const listed = new Set(
  [...readFileSync(join(root, "src/components/ui/icon-names.ts"), "utf8").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]),
);

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry)) yield path;
  }
}

// <Icon name="x" />, <Icon name={on ? "x" : "y"} />, and `icon: "x"` / icon="x" props and maps.
const CONTEXTS = [/<Icon\b[^>]*?\bname=(\{[^}]*\}|"[^"]*")/g, /\bicon\s*[:=]\s*(\{[^}]*\}|"[^"]*")/g];
const missing = [];
for (const dir of ["src", "app"]) {
  for (const file of sourceFiles(join(root, dir))) {
    const source = readFileSync(file, "utf8");
    for (const context of CONTEXTS) {
      for (const match of source.matchAll(context)) {
        // `room.type === "private" ? "lock" : …`: only the results are icons, not what's compared.
        const results = match[1].replace(/[!=]==?\s*"[^"]*"|"[^"]*"\s*[!=]==?/g, "");
        for (const [, name] of results.matchAll(/"([a-z0-9_]+)"/g)) {
          if (!listed.has(name)) missing.push(`${file.slice(root.length)}: ${name}`);
        }
      }
    }
  }
}

if (missing.length > 0) {
  console.error("Icons not in src/components/ui/icon-names.ts (add them, alphabetically):");
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`Icons OK (${listed.size} listed).`);
