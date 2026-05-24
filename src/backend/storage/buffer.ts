import type { Frame, BufferPool, StorageManager } from '../types'
const makeFrame = (size: number): Frame => ({
        relId: -1,
        forkId: -1,
        blockNo: -1,
        bytes: new Uint8Array(size),
        pinCount: 0,
        usage: 0,
        valid: false,
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
        const _evict = (): Frame => {
                for (let i = 0; i < frameCount * 3; i++) {
                        const f = _frames[_clockHand]
                        _clockHand = (_clockHand + 1) % frameCount
                        if (f.pinCount > 0) continue
                        if (!f.valid) return f
                        if (f.usage > 0) {
                                f.usage--
                                continue
                        }
                        _lookup.delete(keyOf(f.relId, f.forkId, f.blockNo))
                        return f
                }
                return _frames[_clockHand]
        }
        const _load = (frame: Frame, relId: number, forkId: number, blockNo: number) => {
                frame.bytes.set(smgr.read(relId, forkId, blockNo))
                frame.relId = relId
                frame.forkId = forkId
                frame.blockNo = blockNo
                frame.valid = true
                frame.usage = 1
                frame.pinCount = 0
                _lookup.set(keyOf(relId, forkId, blockNo), frame)
        }
        return {
                pin(relId: number, forkId: number, blockNo: number) {
                        const cached = _lookup.get(keyOf(relId, forkId, blockNo))
                        if (cached) {
                                cached.pinCount++
                                if (cached.usage < 5) cached.usage++
                                return cached
                        }
                        const victim = _evict()
                        _load(victim, relId, forkId, blockNo)
                        victim.pinCount = 1
                        return victim
                },
                unpin(frame: Frame) {
                        if (frame.pinCount > 0) frame.pinCount--
                },
        }
}
