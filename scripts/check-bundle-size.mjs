#!/usr/bin/env node
// Parses `next build` output (stdin or a log file) and enforces a first-load JS
// budget for critical routes. Writes a per-route table to the GitHub job summary
// when available. Exits non-zero when a budgeted route exceeds its limit.
import { readFileSync, appendFileSync } from "node:fs";

// First-load JS budget in kB per route. Keep the embed route small: it loads on
// other people's sites.
const BUDGETS = {
  "/embed/[id]": 150,
  "/welcome": 200,
};

function readInput() {
  const file = process.argv[2];
  if (file) return readFileSync(file, "utf8");
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// Matches lines like:
//   ├ ○ /welcome                1.2 kB         120 kB
//   ┌ ○ /embed/[id]             900 B          98.4 kB
const ROUTE_RE = /^[\s│├└┌┐┘─]*[○●λƒ◐◑]?\s*(\/\S*)\s+([\d.]+\s*[kKmM]?B)\s+([\d.]+\s*[kKmM]?B)\s*$/;

function toKb(size) {
  const m = size.trim().match(/^([\d.]+)\s*([kKmM]?)B$/);
  if (!m) return NaN;
  const value = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "m") return value * 1024;
  if (unit === "k") return value;
  return value / 1024;
}

function parseRoutes(output) {
  const routes = [];
  for (const line of output.split("\n")) {
    const m = line.match(ROUTE_RE);
    if (!m) continue;
    const [, route, size, firstLoad] = m;
    routes.push({ route, size, firstLoadKb: toKb(firstLoad) });
  }
  return routes;
}

function main() {
  const routes = parseRoutes(readInput());
  if (routes.length === 0) {
    console.error("bundle-size: no route table found in build output");
    process.exit(1);
  }

  const rows = routes.map((r) => {
    const budget = BUDGETS[r.route];
    const over = budget !== undefined && r.firstLoadKb > budget;
    return { ...r, budget, over };
  });

  const lines = [
    "| Route | Size | First Load JS | Budget | Status |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const budget = r.budget !== undefined ? `${r.budget} kB` : "—";
    const status = r.over ? "❌ over" : r.budget !== undefined ? "✅ ok" : "";
    lines.push(`| \`${r.route}\` | ${r.size} | ${r.firstLoadKb.toFixed(1)} kB | ${budget} | ${status} |`);
  }
  const table = lines.join("\n");
  console.log(table);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, `### Bundle size\n\n${table}\n`);
  }

  const failures = rows.filter((r) => r.over);
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(
        `bundle-size: ${f.route} first-load JS ${f.firstLoadKb.toFixed(1)} kB exceeds budget ${f.budget} kB`,
      );
    }
    process.exit(1);
  }
}

main();
