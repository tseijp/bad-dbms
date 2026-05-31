import { database, table, integer } from '../../src/index'
import { makeUsers, makePosts, makeNodes, USERS_SEED, POSTS_SEED } from '../_helpers'
export const seedUsersPostsWithOrphan = async () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        await db.insert(users).values([...USERS_SEED, { id: 4, name: 44, score: 0 }])
        await db.insert(posts).values(POSTS_SEED)
        return { db, users: db.tables.users, posts: db.tables.posts }
}
export const seedThreeTables = async (tagRows: number[][]) => {
        const users = makeUsers()
        const posts = makePosts()
        const tags = table('tags', { id: integer('id').primaryKey(), postId: integer('post_id'), label: integer('label') })
        const db = database({ users, posts, tags })
        await db.insert(users).values(USERS_SEED)
        await db.insert(posts).values(POSTS_SEED)
        if (tagRows.length) await db.insert(tags).values(tagRows.map(([id, postId, label]) => ({ id, postId, label })))
        return { db, users: db.tables.users, posts: db.tables.posts, tags: db.tables.tags }
}
export const seedNodeChain = async () => {
        const nodes = makeNodes()
        const db = database({ nodes })
        await db.insert(nodes).values([
                { id: 1, parentId: 0 },
                { id: 2, parentId: 1 },
                { id: 3, parentId: 2 },
        ])
        return { db, nodes: db.tables.nodes }
}
export const seedPair = async (left: number[][], right: number[][]) => {
        const l = table('l', { id: integer('id').primaryKey(), lv: integer('lv') })
        const r = table('r', { id: integer('id').primaryKey(), fk: integer('fk'), rv: integer('rv') })
        const db = database({ l, r })
        const lrows = left.map(([id, lv]) => ({ id, lv }))
        const rrows = right.map(([id, fk, rv]) => ({ id, fk, rv }))
        if (lrows.length) await db.insert(l).values(lrows)
        if (rrows.length) await db.insert(r).values(rrows)
        return { db, l: db.tables.l, r: db.tables.r }
}
