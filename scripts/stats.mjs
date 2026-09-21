#!/usr/bin/env node
// @author AVRG3
/**
 * Usage numbers a maintainer can see WITHOUT telemetry in the tools:
 *   - npm downloads (api.npmjs.org): last day / week / month per package — package fetches, including automated runs and repeat downloads.
 *   - GitHub: stars, forks, watchers; views + unique visitors and clones (last 14 days, needs `gh` login); top referrers.
 *   node scripts/stats.mjs            (also: npm run stats)
 */
import { execFileSync } from "node:child_process";

const OWNER = "Warddamn";
const REPO = "tiny-tools";
const PACKAGES = ["@tiny_tools_pw/context", "@tiny_tools_pw/shared"];

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");
async function getJson(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "tiny-tools-stats" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
function gh(path) {
  try {
    return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
}

console.log(`tiny-tools usage · ${new Date().toISOString().slice(0, 10)}\n`);

console.log("npm downloads (package fetches, not unique people or agents)");
for (const pkg of PACKAGES) {
  const enc = encodeURIComponent(pkg);
  const [day, week, month] = await Promise.all(["last-day", "last-week", "last-month"].map((p) => getJson(`https://api.npmjs.org/downloads/point/${p}/${enc}`)));
  if (!week) console.log(`  ${pkg.padEnd(22)} not published yet (or npm unreachable)`);
  else console.log(`  ${pkg.padEnd(22)} day ${fmt(day?.downloads)} · week ${fmt(week.downloads)} · month ${fmt(month?.downloads)}`);
}

console.log("\nGitHub");
const repo = (await getJson(`https://api.github.com/repos/${OWNER}/${REPO}`)) ?? gh(`repos/${OWNER}/${REPO}`);
if (repo) console.log(`  stars ${fmt(repo.stargazers_count)} · forks ${fmt(repo.forks_count)} · watchers ${fmt(repo.subscribers_count)} · open issues ${fmt(repo.open_issues_count)}`);
const views = gh(`repos/${OWNER}/${REPO}/traffic/views`);
const clones = gh(`repos/${OWNER}/${REPO}/traffic/clones`);
if (views && clones) {
  console.log(`  last 14 days: ${fmt(views.count)} views by ${fmt(views.uniques)} unique visitors · ${fmt(clones.count)} clones by ${fmt(clones.uniques)} unique cloners`);
  const refs = gh(`repos/${OWNER}/${REPO}/traffic/popular/referrers`) ?? [];
  if (refs.length) console.log(`  top referrers: ${refs.slice(0, 5).map((r) => `${r.referrer} (${r.count})`).join(", ")}`);
} else console.log("  views/clones need `gh auth login` (requires repository access and traffic permissions)");

console.log("\nGitHub release downloads (GitHub counters, per file; includes tests, bots and repeat downloads)");
const rels = (await getJson(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=100`)) ?? gh(`repos/${OWNER}/${REPO}/releases?per_page=100`);
if (!Array.isArray(rels)) console.log("  release counts unavailable (API request failed)");
else if (rels.length === 0) console.log("  no releases yet");
else {
  let grand = 0;
  for (const r of rels) {
    const total = (r.assets ?? []).reduce((a, x) => a + (x.download_count ?? 0), 0);
    grand += total;
    console.log(`  ${r.tag_name.padEnd(10)} ${fmt(total)} download${total === 1 ? "" : "s"}  (published ${String(r.published_at).slice(0, 10)})`);
    for (const a of r.assets ?? []) console.log(`      ${a.name.padEnd(40)} ${fmt(a.download_count ?? 0)}`);
  }
  console.log(`  ${"TOTAL (shown releases)".padEnd(10)} ${fmt(grand)}`);
}

console.log("\nDirectory searches (not confirmation of a listing)");
console.log(`  MCP Registry   https://registry.modelcontextprotocol.io/v0.1/servers?search=tiny-context`);
console.log(`  Smithery       https://smithery.ai/search?q=tiny-context`);
console.log(`  PulseMCP       https://www.pulsemcp.com/servers?q=tiny-context`);
console.log(`  Glama          https://glama.ai/mcp/servers?query=tiny-context`);
console.log(`  npm            https://www.npmjs.com/package/@tiny_tools_pw/context`);
console.log(`  star history   https://star-history.com/#${OWNER}/${REPO}`);
