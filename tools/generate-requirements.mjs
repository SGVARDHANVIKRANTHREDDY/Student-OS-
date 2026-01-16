import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, "requirements.txt");

function exists(p) {
	try { fs.accessSync(p); return true; } catch { return false; }
}
function readJson(p) {
	return JSON.parse(fs.readFileSync(p, "utf8"));
}
function listDir(p) {
	try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}
function walkFiles(dir, maxDepth = 8, depth = 0, out = []) {
	if (depth > maxDepth) return out;
	for (const ent of listDir(dir)) {
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist" || ent.name === "build") continue;
			walkFiles(full, maxDepth, depth + 1, out);
		} else if (ent.isFile()) {
			out.push(full);
		}
	}
	return out;
}

function parseNpmLock(lockPath) {
	const lock = readJson(lockPath);
	const pairs = new Set();

	// npm v7+ lockfile: exact resolved versions are in "packages"
	if (lock?.packages && typeof lock.packages === "object") {
		for (const [k, v] of Object.entries(lock.packages)) {
			if (!v || typeof v !== "object") continue;
			if (!v.version) continue;

			let name = v.name;
			if (!name) {
				const m = k.match(/node_modules\/(.+)$/);
				if (!m) continue;
				name = m[1];
			}
			pairs.add(`${name}==${v.version}`);
		}
		return pairs;
	}

	// npm v6 lockfile: walk dependency tree
	function visit(deps) {
		if (!deps || typeof deps !== "object") return;
		for (const [name, info] of Object.entries(deps)) {
			if (!info || typeof info !== "object") continue;
			if (info.version) pairs.add(`${name}==${info.version}`);
			visit(info.dependencies);
		}
	}
	visit(lock?.dependencies);
	return pairs;
}

function parseDockerComposeImages(composePath) {
	const lines = fs.readFileSync(composePath, "utf8").split(/\r?\n/);
	const images = [];
	for (const line of lines) {
		const m = line.match(/^\s*image:\s*([^\s#]+)\s*$/);
		if (m) images.push(m[1]);
	}
	return images;
}

function section(title, lines) {
	return [`## ${title}`, ...(lines.length ? lines : ["# (none found)"]), ""].join("\n");
}

function main() {
	const backendLock = path.join(ROOT, "backend", "package-lock.json");
	const frontendLock = path.join(ROOT, "frontend", "package-lock.json");

	const files = walkFiles(ROOT);
	const composeFiles = files
		.filter((f) => {
			const b = path.basename(f).toLowerCase();
			return b === "docker-compose.yml" || b === "docker-compose.yaml" || b === "compose.yml" || b === "compose.yaml";
		})
		.sort((a, b) => a.localeCompare(b));

	const out = [];
	out.push(
`# Student-OS dependency inventory (generated)
# This file is overwritten by: node tools/generate-requirements.mjs
# It is an inventory of resolved dependencies and runtime tooling (NOT pip-installable).
`
	);

	out.push(section("System prerequisites", [
		"# Node.js (LTS recommended) + npm",
		"# SQLite (primary system-of-record; file-backed)",
		"# Redis (BullMQ workers/quotas when enabled)",
		"# Postgres (optional; jobs/search domain when configured)",
		"# Docker + Docker Compose (recommended for local services)"
	]));

	if (exists(backendLock)) {
		const pairs = [...parseNpmLock(backendLock)].sort((a, b) => a.localeCompare(b));
		out.push(section("Backend npm dependencies (from backend/package-lock.json)", [
			`# source: ${path.relative(ROOT, backendLock)}`,
			...pairs
		]));
	} else {
		out.push(section("Backend npm dependencies (from backend/package-lock.json)", [
			`# MISSING: ${path.relative(ROOT, backendLock)}`
		]));
	}

	if (exists(frontendLock)) {
		const pairs = [...parseNpmLock(frontendLock)].sort((a, b) => a.localeCompare(b));
		out.push(section("Frontend npm dependencies (from frontend/package-lock.json)", [
			`# source: ${path.relative(ROOT, frontendLock)}`,
			...pairs
		]));
	} else {
		out.push(section("Frontend npm dependencies (from frontend/package-lock.json)", [
			`# MISSING: ${path.relative(ROOT, frontendLock)}`
		]));
	}

	const images = [];
	for (const f of composeFiles) {
		for (const img of parseDockerComposeImages(f)) {
			images.push(`${img}  # ${path.relative(ROOT, f)}`);
		}
	}
	out.push(section("Docker images (from compose files)", images));

	// Always overwrite
	fs.writeFileSync(OUT, out.join("\n"), "utf8");
	process.stdout.write(`Wrote ${OUT}\n`);
}

main();
