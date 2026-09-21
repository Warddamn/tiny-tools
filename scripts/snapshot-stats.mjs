#!/usr/bin/env node
// @author AVRG3
/** Archive public release counters; include private traffic only when explicitly configured. */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
const repo = process.env.GITHUB_REPOSITORY ?? "Warddamn/tiny-tools";
function api(endpoint, token = process.env.GH_TOKEN, paginate = false) {
  return JSON.parse(execFileSync("gh", ["api", ...(paginate ? ["--paginate", "--slurp"] : []), `repos/${repo}/${endpoint}`], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, ...(token ? { GH_TOKEN: token } : {}) },
  }));
}
const releases = api("releases?per_page=100", undefined, true).flat();
const snapshot = {
  fetched_at: new Date().toISOString(), repo,
  note: "Download events include automation and repeats; not unique people or agents. Traffic counts cover overlapping 14-day windows; do not add them across days.",
  releases: releases.map(r => ({ tag: r.tag_name, assets: r.assets.map(a => ({ id: a.id, name: a.name, downloads: a.download_count })) })),
  traffic_status: "not_configured", views: null, clones: null, referrers: null, paths: null,
};
if (process.env.TRAFFIC_TOKEN) {
  for (const [key, endpoint] of Object.entries({ views: "views", clones: "clones", referrers: "popular/referrers", paths: "popular/paths" })) {
    snapshot[key] = api(`traffic/${endpoint}`, process.env.TRAFFIC_TOKEN);
  }
  snapshot.traffic_status = "available";
}
const file = path.join("stats/traffic", `${snapshot.fetched_at.slice(0, 10)}.json`);
await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Saved public release counters to ${file}; private traffic: ${snapshot.traffic_status}`);
if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `file=${file}\n`);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
  `Public release download counters saved. Private visitor/clone history: **${snapshot.traffic_status}**.\n\nDownload counts include tests and repeat fetches; they do not identify agents or people.\n`);
