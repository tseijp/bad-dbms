import { describe, it, expect } from 'vitest'
import { createLockManager } from '../../../src/backend/storage/lmng'

const settle = async () => {
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
}

describe('lmng', () => {
        it('resolves acquireLock immediately when the tag is not held', async () => {
                const lm = createLockManager()
                let resolved = false
                lm.acquireLock('t', 'shared', 1).then(() => (resolved = true))
                await settle()
                expect(resolved).toBe(true)
        })

        it('resolves a second shared acquire immediately while the first is held', async () => {
                const lm = createLockManager()
                await lm.acquireLock('t', 'shared', 1)
                let resolved = false
                lm.acquireLock('t', 'shared', 2).then(() => (resolved = true))
                await settle()
                expect(resolved).toBe(true)
        })

        it('keeps an exclusive waiter pending while a shared lock is held', async () => {
                const lm = createLockManager()
                await lm.acquireLock('t', 'shared', 1)
                let resolved = false
                lm.acquireLock('t', 'exclusive', 2).then(() => (resolved = true))
                await settle()
                expect(resolved).toBe(false)
        })

        it('resolves an exclusive waiter once the shared holder releases', async () => {
                const lm = createLockManager()
                await lm.acquireLock('t', 'shared', 1)
                let resolved = false
                lm.acquireLock('t', 'exclusive', 2).then(() => (resolved = true))
                lm.releaseLock('t', 1)
                await settle()
                expect(resolved).toBe(true)
        })

        it('keeps a shared waiter pending while an exclusive lock is held', async () => {
                const lm = createLockManager()
                await lm.acquireLock('t', 'exclusive', 1)
                let resolved = false
                lm.acquireLock('t', 'shared', 2).then(() => (resolved = true))
                await settle()
                expect(resolved).toBe(false)
        })

        it('keeps an exclusive waiter pending while another exclusive lock is held', async () => {
                const lm = createLockManager()
                await lm.acquireLock('t', 'exclusive', 1)
                let resolved = false
                lm.acquireLock('t', 'exclusive', 2).then(() => (resolved = true))
                await settle()
                expect(resolved).toBe(false)
        })

        it('resolves all waiters after releaseAll for the holder xid', async () => {
                const lm = createLockManager()
                await lm.acquireLock('t', 'exclusive', 1)
                let resolved = false
                lm.acquireLock('t', 'exclusive', 2).then(() => (resolved = true))
                lm.releaseAll(1)
                await settle()
                expect(resolved).toBe(true)
        })

        it('rejects the youngest xid forming a cycle with deadlock', async () => {
                const lm = createLockManager()
                await lm.acquireLock('a', 'exclusive', 1)
                await lm.acquireLock('b', 'exclusive', 2)
                const w1 = lm.acquireLock('b', 'exclusive', 1)
                let rejected: any = null
                lm.acquireLock('a', 'exclusive', 2).catch((e) => (rejected = e))
                await settle()
                lm.releaseAll(2)
                await w1
                expect(rejected?.message).toBe('deadlock')
        })

        it('grants a read latch and returns true', () => {
                const lm = createLockManager()
                expect(lm.acquireLatch('t', 'read')).toBe(true)
        })

        it('allows multiple concurrent read latches on the same tag', () => {
                const lm = createLockManager()
                lm.acquireLatch('t', 'read')
                expect(lm.acquireLatch('t', 'read')).toBe(true)
        })

        it('refuses a write latch while a read latch is held', () => {
                const lm = createLockManager()
                lm.acquireLatch('t', 'read')
                expect(lm.acquireLatch('t', 'write')).toBe(false)
        })

        it('refuses a write latch while another write latch is held', () => {
                const lm = createLockManager()
                lm.acquireLatch('t', 'write')
                expect(lm.acquireLatch('t', 'write')).toBe(false)
        })

        it('allows acquiring a write latch after the previous holder releases', () => {
                const lm = createLockManager()
                lm.acquireLatch('t', 'write')
                lm.releaseLatch('t', 'write')
                expect(lm.acquireLatch('t', 'write')).toBe(true)
        })

        it('decrements the read latch counter on releaseLatch', () => {
                const lm = createLockManager()
                lm.acquireLatch('t', 'read')
                lm.acquireLatch('t', 'read')
                lm.releaseLatch('t', 'read')
                expect(lm.acquireLatch('t', 'write')).toBe(false)
        })
})
