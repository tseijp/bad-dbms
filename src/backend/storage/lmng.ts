export type LockMode = 'shared' | 'exclusive'
export type LatchMode = 'read' | 'write'

const isCompatible = (mode: LockMode, holders: Set<any>) => {
        if (mode === 'exclusive') return holders.size === 0
        for (const h of holders) if (h.mode === 'exclusive') return false
        return true
}

export const createLockManager = () => {
        const granted = new Map<string, Set<any>>()
        const waiters = new Map<string, any[]>()
        const latches = new Map<string, { readers: number; writer: number }>()
        const heldByXid = new Map<number, Set<string>>()
        const addHeld = (xid: number, tag: string) => {
                let s = heldByXid.get(xid)
                if (!s) (s = new Set(), heldByXid.set(xid, s))
                s.add(tag)
        }
        const buildWaitsFor = () => {
                const wf = new Map<number, Set<number>>()
                for (const [tag, ws] of waiters) {
                        const holders = granted.get(tag)
                        if (!holders) continue
                        for (const w of ws) {
                                let to = wf.get(w.xid)
                                if (!to) (to = new Set(), wf.set(w.xid, to))
                                for (const h of holders) if (h.xid !== w.xid) to.add(h.xid)
                        }
                }
                return wf
        }
        const findCycle = (wf: Map<number, Set<number>>, start: number) => {
                const path: number[] = []
                const seen = new Set<number>()
                const dfs = (node: number): number[] | null => {
                        if (path.includes(node)) return path.slice(path.indexOf(node)).concat(node)
                        if (seen.has(node)) return null
                        seen.add(node)
                        path.push(node)
                        const outs = wf.get(node)
                        if (outs) for (const n of outs) {
                                const r = dfs(n)
                                if (r) return r
                        }
                        path.pop()
                        return null
                }
                return dfs(start)
        }
        const detectDeadlock = () => {
                const wf = buildWaitsFor()
                for (const xid of wf.keys()) {
                        const cycle = findCycle(wf, xid)
                        if (cycle && cycle.length > 1) return cycle
                }
                return null
        }
        const tryGrant = (tag: string) => {
                const ws = waiters.get(tag)
                if (!ws || ws.length === 0) return
                const holders = granted.get(tag) ?? new Set()
                while (ws.length > 0) {
                        const head = ws[0]
                        if (!isCompatible(head.mode, holders)) return
                        ws.shift()
                        holders.add({ xid: head.xid, mode: head.mode })
                        granted.set(tag, holders)
                        addHeld(head.xid, tag)
                        head.resolve()
                }
                if (ws.length === 0) waiters.delete(tag)
        }
        const acquireLock = (tag: string, mode: LockMode, xid: number): Promise<void> => {
                const holders = granted.get(tag) ?? new Set()
                if (isCompatible(mode, holders) && !(waiters.get(tag)?.length)) {
                        holders.add({ xid, mode })
                        granted.set(tag, holders)
                        addHeld(xid, tag)
                        return Promise.resolve()
                }
                return new Promise((resolve, reject) => {
                        const entry = { xid, mode, resolve, reject }
                        const ws = waiters.get(tag) ?? []
                        ws.push(entry)
                        waiters.set(tag, ws)
                        const cycle = detectDeadlock()
                        if (!cycle) return
                        const victim = Math.max(...cycle)
                        for (const [t, list] of waiters) {
                                const idx = list.findIndex((w) => w.xid === victim)
                                if (idx < 0) continue
                                const [v] = list.splice(idx, 1)
                                v.reject(new Error('deadlock'))
                                if (list.length === 0) waiters.delete(t)
                        }
                })
        }
        const releaseLock = (tag: string, xid: number) => {
                const holders = granted.get(tag)
                if (!holders) return
                for (const h of Array.from(holders)) if (h.xid === xid) holders.delete(h)
                if (holders.size === 0) granted.delete(tag)
                heldByXid.get(xid)?.delete(tag)
                tryGrant(tag)
        }
        const releaseAll = (xid: number) => {
                const tags = heldByXid.get(xid)
                if (!tags) return
                for (const tag of Array.from(tags)) releaseLock(tag, xid)
                heldByXid.delete(xid)
        }
        const acquireLatch = (tag: string, mode: LatchMode) => {
                const l = latches.get(tag) ?? { readers: 0, writer: 0 }
                if (mode === 'read') {
                        if (l.writer > 0) return false
                        l.readers++
                        latches.set(tag, l)
                        return true
                }
                if (l.readers > 0 || l.writer > 0) return false
                l.writer = 1
                latches.set(tag, l)
                return true
        }
        const releaseLatch = (tag: string, mode: LatchMode) => {
                const l = latches.get(tag)
                if (!l) return
                if (mode === 'read' && l.readers > 0) l.readers--
                if (mode === 'write') l.writer = 0
                if (l.readers === 0 && l.writer === 0) latches.delete(tag)
        }
        return { acquireLock, releaseLock, acquireLatch, releaseLatch, releaseAll }
}
