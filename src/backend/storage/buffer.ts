export type Hint = 'normal' | 'bulk_read' | 'bulk_write' | 'vacuum'

const makeFrame = (size: number): any => ({
        relId: -1,
        forkId: -1,
        blockNo: -1,
        bytes: new Uint8Array(size),
        pinCount: 0,
        usage: 0,
        dirty: false,
        valid: false,
})

const keyOf = (relId: any, forkId: any, blockNo: any) => `${relId}/${forkId}/${blockNo}`

export const createBufferPool = (opts: any) => {
        const smgr = opts.smgr
        const frameCount = opts.frameCount ?? 64
        const ringCount = opts.ringCount ?? 8
        const pageSize = opts.pageSize ?? 4096
        const frames: any[] = []
        for (let i = 0; i < frameCount; i++) frames.push(makeFrame(pageSize))
        const ring: any[] = []
        for (let i = 0; i < ringCount; i++) ring.push(makeFrame(pageSize))
        const lookup = new Map<string, any>()
        let clockHand = 0
        let ringHand = 0
        const _evictNormal = (): any => {
                for (let i = 0; i < frameCount * 3; i++) {
                        const f = frames[clockHand]
                        clockHand = (clockHand + 1) % frameCount
                        if (f.pinCount > 0) continue
                        if (!f.valid) return f
                        if (f.usage > 0) {
                                f.usage--
                                continue
                        }
                        if (f.dirty) smgr.write(f.relId, f.forkId, f.blockNo, f.bytes)
                        if (f.valid) lookup.delete(keyOf(f.relId, f.forkId, f.blockNo))
                        return f
                }
                return frames[clockHand]
        }
        const _evictRing = (): any => {
                const f = ring[ringHand]
                ringHand = (ringHand + 1) % ringCount
                if (f.valid && f.dirty) smgr.write(f.relId, f.forkId, f.blockNo, f.bytes)
                if (f.valid) lookup.delete(keyOf(f.relId, f.forkId, f.blockNo))
                return f
        }
        const _load = (frame: any, relId: any, forkId: any, blockNo: any) => {
                const data = smgr.read(relId, forkId, blockNo)
                frame.bytes.set(data)
                frame.relId = relId
                frame.forkId = forkId
                frame.blockNo = blockNo
                frame.dirty = false
                frame.valid = true
                frame.usage = 1
                frame.pinCount = 0
                lookup.set(keyOf(relId, forkId, blockNo), frame)
        }
        const pin = (relId: any, forkId: any, blockNo: any, hint: Hint = 'normal') => {
                const k = keyOf(relId, forkId, blockNo)
                const cached = lookup.get(k)
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
        }
        const unpin = (frame: any, dirty?: boolean) => {
                if (dirty) frame.dirty = true
                if (frame.pinCount > 0) frame.pinCount--
        }
        const flush = (frame: any) => {
                if (!frame.valid || !frame.dirty) return
                smgr.write(frame.relId, frame.forkId, frame.blockNo, frame.bytes)
                frame.dirty = false
        }
        const flushAll = () => {
                for (const f of frames) if (f.valid && f.dirty) flush(f)
                for (const f of ring) if (f.valid && f.dirty) flush(f)
        }
        const stats = () => ({ frameCount, ringCount, cached: lookup.size })
        return { pin, unpin, flush, flushAll, stats }
}
