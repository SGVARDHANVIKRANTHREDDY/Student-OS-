-- Learning resources (Postgres) for scalable search + cursor pagination.

CREATE TABLE IF NOT EXISTS learning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(url, '')), 'C')
    ) STORED,
  UNIQUE (tenant_id, url)
);

CREATE INDEX IF NOT EXISTS idx_learning_resources_tenant_created
  ON learning_resources (tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_learning_resources_search_tsv
  ON learning_resources USING GIN (search_tsv);

-- Seed from the existing in-memory learning database (backend/routes/learning.js).
-- Default tenant only; other tenants can be seeded later via admin tooling.
INSERT INTO learning_resources (tenant_id, title, url) VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'DOM Reference', 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Fetch API Docs', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'MDN JavaScript Guide', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'AWS Documentation', 'https://docs.aws.amazon.com/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'API Gateway', 'https://docs.aws.amazon.com/apigateway/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'AWS Auto Scaling', 'https://docs.aws.amazon.com/autoscaling/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'AWS CodePipeline', 'https://docs.aws.amazon.com/codepipeline/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'AWS EC2 Guide', 'https://docs.aws.amazon.com/ec2/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'AWS Lambda Guide', 'https://docs.aws.amazon.com/lambda/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Docker Official Docs', 'https://docs.docker.com/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Docker Compose Guide', 'https://docs.docker.com/compose/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Container Best Practices', 'https://docs.docker.com/develop/dev-best-practices/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Dockerfile Reference', 'https://docs.docker.com/engine/reference/builder/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Docker Security', 'https://docs.docker.com/engine/security/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Docker Networking', 'https://docs.docker.com/network/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Pytest Documentation', 'https://docs.pytest.org/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Python Official Docs', 'https://docs.python.org/3/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Async IO Guide', 'https://docs.python.org/3/library/asyncio.html'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'OOP in Python', 'https://docs.python.org/3/tutorial/classes.html'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Express.js Guide', 'https://expressjs.com/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Node.js Best Practices', 'https://github.com/goldbergyoni/nodebestpractices'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'ES6+ Features Guide', 'https://github.com/lukehoban/es6features'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'JavaScript.info Fundamentals', 'https://javascript.info/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Async/Await Tutorial', 'https://javascript.info/async-await'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Testing Node.js Apps', 'https://jestjs.io/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Advanced SQL', 'https://mode.com/sql-tutorial/advanced/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Node.js Event Emitter', 'https://nodejs.org/api/events.html'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Node.js Official Docs', 'https://nodejs.org/docs/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'React Official Docs', 'https://react.dev'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Advanced React Patterns', 'https://react.dev/learn'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Custom Hooks Guide', 'https://react.dev/learn/reusing-logic-with-custom-hooks'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'React Hooks Guide', 'https://react.dev/reference/react/hooks'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Performance Optimization', 'https://react.dev/reference/react/memo'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Real Python Tutorials', 'https://realpython.com/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Requests Library', 'https://requests.readthedocs.io/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'REST API Best Practices', 'https://restfulapi.net/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'SQL Tutorial', 'https://sqlzoo.net/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'React Testing Guide', 'https://testing-library.com/react'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Query Optimization', 'https://use-the-index-luke.com/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'JavaScript Design Patterns', 'https://www.patterns.dev/posts/classic-design-patterns/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Database Design', 'https://www.postgresql.org/docs/'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Database Tuning', 'https://www.postgresql.org/docs/current/performance.html'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Stored Procedures Guide', 'https://www.postgresql.org/docs/current/sql-syntax.html')
ON CONFLICT (tenant_id, url) DO NOTHING;
