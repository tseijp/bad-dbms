import { database } from '../../src/index'
import { makeUsers, makePosts, makeEvents, makeNodes } from '../_helpers'
export const freshUsers = () => {
        const users = makeUsers()
        const db = database({ users })
        return { db, users: db.tables.users }
}
export const freshPosts = () => {
        const posts = makePosts()
        const db = database({ posts })
        return { db, posts: db.tables.posts }
}
export const freshEvents = () => {
        const events = makeEvents()
        const db = database({ events })
        return { db, events: db.tables.events }
}
export const freshNodes = () => {
        const nodes = makeNodes()
        const db = database({ nodes })
        return { db, nodes: db.tables.nodes }
}
export const freshUsersPosts = () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        return { db, users: db.tables.users, posts: db.tables.posts }
}
