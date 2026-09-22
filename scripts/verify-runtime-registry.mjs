#!/usr/bin/env node
// @author AVRG3
import { promises as fs } from 'node:fs';
import assert from 'node:assert/strict';
const expected=JSON.parse(await fs.readFile(process.argv[2]??'packages/runtime/server.json','utf8'));
assert.ok(expected.packages?.length,'Pass generated/published metadata including the artifact hash');
const response=await fetch(`https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(expected.name)}`,{signal:AbortSignal.timeout(30000)});
assert.ok(response.ok,`Registry HTTP ${response.status}`);
const body=await response.json();const listing=body.servers.find(r=>r.server.name===expected.name&&r.server.version===expected.version);
assert.ok(listing,'Published version was not found');
assert.equal(listing._meta?.['io.modelcontextprotocol.registry/official']?.status,'active');
assert.deepEqual(listing.server.packages,expected.packages);
console.log(`PASS active registry ${expected.name}@${expected.version}, exact artifact URL/hash verified`);
