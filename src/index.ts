import { Hono } from 'hono'
import { createCloudflareAdapter } from './backend/adapter/cloudflare'
import { database } from './interface/database'
import { table } from './interface/table'
import { integer, text } from './interface/column'

export * from './interface/expressions/conditions'
export * from './interface/expressions/select'
export * from './interface/functions/aggregate'
export * from './interface/column'
export * from './interface/introspect'
export * from './interface/compile'
export * from './interface/database'
export * from './interface/plan'
export * from './interface/sql'
export * from './interface/table'
export * from './interface/types'

interface Env {
        KV: any
}

const users = table('users', {
        id: integer().primaryKey(),
        name: text().notNull(),
        age: integer(),
})

const tables = { users }

const dbOf = (env: Env) => database(tables, { file: createCloudflareAdapter(env.KV) })

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => c.json({ error: String(err?.stack || err) }, 500))

app.get('/users', async (c) => {
        const rows = await dbOf(c.env).select().from(users)
        return c.json(rows)
})

app.get('/users/:id', async (c) => {
        const id = Number(c.req.param('id'))
        const rows = await dbOf(c.env).select().from(users).where(users.id.eq(id))
        const row = rows[0]
        if (!row) return c.json({ error: 'not found' }, 404)
        return c.json(row)
})

app.post('/users', async (c) => {
        const body = (await c.req.json()) as { id: number; name: string; age?: number }
        const [row] = await dbOf(c.env)
                .insert(users)
                .values(body as any)
                .returning()
        return c.json(row, 201)
})

app.patch('/users/:id', async (c) => {
        const id = Number(c.req.param('id'))
        const body = (await c.req.json()) as Partial<{ name: string; age: number }>
        const [row] = await dbOf(c.env).update(users).set(body).where(users.id.eq(id)).returning()
        if (!row) return c.json({ error: 'not found' }, 404)
        return c.json(row)
})

app.delete('/users/:id', async (c) => {
        const id = Number(c.req.param('id'))
        const [row] = await dbOf(c.env).delete(users).where(users.id.eq(id)).returning()
        if (!row) return c.json({ error: 'not found' }, 404)
        return c.json(row)
})

export default app
