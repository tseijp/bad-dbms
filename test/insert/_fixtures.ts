import { database } from '../../src/index'
import { makeUsers, makePosts, makeEvents, makeNodes } from '../_helpers'

// freshUsers builds an empty database({ users }) from the shared factory
export const freshUsers = () => {
        const users = makeUsers()
        const db = database({ users })
        return { db, users: db.tables.users }
}

// freshPosts builds an empty database({ posts }) from the shared factory
export const freshPosts = () => {
        const posts = makePosts()
        const db = database({ posts })
        return { db, posts: db.tables.posts }
}

// freshEvents builds an empty database({ events }) from the shared factory
export const freshEvents = () => {
        const events = makeEvents()
        const db = database({ events })
        return { db, events: db.tables.events }
}

// freshNodes builds an empty database({ nodes }) from the shared factory
export const freshNodes = () => {
        const nodes = makeNodes()
        const db = database({ nodes })
        return { db, nodes: db.tables.nodes }
}

// freshUsersPosts builds an empty database({ users, posts }) sharing one connection
export const freshUsersPosts = () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        return { db, users: db.tables.users, posts: db.tables.posts }
}

// freshTarget normalizes any fresh* helper to a { db, t } pair so data-driven
// tables can be exercised without per-test branching
export const freshTarget = (make: () => Record<string, unknown>, key: string) => {
        const built = make()
        return { db: built.db as ReturnType<typeof database>, t: built[key] as ReturnType<typeof makeUsers> }
}
