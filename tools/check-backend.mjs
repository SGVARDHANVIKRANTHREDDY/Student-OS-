import process from "node:process";

const DEFAULT_BASE = "http://localhost:5000";
const baseUrl = (process.env.BACKEND_URL || DEFAULT_BASE).replace(/\/+$/, "");
const timeoutMs = Number(process.env.BACKEND_CHECK_TIMEOUT_MS || 5000);

function parseArgs(argv) {
	const out = { expectHealth: undefined, expectReady: undefined };
	for (const a of argv) {
		if (a.startsWith("--expect-health=")) out.expectHealth = Number(a.split("=", 2)[1]);
		if (a.startsWith("--expect-ready=")) out.expectReady = Number(a.split("=", 2)[1]);
	}
	return out;
}

async function fetchWithTimeout(url) {
	const ac = new AbortController();
	const t = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);
	try {
		// Node 18+ has global fetch
		return await fetch(url, { signal: ac.signal, headers: { "accept": "application/json, text/plain;q=0.9, */*;q=0.1" } });
	} finally {
		clearTimeout(t);
	}
}

async function readBody(res) {
	const ct = (res.headers.get("content-type") || "").toLowerCase();
	const text = await res.text();
	if (ct.includes("application/json")) {
		try { return { kind: "json", value: JSON.parse(text), raw: text }; }
		catch { return { kind: "text", value: text, raw: text }; }
	}
	// attempt JSON anyway if it looks like JSON
	if (/^\s*[{[]/.test(text)) {
		try { return { kind: "json", value: JSON.parse(text), raw: text }; }
		catch { /* fall through */ }
	}
	return { kind: "text", value: text, raw: text };
}

function printResult(label, url, res, body) {
	process.stdout.write(`\n[${label}] ${url}\n`);
	process.stdout.write(`status: ${res.status}\n`);
	if (body.kind === "json") {
		process.stdout.write(`content-type: ${res.headers.get("content-type") || "unknown"}\n`);
		process.stdout.write(`body(json): ${JSON.stringify(body.value, null, 2)}\n`);
	} else {
		process.stdout.write(`content-type: ${res.headers.get("content-type") || "unknown"}\n`);
		process.stdout.write(`body(text): ${String(body.value).slice(0, 4000)}\n`);
	}
}

function assertStatus(label, actual, expected) {
	if (expected === undefined) return;
	if (actual !== expected) {
		throw new Error(`${label} expected HTTP ${expected} but got ${actual}`);
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const healthUrl = `${baseUrl}/api/health`;
	const readyUrl = `${baseUrl}/api/ready`;

	try {
		const healthRes = await fetchWithTimeout(healthUrl);
		const healthBody = await readBody(healthRes);
		printResult("health", healthUrl, healthRes, healthBody);
		assertStatus("health", healthRes.status, args.expectHealth);

		const readyRes = await fetchWithTimeout(readyUrl);
		const readyBody = await readBody(readyRes);
		printResult("ready", readyUrl, readyRes, readyBody);
		assertStatus("ready", readyRes.status, args.expectReady);

		// Soft validation: readiness should generally be JSON (not enforced; just warn)
		if (readyBody.kind !== "json") {
			process.stdout.write("\nWARN: /api/ready did not return JSON. Consider returning structured readiness details.\n");
		}

		process.stdout.write("\nOK\n");
	} catch (err) {
		process.stderr.write(`\nFAILED: ${err?.message || String(err)}\n`);
		process.stderr.write(
			"\nHints:\n" +
			"- If /api/ready returns 503, check Redis/Postgres env + service reachability.\n" +
			"- If /api/health is protected by auth middleware, it should be excluded.\n" +
			`- Override base URL via BACKEND_URL (current: ${baseUrl}).\n`
		);
		process.exit(1);
	}
}

main();
