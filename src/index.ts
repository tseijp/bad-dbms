// src/index.tsx
import { Hono } from 'hono'
export default new Hono().get('/api/res', (c) => c.text('ok'))
