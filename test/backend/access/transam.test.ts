import { describe, it, expect } from 'vitest'
import { createTransam } from '../../../src/backend/access/transam'

describe('transam', () => {
        it('begin() returns a new xid that is in_progress in the clog', () => {
                const tx = createTransam({ firstXid: 100 })
                const state = tx.begin()
                expect(tx.xidStatus(state.xid)).toBe('in_progress')
        })

        it('returns monotonically increasing xids across consecutive begin / commit cycles', () => {
                const tx = createTransam({ firstXid: 100 })
                const a = tx.begin().xid
                tx.commit()
                const b = tx.begin().xid
                tx.commit()
                const c = tx.begin().xid
                expect(b).toBeGreaterThan(a)
                expect(c).toBeGreaterThan(b)
        })

        it('marks the prior xid as committed and clears current() after commit', () => {
                const tx = createTransam()
                const state = tx.begin()
                tx.commit()
                expect(tx.xidStatus(state.xid)).toBe('committed')
                expect(tx.current()).toBeNull()
        })

        it('marks the prior xid as aborted and clears current() after abort', () => {
                const tx = createTransam()
                const state = tx.begin()
                tx.abort()
                expect(tx.xidStatus(state.xid)).toBe('aborted')
                expect(tx.current()).toBeNull()
        })

        it('exposes xmin / xmax / xip / cid / takenAt with xip as a Set reflecting active top xids', () => {
                const tx = createTransam({ firstXid: 100 })
                const a = tx.begin()
                const snap = tx.snapshot()
                expect(snap.xip instanceof Set).toBe(true)
                expect(snap.xmin).toBe(a.xid)
                expect(snap.xmax).toBeGreaterThan(a.xid)
                expect(snap.xip.has(a.xid)).toBe(true)
        })

        it('keeps snapshot fields frozen against later begin / commit / abort of other transactions', () => {
                const tx = createTransam({ firstXid: 100 })
                const a = tx.begin()
                const snap = tx.snapshot()
                tx.commit()
                const b = tx.begin()
                tx.commit()
                tx.begin()
                tx.abort()
                expect(snap.xip.has(a.xid)).toBe(true)
                expect(snap.xip.has(b.xid)).toBe(false)
                expect(snap.xmax).toBeLessThanOrEqual(b.xid)
        })

        it('isVisible returns true for xid < xmin when the clog says committed', () => {
                const tx = createTransam({ firstXid: 100 })
                const a = tx.begin()
                const aXid = a.xid
                tx.commit()
                const b = tx.begin()
                const snap = tx.snapshot()
                expect(snap.xmin).toBe(b.xid)
                expect(tx.isVisible(aXid, snap)).toBe(true)
        })

        it('isVisible returns false for xid >= xmax or for xids in xip', () => {
                const tx = createTransam({ firstXid: 100 })
                const a = tx.begin()
                const snap = tx.snapshot()
                expect(tx.isVisible(a.xid, snap)).toBe(false)
                expect(tx.isVisible(snap.xmax + 5, snap)).toBe(false)
        })

        it('savepoint creates a sub-state with parent linked to the previous current()', () => {
                const tx = createTransam()
                const root = tx.begin()
                const sp = tx.savepoint('s1')
                expect(sp?.parent).toBe(root)
                expect(tx.current()).toBe(sp)
        })

        it('releaseSavepoint and rollbackSavepoint return current() to the parent state', () => {
                const tx = createTransam()
                const root = tx.begin()
                tx.savepoint('s1')
                tx.releaseSavepoint()
                expect(tx.current()).toBe(root)
                tx.savepoint('s2')
                tx.rollbackSavepoint()
                expect(tx.current()).toBe(root)
        })

        it('xidStatus returns the current clog status of a known xid', () => {
                const tx = createTransam()
                const state = tx.begin()
                expect(tx.xidStatus(state.xid)).toBe('in_progress')
                tx.commit()
                expect(tx.xidStatus(state.xid)).toBe('committed')
        })

        // Roadmap (access.md trailing comment): page checksum verification, parallel
        // worker thread lock/latch wiring, vacuum / squeeze, and nbtree merge / borrow
        // are intentionally outside the current test list.
})
