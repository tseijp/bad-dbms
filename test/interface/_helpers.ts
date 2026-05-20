import { database } from '../../src/interface/database'
import { table } from '../../src/interface/table'
import { integer, float, text, uint } from '../../src/interface/column'

export const lit = (value: any) => ({ kind: 'sql', node: { type: 'literal', value } })

export const col = (name: string, tableName?: string) => ({
        kind: 'sql',
        node: { type: 'column', name, dataType: 'i32', tableName },
})

export const bin = (op: string, ...args: any[]) => ({
        kind: 'sql',
        node: { type: 'binop', op, args },
})

export const un = (op: string, arg: any) => ({
        kind: 'sql',
        node: { type: 'unop', op, args: [arg] },
})

export const fn = (name: string, ...args: any[]) => ({
        kind: 'sql',
        node: { type: 'func', name, args },
})

export const agg = (name: string, distinct: boolean, ...args: any[]) => ({
        kind: 'sql',
        node: { type: 'aggregate', name, distinct, args },
})

export const order = (dir: 'asc' | 'desc', c: any) => ({
        kind: 'sql',
        node: { type: 'order', dir, col: c },
})

export const ctx0 = () => ({ current: null, params: null })

export const makeUsersTable = () =>
        table('users', {
                id: integer('id').primaryKey(),
                name: text('name').notNull(),
                email: text('email').unique(),
                score: float('score').default(0),
        })

export const makePostsTable = () =>
        table('posts', {
                id: integer('id').primaryKey(),
                userId: integer('user_id'),
                title: text('title').notNull(),
                score: float('score').default(0),
        })

export const makeDb = () => {
        const users = makeUsersTable()
        const posts = makePostsTable()
        const db = database({ users, posts })
        return { db, users, posts }
}

export const numeric = (name: string) =>
        table(name, {
                id: integer('id').primaryKey(),
                a: integer('a'),
                b: integer('b'),
        })

export { database, table, integer, float, text, uint }
