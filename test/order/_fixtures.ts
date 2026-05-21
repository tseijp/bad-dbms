import { database, table, integer, text } from '../../src/index'

// A table whose rows are inserted in a deliberately scrambled order so that
// any observed ordering is the work of orderBy, never of insertion order.
export const makeScored = () =>
        table('scored', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })

// A two-key table for tie-breaking scenarios: rank groups rows, score orders
// within a group.
export const makeRanked = () =>
        table('ranked', {
                id: integer('id').primaryKey(),
                rank: integer('rank'),
                score: integer('score'),
        })

// A table with a nullable score column, used to attack how orderBy places
// NULL values — a Drizzle / SQL contract bad-dbms cannot meet by coercing a
// missing value to 0.
export const makeNullable = () =>
        table('nullable', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })

// A table with a text column, used to attack lexicographic ordering of
// strings.
export const makeNamed = () =>
        table('named', {
                id: integer('id').primaryKey(),
                name: text('name'),
        })

// fresh builds an empty single-table database from a factory.
export const fresh = <S extends ReturnType<typeof makeScored>>(make: () => S) => {
        const t = make()
        const db = database({ t })
        return { db, t: db.tables.t as S }
}

// seqOf reads one column out of a result row list, preserving result order.
export const seqOf = (rows: Record<string, unknown>[], key: string) => rows.map((r) => r[key])
