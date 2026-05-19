export type Xid = number
export type SubXid = number
export type ClogStatus = 'in_progress' | 'committed' | 'aborted'

export interface Snapshot {
        xmin: number
        xmax: number
        xip: Set<Xid>
        cid: number
        takenAt: number
}

export interface TxState {
        xid: Xid
        parent: TxState | null
        name: string | null
        cid: number
        snapshot: Snapshot
}

export interface TransamOptions {
        firstXid?: number
}

const freezeSnap = (s: Snapshot): Snapshot => {
        const out: Snapshot = { xmin: s.xmin, xmax: s.xmax, xip: new Set(s.xip), cid: s.cid, takenAt: s.takenAt }
        Object.freeze(out)
        return out
}

export const createTransam = ({ firstXid = 3 }: TransamOptions = {}) => {
        let nextXid: Xid = firstXid
        let latestCompletedXid: Xid = firstXid - 1
        let cidCounter = 0
        const clog: Map<Xid, ClogStatus> = new Map()
        const activeTop: Set<Xid> = new Set()
        let cur: TxState | null = null
        const computeXmin = (): number => {
                if (activeTop.size === 0) return latestCompletedXid + 1
                let m = Infinity
                for (const x of activeTop) if (x < m) m = x
                return m
        }
        const takeSnapshot = (): Snapshot => {
                const xip = new Set(activeTop)
                return freezeSnap({ xmin: computeXmin(), xmax: nextXid, xip, cid: cidCounter++, takenAt: Date.now() })
        }
        const allocXid = (): Xid => {
                const x = nextXid++
                clog.set(x, 'in_progress')
                return x
        }
        const savepoint = (name?: string | null): TxState | null => {
                if (!cur) return null
                const xid = allocXid()
                const snap = takeSnapshot()
                const child: TxState = { xid, parent: cur, name: name || null, cid: 0, snapshot: snap }
                cur = child
                return child
        }
        const begin = (name?: string): TxState => {
                if (cur) return savepoint(name || null) as TxState
                const xid = allocXid()
                activeTop.add(xid)
                const snap = takeSnapshot()
                cur = { xid, parent: null, name: name || null, cid: 0, snapshot: snap }
                return cur
        }
        const releaseSavepoint = (): TxState | null => {
                if (!cur || !cur.parent) return null
                clog.set(cur.xid, 'committed')
                cur = cur.parent
                return cur
        }
        const rollbackSavepoint = (): TxState | null => {
                if (!cur || !cur.parent) return null
                clog.set(cur.xid, 'aborted')
                cur = cur.parent
                return cur
        }
        const finish = (status: ClogStatus): Xid | null => {
                if (!cur) return null
                let s: TxState | null = cur
                while (s && s.parent) {
                        clog.set(s.xid, status)
                        s = s.parent
                }
                if (!s) return null
                clog.set(s.xid, status)
                activeTop.delete(s.xid)
                if (s.xid > latestCompletedXid) latestCompletedXid = s.xid
                const xid = s.xid
                cur = null
                return xid
        }
        const commit = (): Xid | null => finish('committed')
        const abort = (): Xid | null => finish('aborted')
        const xidStatus = (xid: Xid): ClogStatus | undefined => clog.get(xid)
        const snapshot = (): Snapshot => (cur ? cur.snapshot : takeSnapshot())
        const current = (): TxState | null => cur
        const isVisible = (xid: Xid, snap: Snapshot): boolean => {
                if (xid >= snap.xmax) return false
                if (xid < snap.xmin) return clog.get(xid) === 'committed'
                if (snap.xip.has(xid)) return false
                return clog.get(xid) === 'committed'
        }
        return { begin, commit, abort, savepoint, releaseSavepoint, rollbackSavepoint, xidStatus, snapshot, current, isVisible }
}

export type Transam = ReturnType<typeof createTransam>
