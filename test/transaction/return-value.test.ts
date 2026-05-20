import { describe, it, expect } from 'vitest'
import { fresh, seeded, idsOf } from './_fixtures'

describe('the value a transaction callback returns is propagated', () => {
        // await db.transaction(fn) resolves to whatever the callback
        // returned, so a transaction can compute and hand back a value.
        it.each([[0], [1], [42], [12345], [-7]])('a callback returning the number %i makes the transaction resolve to it', async (value) => {
                const { db } = fresh()
                const result = await db.transaction(async () => value)
                expect(result).toBe(value)
        })

        it('a callback returning an object resolves the transaction to that object', async () => {
                const { db } = fresh()
                const result = await db.transaction(async () => ({ ok: true, n: 3 }))
                expect(result).toEqual({ ok: true, n: 3 })
        })

        it('a callback returning rows read inside the transaction resolves to those rows', async () => {
                const { db, t } = await seeded()
                const result = await db.transaction(async (tx) => {
                        return tx.select().from(t)
                })
                expect(idsOf(result as { id: number }[])).toEqual([1, 2, 3])
        })

        it('a callback that returns nothing resolves the transaction to undefined', async () => {
                const { db } = fresh()
                const result = await db.transaction(async () => undefined)
                expect(result).toBeUndefined()
        })

        it('a rolled-back transaction does not resolve to a callback value', async () => {
                const { db } = fresh()
                const result = await db
                        .transaction(async () => {
                                throw new Error('abort')
                        })
                        .catch(() => 'rejected')
                // a thrown transaction rejects; it must not resolve to a value
                expect(result).toBe('rejected')
        })
})
