import { database } from '../../src/interface/database'
import { table } from '../../src/interface/table'
import { integer } from '../../src/interface/column'
import type { TableLike } from '../../src/index'
import type { Row } from '../../src/shared/types'
export const fresh = <S extends TableLike>(make: () => S) => {
        const t = make()
        const db = database({ t })
        return { db, t: db.tables.t as S }
}
export const makeUsers = () =>
        table('users', {
                id: integer('id').primaryKey(),
                name: integer('name').notNull(),
                score: integer('score').default(0),
        })
export const makePosts = () =>
        table('posts', {
                id: integer('id').primaryKey(),
                userId: integer('user_id'),
                score: integer('score').default(0),
        })
export const makeEvents = () =>
        table('events', {
                id: integer('id').primaryKey(),
                kind: integer('kind'),
                v: integer('v'),
        })
export const makeNodes = () =>
        table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id'),
        })
export const USERS_SEED = [
        { id: 1, name: 11, score: 10 },
        { id: 2, name: 22, score: 20 },
        { id: 3, name: 33, score: 30 },
]
export const POSTS_SEED = [
        { id: 1, userId: 1, score: 5 },
        { id: 2, userId: 1, score: 7 },
        { id: 3, userId: 2, score: 9 },
        { id: 4, userId: 3, score: 4 },
]
export const EVENTS_SEED = [
        { id: 1, kind: 0, v: 100 },
        { id: 2, kind: 0, v: 200 },
        { id: 3, kind: 1, v: 300 },
        { id: 4, kind: 1, v: 400 },
        { id: 5, kind: 2, v: 500 },
]
export const seedUsers = async () => {
        const users = makeUsers()
        const db = database({ users })
        await db.insert(users).values(USERS_SEED)
        return { db, users: db.tables.users }
}
export const seedPosts = async () => {
        const posts = makePosts()
        const db = database({ posts })
        await db.insert(posts).values(POSTS_SEED)
        return { db, posts: db.tables.posts }
}
export const seedEvents = async () => {
        const events = makeEvents()
        const db = database({ events })
        await db.insert(events).values(EVENTS_SEED)
        return { db, events: db.tables.events }
}
export const seedUsersPosts = async () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        await db.insert(users).values(USERS_SEED)
        await db.insert(posts).values(POSTS_SEED)
        return { db, users: db.tables.users, posts: db.tables.posts }
}
export const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : [])
export const firstRow = (r: unknown): Row | undefined => rowsOf(r)[0]
export const valuesOf = (r: unknown, key: string): unknown[] => rowsOf(r).map((row) => row[key])
export const keysOf = (r: unknown): string[] => Object.keys(rowsOf(r)[0] ?? {}).sort()
export const scalar = (r: unknown, key: string): unknown => firstRow(r)?.[key]
export const findBy = (r: unknown, key: string, value: unknown): Row | undefined => rowsOf(r).find((row) => row[key] === value)
const compare = (a: unknown, b: unknown): number => {
        if (a === b) return 0
        if (a === null || a === undefined) return 1
        if (b === null || b === undefined) return -1
        return (a as number | string) < (b as number | string) ? -1 : 1
}
export const sortBy = (r: unknown, key: string): Row[] => rowsOf(r).slice().sort((a, b) => compare(a[key], b[key]))
export const idsOf = <T extends { id: number }>(rows: T[]): number[] => rows.map((r) => r.id).sort((a, b) => a - b)
