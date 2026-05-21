import { describe, it, expect } from 'vitest'
import { database } from '../../src/index'
import { makeUsers, makeEvents, USERS_SEED } from '../_helpers'
import { rowsOf, valuesOf, keysOf, seedUsers, seedLabels, LABELS } from './helpers'

// select rework: query isolation. Each select() call is an independent query
// — a projection from one read never leaks into the next, and two tables on
// one connection are read without cross-talk.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a projected select() never mutates the table or a later bare select.
//   * two projections on one connection keep their own distinct key sets.
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.

describe('query isolation on one connection', () => {
        it('keeps a narrow then wide read independent with no projection leak', async () => {
                const { db, users } = await seedUsers()
                const narrow = await db.select({ id: users.id }).from(users)
                const wide = await db.select().from(users)
                expect([keysOf(narrow), keysOf(wide)]).toEqual([['id'], ['id', 'name', 'score']])
        })

        it('keeps a wide then narrow read independent', async () => {
                const { db, users } = await seedUsers()
                const wide = await db.select().from(users)
                const narrow = await db.select({ score: users.score }).from(users)
                expect([keysOf(wide), keysOf(narrow)]).toEqual([['id', 'name', 'score'], ['score']])
        })

        it('returns the same length from three repeated full reads', async () => {
                const { db, users } = await seedUsers()
                const a = await db.select().from(users)
                const b = await db.select().from(users)
                const c = await db.select().from(users)
                expect([rowsOf(a).length, rowsOf(b).length, rowsOf(c).length]).toEqual([3, 3, 3])
        })

        it('keeps two differently-aliased projections from interfering', async () => {
                const { db, users } = await seedUsers()
                const first = await db.select({ point: users.score }).from(users)
                const second = await db.select({ score: users.score }).from(users)
                expect([keysOf(first), keysOf(second)]).toEqual([['point'], ['score']])
        })

        it('reads a fresh full result after an expression projection on the same db', async () => {
                const { db, users } = await seedUsers()
                await db.select({ d: users.score.mul(2) }).from(users)
                const rows = await db.select().from(users)
                expect(rowsOf(rows)[0]).toEqual({ id: 1, name: 11, score: 10 })
        })

        it('does not mutate stored rows when a projection is run', async () => {
                const { db, users } = await seedUsers()
                await db.select({ x: users.score.add(1000) }).from(users)
                const rows = await db.select({ score: users.score }).from(users)
                expect(valuesOf(rows, 'score')).toEqual([10, 20, 30])
        })

        it('lets two tables in one database be read without cross-talk', async () => {
                const users = makeUsers()
                const events = makeEvents()
                const db = database({ users, events })
                await db.insert(users).values(USERS_SEED)
                const userRows = await db.select().from(db.tables.users)
                const eventRows = await db.select().from(db.tables.events)
                expect([rowsOf(userRows).length, rowsOf(eventRows).length]).toEqual([3, 0])
        })

        it('keeps an integer table and a text table independent on one connection', async () => {
                const { db, items } = await seedLabels(LABELS)
                const itemRows = await db.select({ label: items.label }).from(items)
                expect(valuesOf(itemRows, 'label')).toEqual(['alpha', 'beta', 'gamma'])
        })

        it.each([1, 2, 3, 4])('returns a stable result on read number %i of a repeated query', async (_n) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id }).from(users)
                expect(valuesOf(rows, 'id')).toEqual([1, 2, 3])
        })

        it('runs a projection, a bare read, and another projection in sequence cleanly', async () => {
                const { db, users } = await seedUsers()
                const a = await db.select({ id: users.id }).from(users)
                const b = await db.select().from(users)
                const c = await db.select({ name: users.name }).from(users)
                expect([keysOf(a), keysOf(b), keysOf(c)]).toEqual([
                        ['id'],
                        ['id', 'name', 'score'],
                        ['name'],
                ])
        })

        it('seeds, reads, mutates through update, then a later select sees the change', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select({ score: users.score }).from(users)
                await db.update(users).set({ score: 0 }).where(users.id.eq(1))
                const after = await db.select({ score: users.score }).from(users)
                expect([valuesOf(before, 'score'), valuesOf(after, 'score')]).toEqual([
                        [10, 20, 30],
                        [0, 20, 30],
                ])
        })
})
