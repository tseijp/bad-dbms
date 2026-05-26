import { table, integer, text } from '../../src/index'
export const makeScored = () =>
        table('scored', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
export const makeRanked = () =>
        table('ranked', {
                id: integer('id').primaryKey(),
                rank: integer('rank'),
                score: integer('score'),
        })
export const makeNullable = () =>
        table('nullable', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
export const makeNamed = () =>
        table('named', {
                id: integer('id').primaryKey(),
                name: text('name'),
        })
export const seqOf = (rows: Record<string, unknown>[], key: string) => rows.map((r) => r[key]) as number[]
