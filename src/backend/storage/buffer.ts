import type { Frame, BufferPool, StorageManager } from '../types'
const makeFrame = (size: number): Frame => ({
        relId: -1,
        forkId: -1,
        blockNo: -1,
        bytes: new Uint8Array(size),
        pinCount: 0,
        usage: 0,
        valid: false,
        dirty: false,
})
const keyOf = (relId: number, forkId: number, blockNo: number) => `${relId}/${forkId}/${blockNo}`
export interface BufferPoolOptions {
        smgr: StorageManager
        frameCount?: number
        pageSize?: number
}
export const createBufferPool = ({ smgr, frameCount = 64, pageSize = 4096 }: BufferPoolOptions): BufferPool => {
        const _frames: Frame[] = []
        for (let i = 0; i < frameCount; i++) _frames.push(makeFrame(pageSize))
        const _lookup = new Map<string, Frame>()
        let _clockHand = 0
        const _flush = async (f: Frame) => {
                if (!f.valid || !f.dirty) return
                await smgr.write(smgr.open(f.relId), f.forkId, f.blockNo, f.bytes)
                f.dirty = false
        }
        const _evict = async (): Promise<Frame> => {
                for (let i = 0; i < frameCount * 3; i++) {
                        const f = _frames[_clockHand]
                        _clockHand = (_clockHand + 1) % frameCount
                        if (f.pinCount > 0) continue
                        if (!f.valid) return f
                        if (f.usage > 0) {
                                f.usage--
                                continue
                        }
                        await _flush(f)
                        _lookup.delete(keyOf(f.relId, f.forkId, f.blockNo))
                        return f
                }
                const f = _frames[_clockHand]
                await _flush(f)
                return f
        }
        return {
                async pin(relId, forkId, blockNo) {
                        const cached = _lookup.get(keyOf(relId, forkId, blockNo))
                        if (cached) {
                                cached.pinCount++
                                if (cached.usage < 5) cached.usage++
                                return cached
                        }
                        const victim = await _evict()
                        victim.bytes.set(await smgr.read(smgr.open(relId), forkId, blockNo))
                        victim.relId = relId
                        victim.forkId = forkId
                        victim.blockNo = blockNo
                        victim.valid = true
                        victim.usage = 1
                        victim.pinCount = 0
                        victim.dirty = false
                        _lookup.set(keyOf(relId, forkId, blockNo), victim)
                        victim.pinCount = 1
                        return victim
                },
                async unpin(frame, dirty) {
                        if (dirty) frame.dirty = true
                        if (frame.pinCount > 0) frame.pinCount--
                        if (frame.pinCount === 0 && frame.dirty) await _flush(frame)
                },
        }
}
