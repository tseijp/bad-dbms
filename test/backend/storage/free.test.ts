import { describe, it, expect } from 'vitest'
import { createFreeSpaceMap } from '../../../src/backend/storage/free'
import { makeFakeSmgr } from './_helpers'
describe('free', () => {
        it('returns -1 from findPage on a fresh (relId, forkId)', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                expect(fsm.findPage(1, 0, 32)).toBe(-1)
        })
        it('returns the blockNo that smgr.extend allocated', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                const blockNo = fsm.extend(1, 0)
                expect(blockNo).toBe(0)
        })
        it('initializes the newly extended block at the maximum free value', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                const blockNo = fsm.extend(1, 0)
                expect(fsm.findPage(1, 0, 4080)).toBe(blockNo)
        })
        it('returns the block whose free value satisfies the request after update', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                fsm.extend(1, 0)
                fsm.update(1, 0, 0, 64)
                expect(fsm.findPage(1, 0, 32)).toBe(0)
        })
        it('returns -1 when no block satisfies the requested free bytes', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                fsm.extend(1, 0)
                fsm.update(1, 0, 0, 16)
                expect(fsm.findPage(1, 0, 1024)).toBe(-1)
        })
        it('keeps upper aggregates consistent with leaf values after an update', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                for (let i = 0; i < 10; i++) fsm.extend(1, 0)
                for (let i = 0; i < 10; i++) fsm.update(1, 0, i, 16)
                fsm.update(1, 0, 7, 4080)
                expect(fsm.findPage(1, 0, 2048)).toBe(7)
        })
        it('returns one of the qualifying blocks when multiple blocks have enough space', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                fsm.extend(1, 0)
                fsm.extend(1, 0)
                fsm.extend(1, 0)
                fsm.update(1, 0, 0, 1024)
                fsm.update(1, 0, 1, 2048)
                fsm.update(1, 0, 2, 1024)
                expect([0, 1, 2]).toContain(fsm.findPage(1, 0, 512))
        })
        it('keeps findPage results isolated per (relId, forkId)', () => {
                const smgr = makeFakeSmgr()
                const fsm = createFreeSpaceMap({ smgr })
                fsm.extend(1, 0)
                fsm.update(1, 0, 0, 16)
                fsm.extend(2, 0)
                fsm.update(2, 0, 0, 4080)
                expect(fsm.findPage(1, 0, 1024)).toBe(-1)
        })
})
