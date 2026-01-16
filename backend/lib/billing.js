import { effectiveTenantId } from './tenancy.js'

function monthKey(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function dayKey(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function hourKey(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const h = String(now.getUTCHours()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}`
}

function periodKeyFor(period, now = new Date()) {
  const p = String(period || '').trim().toLowerCase() || 'month'
  if (p === 'hour' || p === 'hourly') return hourKey(now)
  if (p === 'day' || p === 'daily') return dayKey(now)
  return monthKey(now)
}

export function getTenantPlanKey(db, tenantId) {
  const tid = effectiveTenantId(tenantId)
  const row = db
    .prepare(
      `SELECT plan_key
       FROM tenant_plans
       WHERE tenant_id = ? AND status = 'ACTIVE'
       LIMIT 1`
    )
    .get(tid)
  return row?.plan_key || null
}

export function getEntitlement(db, { tenantId, featureKey } = {}) {
  const tid = effectiveTenantId(tenantId)
  const fk = String(featureKey || '').trim()
  if (!fk) return { enabled: false, limit: null }

  const planKey = getTenantPlanKey(db, tid)
  if (!planKey) return { enabled: false, limit: null }

  const row = db
    .prepare(
      `SELECT is_enabled, limit_value
       FROM entitlements
       WHERE plan_key = ? AND feature_key = ?
       LIMIT 1`
    )
    .get(planKey, fk)

  if (!row) return { enabled: false, limit: null }
  return { enabled: !!row.is_enabled, limit: row.limit_value === null || row.limit_value === undefined ? null : Number(row.limit_value) }
}

export function getUsage(db, { tenantId, featureKey, periodKey, period = 'month' } = {}) {
  const tid = effectiveTenantId(tenantId)
  const fk = String(featureKey || '').trim()
  const pk = String(periodKey || '').trim() || periodKeyFor(period)

  const row = db
    .prepare(
      `SELECT count
       FROM usage_counters
       WHERE tenant_id = ? AND feature_key = ? AND period_key = ?`
    )
    .get(tid, fk, pk)

  return Number(row?.count || 0)
}

export function checkUsageLimit(db, { tenantId, featureKey, incrementBy = 1, period = 'month' } = {}) {
  const tid = effectiveTenantId(tenantId)
  const fk = String(featureKey || '').trim()
  const pk = periodKeyFor(period)

  const ent = getEntitlement(db, { tenantId: tid, featureKey: fk })
  if (!ent.enabled) {
    return { ok: false, code: 'FEATURE_DISABLED', message: 'This feature is not enabled for your plan.' }
  }

  const current = getUsage(db, { tenantId: tid, featureKey: fk, periodKey: pk })
  const next = current + Math.max(1, Math.trunc(Number(incrementBy) || 1))

  if (ent.limit !== null && next > ent.limit) {
    return {
      ok: false,
      code: 'LIMIT_REACHED',
      message: `You've reached your plan limit for ${fk}.`,
      limit: ent.limit,
      used: current,
      period: pk,
    }
  }

  return { ok: true, used: current, limit: ent.limit, period: pk }
}

export function incrementUsage(db, { tenantId, featureKey, incrementBy = 1, period = 'month' } = {}) {
  const tid = effectiveTenantId(tenantId)
  const fk = String(featureKey || '').trim()
  const pk = periodKeyFor(period)
  const current = getUsage(db, { tenantId: tid, featureKey: fk, periodKey: pk })
  const next = current + Math.max(1, Math.trunc(Number(incrementBy) || 1))

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO usage_counters (tenant_id, feature_key, period_key, count, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, feature_key, period_key) DO UPDATE
       SET count = excluded.count,
           updated_at = excluded.updated_at`
  ).run(tid, fk, pk, next, now)

  return { ok: true, used: next, period: pk }
}

export function checkAndIncrementUsage(db, { tenantId, featureKey, incrementBy = 1, period = 'month' } = {}) {
  const tid = effectiveTenantId(tenantId)
  const fk = String(featureKey || '').trim()
  const pk = periodKeyFor(period)

  const check = (() => {
    const ent = getEntitlement(db, { tenantId: tid, featureKey: fk })
    if (!ent.enabled) {
      return { ok: false, code: 'FEATURE_DISABLED', message: 'This feature is not enabled for your plan.' }
    }

    const current = getUsage(db, { tenantId: tid, featureKey: fk, periodKey: pk })
    const next = current + Math.max(1, Math.trunc(Number(incrementBy) || 1))

    if (ent.limit !== null && next > ent.limit) {
      return {
        ok: false,
        code: 'LIMIT_REACHED',
        message: `You've reached your plan limit for ${fk}.`,
        limit: ent.limit,
        used: current,
        period: pk,
      }
    }

    return { ok: true, used: current, limit: ent.limit, period: pk }
  })()

  if (!check.ok) return check

  const current = getUsage(db, { tenantId: tid, featureKey: fk, periodKey: pk })
  const next = current + Math.max(1, Math.trunc(Number(incrementBy) || 1))
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO usage_counters (tenant_id, feature_key, period_key, count, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, feature_key, period_key) DO UPDATE
       SET count = excluded.count,
           updated_at = excluded.updated_at`
  ).run(tid, fk, pk, next, now)

  return { ok: true, used: next, limit: check.limit, period: pk }
}
