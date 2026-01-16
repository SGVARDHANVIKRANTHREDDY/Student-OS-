import { getDb, closeDb } from '../lib/db.js'

function usage(exitCode = 1) {
  // Keep output JSON-only on success; usage goes to stderr.
  console.error(`Usage: node ./scripts/list-audit.mjs [options]

Options:
  --tenantId <id|empty>        Tenant id; omit/empty means NULL (default)
  --action <A,B,C>             Filter by action(s)
  --targetType <type>          Filter by target_type
  --targetId <id>              Filter by target_id
  --actorUserId <id>           Filter by actor_user_id
  --limit <n>                  Max rows (default 50, max 200)
`)
  process.exit(exitCode)
}

function parseArgs(argv) {
  const args = {
    tenantId: null,
    actions: null,
    targetType: null,
    targetId: null,
    actorUserId: null,
    limit: 50,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') usage(0)

    const next = () => {
      if (i + 1 >= argv.length) usage(1)
      i++
      return argv[i]
    }

    if (a === '--tenantId') {
      const v = String(next() ?? '').trim()
      args.tenantId = v ? v : null
    } else if (a === '--action') {
      const v = String(next() ?? '').trim()
      args.actions = v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null
    } else if (a === '--targetType') {
      const v = String(next() ?? '').trim()
      args.targetType = v ? v : null
    } else if (a === '--targetId') {
      const v = String(next() ?? '').trim()
      args.targetId = v ? v : null
    } else if (a === '--actorUserId') {
      const v = String(next() ?? '').trim()
      args.actorUserId = v ? v : null
    } else if (a === '--limit') {
      const v = Number(next())
      if (!Number.isFinite(v)) usage(1)
      args.limit = Math.max(1, Math.min(200, v))
    } else {
      console.error(`Unknown arg: ${a}`)
      usage(1)
    }
  }

  return args
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || '')
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

const opts = parseArgs(process.argv.slice(2))
const db = getDb()

try {
  const where = ['tenant_id IS ?']
  const params = [opts.tenantId ? String(opts.tenantId) : null]

  if (opts.actions && opts.actions.length > 0) {
    const placeholders = opts.actions.map(() => '?').join(',')
    where.push(`action IN (${placeholders})`)
    params.push(...opts.actions.map(String))
  }

  if (opts.targetType) {
    where.push('target_type = ?')
    params.push(String(opts.targetType))
  }

  if (opts.targetId) {
    where.push('target_id = ?')
    params.push(String(opts.targetId))
  }

  if (opts.actorUserId) {
    where.push('actor_user_id = ?')
    params.push(String(opts.actorUserId))
  }

  const sql = `
    SELECT id, tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata_json, correlation_id, created_at
    FROM audit_logs
    WHERE ${where.join(' AND ')}
    ORDER BY id DESC
    LIMIT ?
  `
  params.push(opts.limit)

  const rows = db.prepare(sql).all(...params)

  const normalized = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id ?? null,
    actorType: r.actor_type,
    actorUserId: r.actor_user_id ?? null,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id ?? null,
    metadata: safeJsonParse(r.metadata_json, {}),
    correlationId: r.correlation_id ?? null,
    createdAt: r.created_at,
  }))

  process.stdout.write(JSON.stringify({ items: normalized }))
} finally {
  closeDb()
}
