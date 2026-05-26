import { Hono } from 'hono'
import { createCloudflareAdapter } from './backend/adapter/cloudflare'
import { database, table, integer, text } from './interface'
export * from './interface'
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
        const body = await c.req.json()
        const [row] = await dbOf(c.env).insert(users).values(body).returning()
        return c.json(row, 201)
})

app.patch('/users/:id', async (c) => {
        const id = Number(c.req.param('id'))
        const body = await c.req.json()
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
