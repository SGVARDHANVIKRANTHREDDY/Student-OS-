import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  incrementCounter,
  recordHistogram,
  getMetricsSnapshot,
} from '../../lib/metrics.js'

describe('Metrics module', () => {
  it('increments counters', () => {
    incrementCounter('test_counter', { method: 'GET' }, 1)
    incrementCounter('test_counter', { method: 'GET' }, 1)
    const snap = getMetricsSnapshot()
    const key = 'test_counter|{"method":"GET"}'
    expect(snap.counters[key]).toBeGreaterThanOrEqual(2)
  })

  it('records histogram values', () => {
    recordHistogram('test_latency', 10, { route: '/api' })
    recordHistogram('test_latency', 20, { route: '/api' })
    recordHistogram('test_latency', 30, { route: '/api' })
    const snap = getMetricsSnapshot()
    const key = 'test_latency|{"route":"/api"}'
    expect(snap.histograms[key]).toBeDefined()
    expect(snap.histograms[key].count).toBeGreaterThanOrEqual(3)
    expect(snap.histograms[key].min).toBeLessThanOrEqual(10)
    expect(snap.histograms[key].max).toBeGreaterThanOrEqual(30)
    expect(snap.histograms[key].avg).toBeGreaterThan(0)
    expect(snap.histograms[key].p50).toBeDefined()
    expect(snap.histograms[key].p95).toBeDefined()
    expect(snap.histograms[key].p99).toBeDefined()
  })
})
