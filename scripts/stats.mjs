#!/usr/bin/env node
// @author AVRG3
/**
 * Usage numbers a maintainer can see WITHOUT telemetry in the tools:
 *   - npm downloads (api.npmjs.org): last day / week / month per package — every `npx -y -p @tiny_tools_pw/context …`
 *     by a new machine is a download.
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
    const r = await fetch(url, { headers: { "user-agent": "tiny-tools-stats" } });
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

console.log("npm downloads (how many machines pulled the package)");
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
  console.log(`  last 14 days: ${fmt(views.count)} views by ${fmt(views.uniques)} people · ${fmt(clones.count)} clones by ${fmt(clones.uniques)} people`);
  const refs = gh(`repos/${OWNER}/${REPO}/traffic/popular/referrers`) ?? [];
  if (refs.length) console.log(`  top referrers: ${refs.slice(0, 5).map((r) => `${r.referrer} (${r.count})`).join(", ")}`);
} else console.log("  views/clones need `gh auth login` (only the repo owner can see them)");

console.log("\nDirectories (open in a browser)");
console.log(`  MCP Registry   https://registry.modelcontextprotocol.io/v0/servers?search=tiny-context`);
console.log(`  Smithery       https://smithery.ai/search?q=tiny-context`);
console.log(`  PulseMCP       https://www.pulsemcp.com/servers?q=tiny-context`);
console.log(`  Glama          https://glama.ai/mcp/servers?query=tiny-context`);
console.log(`  npm            https://www.npmjs.com/package/@tiny_tools_pw/context`);
console.log(`  star history   https://star-history.com/#${OWNER}/${REPO}`);
