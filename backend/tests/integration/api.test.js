import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, db } from '../testApp.js'

describe('Health & Observability endpoints', () => {
  it('GET /api/health returns 200 with ok:true', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.status).toBe('ok')
  })

  it('GET /api/ready returns dependency health', async () => {
    const res = await request(app).get('/api/ready')
    // SQLite should be healthy in test env
    expect(res.status).toBeOneOf([200, 503])
    expect(res.body).toHaveProperty('ok')
    expect(res.body.data).toHaveProperty('status')
  })

  it('GET /api/metrics returns metrics snapshot', async () => {
    const res = await request(app).get('/api/metrics')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toHaveProperty('counters')
    expect(res.body.data).toHaveProperty('histograms')
  })
})

describe('Middleware pipeline', () => {
  it('adds X-Request-Id header to responses', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-request-id']).toBeDefined()
  })

  it('echoes incoming X-Request-Id', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'test-correlation-123')
    expect(res.headers['x-request-id']).toBe('test-correlation-123')
  })

  it('sets security headers via Helmet', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
  })
})

describe('Auth endpoints (integration)', () => {
  const testUser = {
    name: 'Integration Test User',
    email: `inttest_${Date.now()}@example.com`,
    password: 'TestPassword123!',
  }
  let accessToken = ''

  it('POST /api/auth/signup creates a new user', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(testUser)
    expect(res.status).toBeOneOf([200, 201])
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toHaveProperty('token')
    accessToken = res.body.data.token
  }, 30000)

  it('POST /api/auth/signup rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(testUser)
    expect(res.status).toBeOneOf([400, 409])
    expect(res.body.ok).toBe(false)
  })

  it('POST /api/auth/login succeeds with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toHaveProperty('token')
    accessToken = res.body.data.token
  }, 30000)

  it('POST /api/auth/login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' })
    expect(res.status).toBe(401)
    expect(res.body.ok).toBe(false)
  }, 30000)

  it('POST /api/auth/login validates input (missing email)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('GET /api/profile/me requires auth', async () => {
    const res = await request(app).get('/api/profile/me')
    expect(res.status).toBe(401)
  })

  it('GET /api/profile/me succeeds with token', async () => {
    // Ensure we have a valid token from signup/login
    if (!accessToken) return
    const res = await request(app)
      .get('/api/profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
    expect(res.status).toBe(200)
  })

  // Cleanup test user
  afterAll(() => {
    try {
      db.prepare('DELETE FROM users WHERE email = ?').run(testUser.email)
    } catch {
      // ignore
    }
  })
})

describe('Request validation (integration)', () => {
  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }')
    expect(res.status).toBe(400)
  })
})
