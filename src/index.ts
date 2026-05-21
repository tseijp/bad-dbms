export * from './interface/expressions/conditions'
export * from './interface/expressions/select'
export * from './interface/functions/aggregate'
export * from './interface/functions/vector'
export * from './interface/column'
export * from './interface/introspect'
export * from './interface/compile'
export * from './interface/database'
export * from './interface/plan'
export * from './interface/sql'
export * from './interface/table'
export * from './interface/types'

import { logger } from 'hono/logger'
import { Hono } from 'hono'
import { database } from './interface/database'
import { table } from './interface/table'
import { text, integer } from './interface/column'
import { eq } from './interface/sql'

const users = table('users', {
        id: text('id')
                .primaryKey()
                .defaultFn(() => crypto.randomUUID()),
        name: text('name'),
        email: text('email').unique(),
        image: text('image'),
})

export const todos = table('todos', {
        id: text('id').primaryKey(),
        userId: text('user_id')
                .notNull()
                .references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        done: integer('done').notNull().default(0),
        updatedAt: integer('updated_at').notNull(),
})

const db = database({ users, todos })

const app = new Hono()
        .use(logger())
        .get('/api/res', (c) => c.text('ok'))
        .get('/api/me', async (c) => {
                const sub = ''
                const rows = await db.select().from(users).where(eq(users.id, sub)).limit(1)
                const user = rows[0]
                if (!user) return c.json(null, 403)
                return c.json(user)
        })

export default app
