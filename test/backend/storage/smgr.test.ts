import { describe, it, expect } from 'vitest'
import { createStorageManager } from '../../../src/backend/storage/smgr'
import { createFile, createFileAdapter } from '../../../src/backend/storage/file'
import { fillBytes, PAGE } from './_helpers'
const setup = () => {
        const adapter = createFileAdapter()
        const file = createFile(adapter)
        const smgr = createStorageManager({ file, pageSize: PAGE })
        return { adapter, file, smgr }
}
describe('smgr', () => {
        it('returns a new blockNo from extend and zero-fills the block', () => {
                const { smgr } = setup()
                const blockNo = smgr.extend(1, 0)
                const bytes = smgr.read(1, 0, blockNo)
                const allZero = bytes.every((b) => b === 0)
                expect(allZero).toBe(true)
        })
        it('increases nBlocks by 1 after extend', () => {
                const { smgr } = setup()
                const before = smgr.nBlocks(1, 0)
                smgr.extend(1, 0)
                expect(smgr.nBlocks(1, 0)).toBe(before + 1)
        })
        it('reads back exactly the bytes that were written for a block', () => {
                const { smgr } = setup()
                smgr.extend(1, 0)
                const bytes = fillBytes(PAGE, 7)
                smgr.write(1, 0, 0, bytes)
                const out = smgr.read(1, 0, 0)
                expect(Array.from(out)).toEqual(Array.from(bytes))
        })
        it('keeps writes isolated between distinct (relId, forkId) pairs', () => {
                const { smgr } = setup()
                smgr.extend(1, 0)
                smgr.extend(2, 0)
                const payload = fillBytes(PAGE, 9)
                smgr.write(1, 0, 0, payload)
                const out = smgr.read(2, 0, 0)
                const allZero = out.every((b) => b === 0)
                expect(allZero).toBe(true)
        })
        it('grows different forks of the same relation independently', () => {
                const { smgr } = setup()
                smgr.extend(1, 0)
                smgr.extend(1, 0)
                smgr.extend(1, 1)
                expect(smgr.nBlocks(1, 0)).toBe(2)
        })
        it('does not affect another fork when extending one fork', () => {
                const { smgr } = setup()
                smgr.extend(1, 0)
                smgr.extend(1, 1)
                smgr.extend(1, 1)
                expect(smgr.nBlocks(1, 0)).toBe(1)
        })
        it('returns the same handle object on repeated getHandle calls', () => {
                const { smgr } = setup()
                const h1 = smgr.getHandle(1, 0)
                const h2 = smgr.getHandle(1, 0)
                expect(h2).toBe(h1)
        })
        it('truncates nBlocks down to the requested count', () => {
                const { smgr } = setup()
                smgr.extend(1, 0)
                smgr.extend(1, 0)
                smgr.extend(1, 0)
                smgr.truncate(1, 0, 1)
                expect(smgr.nBlocks(1, 0)).toBe(1)
        })
})
