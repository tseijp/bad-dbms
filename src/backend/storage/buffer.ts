import type { Frame, Hint, BufferPool, StorageManager } from '../types'
export type { Hint } from '../types'
const makeFrame = (size: number): Frame => ({
        relId: -1,
        forkId: -1,
        blockNo: -1,
        bytes: new Uint8Array(size),
        pinCount: 0,
        usage: 0,
        dirty: false,
        valid: false,
})
const keyOf = (relId: number, forkId: number, blockNo: number) => `${relId}/${forkId}/${blockNo}`
export interface BufferPoolOptions {
        smgr: StorageManager
        frameCount?: number
        ringCount?: number
        pageSize?: number
}
export const createBufferPool = (opts: BufferPoolOptions): BufferPool => {
        const _smgr = opts.smgr
        const _frameCount = opts.frameCount ?? 64
        const _ringCount = opts.ringCount ?? 8
        const _pageSize = opts.pageSize ?? 4096
        const _frames: Frame[] = []
        for (let i = 0; i < _frameCount; i++) _frames.push(makeFrame(_pageSize))
        const _ring: Frame[] = []
        for (let i = 0; i < _ringCount; i++) _ring.push(makeFrame(_pageSize))
        const _lookup = new Map<string, Frame>()
        let _clockHand = 0
        let _ringHand = 0
        const _evictNormal = (): Frame => {
                for (let i = 0; i < _frameCount * 3; i++) {
                        const f = _frames[_clockHand]
                        _clockHand = (_clockHand + 1) % _frameCount
                        if (f.pinCount > 0) continue
                        if (!f.valid) return f
                        if (f.usage > 0) {
                                f.usage--
                                continue
                        }
                        if (f.dirty) _smgr.write(f.relId, f.forkId, f.blockNo, f.bytes)
                        if (f.valid) _lookup.delete(keyOf(f.relId, f.forkId, f.blockNo))
                        return f
                }
                return _frames[_clockHand]
        }
        const _evictRing = (): Frame => {
                const f = _ring[_ringHand]
                _ringHand = (_ringHand + 1) % _ringCount
                if (f.valid && f.dirty) _smgr.write(f.relId, f.forkId, f.blockNo, f.bytes)
                if (f.valid) _lookup.delete(keyOf(f.relId, f.forkId, f.blockNo))
                return f
        }
        const _load = (frame: Frame, relId: number, forkId: number, blockNo: number) => {
                const data = _smgr.read(relId, forkId, blockNo)
                frame.bytes.set(data)
                frame.relId = relId
                frame.forkId = forkId
                frame.blockNo = blockNo
                frame.dirty = false
                frame.valid = true
                frame.usage = 1
                frame.pinCount = 0
                _lookup.set(keyOf(relId, forkId, blockNo), frame)
        }
        const flush = (frame: Frame) => {
                if (!frame.valid || !frame.dirty) return
                _smgr.write(frame.relId, frame.forkId, frame.blockNo, frame.bytes)
                frame.dirty = false
        }
        return {
                pin(relId: number, forkId: number, blockNo: number, hint: Hint = 'normal') {
                        const k = keyOf(relId, forkId, blockNo)
                        const cached = _lookup.get(k)
                        if (cached) {
                                cached.pinCount++
                                if (cached.usage < 5) cached.usage++
                                return cached
                        }
                        const isBulk = hint === 'bulk_read' || hint === 'bulk_write' || hint === 'vacuum'
                        const victim = isBulk ? _evictRing() : _evictNormal()
                        _load(victim, relId, forkId, blockNo)
                        victim.pinCount = 1
                        return victim
                },
                unpin(frame: Frame, dirty?: boolean) {
                        if (dirty) frame.dirty = true
                        if (frame.pinCount > 0) frame.pinCount--
                },
                flush,
                flushAll() {
                        for (const f of _frames) if (f.valid && f.dirty) flush(f)
                        for (const f of _ring) if (f.valid && f.dirty) flush(f)
                },
                stats() {
                        return { frameCount: _frameCount, ringCount: _ringCount, cached: _lookup.size }
                },
        }
}
