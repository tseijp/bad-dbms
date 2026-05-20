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
        let _nextXid: Xid = firstXid
        let _latestCompletedXid: Xid = firstXid - 1
        let _cidCounter = 0
        const _clog: Map<Xid, ClogStatus> = new Map()
        const _activeTop: Set<Xid> = new Set()
        let _cur: TxState | null = null
        const _computeXmin = (): number => {
                if (_activeTop.size === 0) return _latestCompletedXid + 1
                let m = Infinity
                for (const x of _activeTop) if (x < m) m = x
                return m
        }
        const _takeSnapshot = (): Snapshot => {
                const xip = new Set(_activeTop)
                return freezeSnap({ xmin: _computeXmin(), xmax: _nextXid, xip, cid: _cidCounter++, takenAt: Date.now() })
        }
        const _allocXid = (): Xid => {
                const x = _nextXid++
                _clog.set(x, 'in_progress')
                return x
        }
        const savepoint = (name?: string | null): TxState | null => {
                if (!_cur) return null
                const xid = _allocXid()
                const snap = _takeSnapshot()
                const child: TxState = { xid, parent: _cur, name: name || null, cid: 0, snapshot: snap }
                _cur = child
                return child
        }
        const _finish = (status: ClogStatus): Xid | null => {
                if (!_cur) return null
                let s: TxState | null = _cur
                while (s && s.parent) {
                        _clog.set(s.xid, status)
                        s = s.parent
                }
                if (!s) return null
                _clog.set(s.xid, status)
                _activeTop.delete(s.xid)
                if (s.xid > _latestCompletedXid) _latestCompletedXid = s.xid
                const xid = s.xid
                _cur = null
                return xid
        }
        return {
                begin(name?: string): TxState {
                        if (_cur) return savepoint(name || null) as TxState
                        const xid = _allocXid()
                        _activeTop.add(xid)
                        const snap = _takeSnapshot()
                        _cur = { xid, parent: null, name: name || null, cid: 0, snapshot: snap }
                        return _cur
                },
                savepoint,
                commit(): Xid | null {
                        return _finish('committed')
                },
                abort(): Xid | null {
                        return _finish('aborted')
                },
                releaseSavepoint(): TxState | null {
                        if (!_cur || !_cur.parent) return null
                        _clog.set(_cur.xid, 'committed')
                        _cur = _cur.parent
                        return _cur
                },
                rollbackSavepoint(): TxState | null {
                        if (!_cur || !_cur.parent) return null
                        _clog.set(_cur.xid, 'aborted')
                        _cur = _cur.parent
                        return _cur
                },
                xidStatus(xid: Xid): ClogStatus | undefined {
                        return _clog.get(xid)
                },
                snapshot(): Snapshot {
                        return _cur ? _cur.snapshot : _takeSnapshot()
                },
                current(): TxState | null {
                        return _cur
                },
                isVisible(xid: Xid, snap: Snapshot): boolean {
                        if (xid >= snap.xmax) return false
                        if (xid < snap.xmin) return _clog.get(xid) === 'committed'
                        if (snap.xip.has(xid)) return false
                        return _clog.get(xid) === 'committed'
                },
        }
}
export type Transam = ReturnType<typeof createTransam>
