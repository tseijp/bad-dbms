import { database } from '../../src/interface/database'
import { table } from '../../src/interface/table'
import { integer } from '../../src/interface/column'
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
