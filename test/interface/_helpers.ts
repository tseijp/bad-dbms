import { database } from '../../src/interface/database'
import { table } from '../../src/interface/table'
import { integer, float, text, uint } from '../../src/interface/column'
import type { SQL, SqlNode, BinOp, UnOp, AggKind } from '../../src/shared/types'
export const lit = (value: unknown): SQL => ({ kind: 'sql', node: { type: 'literal', value } }) as SQL
export const col = (name: string, tableName?: string): SQL => ({ kind: 'sql', node: { type: 'column', name, dataType: 'i32', tableName } }) as SQL
export const bin = (op: BinOp, ...args: SQL[]): SQL => ({ kind: 'sql', node: { type: 'binop', op, args } }) as SQL
export const un = (op: UnOp, arg: SQL): SQL => ({ kind: 'sql', node: { type: 'unop', op, args: [arg] } }) as SQL
export const fn = (name: string, ...args: SQL[]): SQL => ({ kind: 'sql', node: { type: 'func', name, args } }) as SQL
export const agg = (name: AggKind, distinct: boolean, ...args: SQL[]): SQL => ({ kind: 'sql', node: { type: 'aggregate', name, distinct, args } }) as SQL
export const order = (dir: 'asc' | 'desc', c: SQL): SQL => ({ kind: 'sql', node: { type: 'order', dir, col: c } }) as SQL
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
