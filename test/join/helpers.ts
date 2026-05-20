import { database, table, integer } from '../../src/index'
import { makeUsers, makePosts, makeNodes, USERS_SEED, POSTS_SEED } from '../_helpers'

// shared join-test fixtures and Drizzle-correct result readers.
//
// A joined select() resolves to an array of combined row objects. With a flat
// projection the keys are the projection aliases; with an omitted projection
// Drizzle keys each row by table name (`row.users`, `row.posts`). leftJoin
// null-fills the unmatched right side. Row order is unspecified, so readers
// sort before asserting where order is not the behaviour under test.

export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? (r as any[]) : [])

// the join builders live on the select builder; reached untyped so a missing
// method is a runtime honest fail rather than a compile error. Expected
// behaviour follows the correct Drizzle spec regardless of whether bad-dbms
// implements these.
export const innerJoin = (b: any, right: any, on: any) => b.innerJoin(right, on)
export const leftJoin = (b: any, right: any, on: any) => b.leftJoin(right, on)
export const rightJoin = (b: any, right: any, on: any) => b.rightJoin(right, on)
export const fullJoin = (b: any, right: any, on: any) => b.fullJoin(right, on)

// sorts joined rows by a key for order-independent assertions.
export const by = (r: unknown, key: string): any[] =>
        rowsOf(r)
                .slice()
                .sort((a, b) => {
                        const av = a[key]
                        const bv = b[key]
                        if (av === bv) return 0
                        if (av === null || av === undefined) return 1
                        if (bv === null || bv === undefined) return -1
                        return av < bv ? -1 : 1
                })

// the multiset of one column across joined rows.
export const column = (r: unknown, key: string): any[] => rowsOf(r).map((row) => row[key])

// builds one database holding seeded users and posts, the canonical join pair.
// POSTS_SEED: posts 1,2 -> user 1 ; post 3 -> user 2 ; post 4 -> user 3.
export const seedUsersPosts = async () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        await db.insert(users).values(USERS_SEED)
        await db.insert(posts).values(POSTS_SEED)
        return { db, users, posts }
}

// the same pair plus a fourth user who owns no post, so inner and left joins
// diverge: user 4 has no matching post row.
export const seedUsersPostsWithOrphan = async () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        await db.insert(users).values([...USERS_SEED, { id: 4, name: 44, score: 0 }])
        await db.insert(posts).values(POSTS_SEED)
        return { db, users, posts }
}

// three tables for multi-join chaining: users own posts, posts carry tags.
// tagRows: [tagId, postId, label]. POSTS_SEED posts are 1,2,3,4.
export const seedThreeTables = async (tagRows: Array<[number, number, number]>) => {
        const users = makeUsers()
        const posts = makePosts()
        const tags = table('tags', {
                id: integer('id').primaryKey(),
                postId: integer('post_id'),
                label: integer('label'),
        })
        const db = database({ users, posts, tags })
        await db.insert(users).values(USERS_SEED)
        await db.insert(posts).values(POSTS_SEED)
        if (tagRows.length) {
                await db.insert(tags).values(tagRows.map(([id, postId, label]) => ({ id, postId, label })))
        }
        return { db, users, posts, tags }
}

// a parent/child chain in one nodes table for self-join scenarios.
// {id:1,parentId:0} root, {id:2,parentId:1}, {id:3,parentId:2}.
export const seedNodeChain = async () => {
        const nodes = makeNodes()
        const db = database({ nodes })
        await db.insert(nodes).values([
                { id: 1, parentId: 0 },
                { id: 2, parentId: 1 },
                { id: 3, parentId: 2 },
        ])
        return { db, nodes }
}

// builds a generic left/right table pair for matrix-driven join tests.
// left  rows: [{ id, lv }]      right rows: [{ id, fk, rv }]
export const seedPair = async (
        left: Array<[number, number]>,
        right: Array<[number, number, number]>
) => {
        const l = table('l', {
                id: integer('id').primaryKey(),
                lv: integer('lv'),
        })
        const r = table('r', {
                id: integer('id').primaryKey(),
                fk: integer('fk'),
                rv: integer('rv'),
        })
        const db = database({ l, r })
        const lrows = left.map(([id, lv]) => ({ id, lv }))
        const rrows = right.map(([id, fk, rv]) => ({ id, fk, rv }))
        if (lrows.length) await db.insert(l).values(lrows)
        if (rrows.length) await db.insert(r).values(rrows)
        return { db, l, r }
}
