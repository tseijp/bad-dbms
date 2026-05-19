import { logger } from 'hono/logger'
import { Hono } from 'hono'
import { database } from './interface/database'
import { table } from './interface/table'
import { text, integer } from './interface/column'
import { eq } from './interface/sql'

const storage = new Map()

const db = database({
        read: storage.get,
        write: storage.set,
})

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
        done: integer('done', { mode: 'boolean' }).notNull().default(false),
        updatedAt: integer('updated_at').notNull(),
})

const app = new Hono()
        .use(logger())
        .get('/api/res', (c) => c.text('ok'))
        .get('/api/me', (c) => {
                const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1)
                if (!user) return c.json(null, 403)
                return c.json(user)
        })

export default app
