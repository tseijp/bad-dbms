// import { database } from './interface/database'
// import { table } from './interface/table'
// import { uint, float } from './interface/column'
// import { and, between, eq, or, sum } from './interface/sql'

// const W = 16
// const H = 16

// const cells = table('cells', {
//         x: uint('x').order(0, W),
//         y: uint('y').order(0, H),
//         a: float('a').$defaultFn(() => (Math.random() < 0.1 ? 0 : 1)),
// })

// export const setup = async () => {
//         const db = await database({ cells }).all(W * H)
//         const tick = db.transaction(async (tx: any, c: any) => {
//                 const result = await tx
//                         .select({ s: sum(cells.a) })
//                         .from(cells)
//                         .where(
//                                 and(
//                                         between(cells.x, c.x.sub(1), c.x.add(1)), //
//                                         between(cells.y, c.y.sub(1), c.y.add(1)),
//                                 ),
//                         )
//                 const s = (result as any).s ?? 0
//                 await tx
//                         .update(cells)
//                         .set({ a: or(eq(s, 3), and(eq(c.a, 1), eq(s, 4))).toFloat() })
//                         .from(cells)
//                         .where(and(eq(c.x, cells.x), eq(c.y, cells.y)))
//         })
//         return { db, tick }
// }

// export const runTicks = async (n: number) => {
//         const { db, tick } = await setup()
//         for (let i = 0; i < n; i++) await tick.run({})
//         return db
// }

// export { cells }

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
                const rows = (await db.select().from(users).where(eq(users.id, sub)).limit(1)) as unknown[]
                const user = rows[0]
                if (!user) return c.json(null, 403)
                return c.json(user)
        })

export default app
