import type { LockMode, LatchMode } from '../types'
export type { LockMode, LatchMode } from '../types'
interface Holder {
        xid: number
        mode: LockMode
}
interface Waiter {
        xid: number
        mode: LockMode
        resolve: () => void
        reject: (err: Error) => void
}
interface LatchState {
        readers: number
        writer: number
}
const isCompatible = (mode: LockMode, holders: Set<Holder>) => {
        if (mode === 'exclusive') return holders.size === 0
        for (const h of holders) if (h.mode === 'exclusive') return false
        return true
}
export const createLockManager = () => {
        const _granted = new Map<string, Set<Holder>>()
        const _waiters = new Map<string, Waiter[]>()
        const _latches = new Map<string, LatchState>()
        const _heldByXid = new Map<number, Set<string>>()
        const _addHeld = (xid: number, tag: string) => {
                let s = _heldByXid.get(xid)
                if (!s) ((s = new Set()), _heldByXid.set(xid, s))
                s.add(tag)
        }
        const _buildWaitsFor = (): Map<number, Set<number>> => {
                const wf = new Map<number, Set<number>>()
                for (const [tag, ws] of _waiters) {
                        const holders = _granted.get(tag)
                        if (!holders) continue
                        for (const w of ws) {
                                let to = wf.get(w.xid)
                                if (!to) ((to = new Set()), wf.set(w.xid, to))
                                for (const h of holders) if (h.xid !== w.xid) to.add(h.xid)
                        }
                }
                return wf
        }
        const _findCycle = (wf: Map<number, Set<number>>, start: number): number[] | null => {
                const path: number[] = []
                const seen = new Set<number>()
                const dfs = (node: number): number[] | null => {
                        if (path.includes(node)) return path.slice(path.indexOf(node)).concat(node)
                        if (seen.has(node)) return null
                        seen.add(node)
                        path.push(node)
                        const outs = wf.get(node)
                        if (outs)
                                for (const n of outs) {
                                        const r = dfs(n)
                                        if (r) return r
                                }
                        path.pop()
                        return null
                }
                return dfs(start)
        }
        const _detectDeadlock = (): number[] | null => {
                const wf = _buildWaitsFor()
                for (const xid of wf.keys()) {
                        const cycle = _findCycle(wf, xid)
                        if (cycle && cycle.length > 1) return cycle
                }
                return null
        }
        const _tryGrant = (tag: string) => {
                const ws = _waiters.get(tag)
                if (!ws || ws.length === 0) return
                const holders = _granted.get(tag) ?? new Set<Holder>()
                while (ws.length > 0) {
                        const head = ws[0]
                        if (!isCompatible(head.mode, holders)) return
                        ws.shift()
                        holders.add({ xid: head.xid, mode: head.mode })
                        _granted.set(tag, holders)
                        _addHeld(head.xid, tag)
                        head.resolve()
                }
                if (ws.length === 0) _waiters.delete(tag)
        }
        const releaseLock = (tag: string, xid: number) => {
                const holders = _granted.get(tag)
                if (!holders) return
                for (const h of Array.from(holders)) if (h.xid === xid) holders.delete(h)
                if (holders.size === 0) _granted.delete(tag)
                _heldByXid.get(xid)?.delete(tag)
                _tryGrant(tag)
        }
        return {
                acquireLock(tag: string, mode: LockMode, xid: number): Promise<void> {
                        const holders = _granted.get(tag) ?? new Set<Holder>()
                        if (isCompatible(mode, holders) && !_waiters.get(tag)?.length) {
                                holders.add({ xid, mode })
                                _granted.set(tag, holders)
                                _addHeld(xid, tag)
                                return Promise.resolve()
                        }
                        return new Promise<void>((resolve, reject) => {
                                const entry: Waiter = { xid, mode, resolve, reject }
                                const ws = _waiters.get(tag) ?? []
                                ws.push(entry)
                                _waiters.set(tag, ws)
                                const cycle = _detectDeadlock()
                                if (!cycle) return
                                const victim = Math.max(...cycle)
                                for (const [t, list] of _waiters) {
                                        const idx = list.findIndex((w) => w.xid === victim)
                                        if (idx < 0) continue
                                        const [v] = list.splice(idx, 1)
                                        v.reject(new Error('deadlock'))
                                        if (list.length === 0) _waiters.delete(t)
                                }
                        })
                },
                releaseLock,
                acquireLatch(tag: string, mode: LatchMode): boolean {
                        const l = _latches.get(tag) ?? { readers: 0, writer: 0 }
                        if (mode === 'read') {
                                if (l.writer > 0) return false
                                l.readers++
                                _latches.set(tag, l)
                                return true
                        }
                        if (l.readers > 0 || l.writer > 0) return false
                        l.writer = 1
                        _latches.set(tag, l)
                        return true
                },
                releaseLatch(tag: string, mode: LatchMode) {
                        const l = _latches.get(tag)
                        if (!l) return
                        if (mode === 'read' && l.readers > 0) l.readers--
                        if (mode === 'write') l.writer = 0
                        if (l.readers === 0 && l.writer === 0) _latches.delete(tag)
                },
                releaseAll(xid: number) {
                        const tags = _heldByXid.get(xid)
                        if (!tags) return
                        for (const tag of Array.from(tags)) releaseLock(tag, xid)
                        _heldByXid.delete(xid)
                },
        }
}
