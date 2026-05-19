export type Xid = number
export type SubXid = number
export type Vxid = string
export type CommandId = number
export type BlockState = 'default' | 'started' | 'inprogress' | 'end' | 'abort' | 'abort_end' | 'sub_inprogress' | 'sub_end' | 'sub_abort'
export type CommitStatus = 'in_progress' | 'sub_committed' | 'committed' | 'aborted'
export interface Snapshot {
        xmin: Xid
        xmax: Xid
        xip: Xid[]
        cid: CommandId
        takenAt: number
}
export interface TransactionState {
        xid: Xid
        subId: SubXid
        parent: TransactionState | null
        name: string
        block: BlockState
        cid: CommandId
        snapshot: Snapshot | null
}
export interface ProcEntry {
        vxid: Vxid
        xid: Xid
        subxids: Xid[]
        xmin: Xid
}

const InvalidXid: Xid = 0
const FirstNormalXid: Xid = 3
const TopSubId: SubXid = 1

export const createTransam = () => {
        let nextXid = FirstNormalXid
        let nextSubId = TopSubId + 1
        let nextCid = 0
        let nextVxid = 0
        let latestCompletedXid: Xid = InvalidXid
        let current: TransactionState | null = null
        let topVxid: Vxid = ''
        const clog = new Map<Xid, CommitStatus>()
        const subParent = new Map<Xid, Xid>()
        const procs = new Map<Vxid, ProcEntry>()
        const state = (parent: TransactionState | null, name: string, block: BlockState): TransactionState => ({ xid: InvalidXid, subId: parent ? nextSubId++ : TopSubId, parent, name, block, cid: 0, snapshot: null })
        const proc = () => procs.get(topVxid)
        const finish = (s: TransactionState, status: CommitStatus) => {
                if (s.xid === InvalidXid) return
                clog.set(s.xid, status)
                if (status !== 'sub_committed') latestCompletedXid = Math.max(latestCompletedXid, s.xid)
        }
        const closeTop = () => {
                procs.delete(topVxid)
                current = null
                topVxid = ''
        }
        const closeChildren = (status: CommitStatus, until?: TransactionState) => {
                while (current?.parent && current !== until) {
                        finish(current, status)
                        current = current.parent
                }
        }
        const startTransaction = () => {
                if (current) return
                topVxid = `v${++nextVxid}`
                current = state(null, 'top', 'started')
                procs.set(topVxid, { vxid: topVxid, xid: InvalidXid, subxids: [], xmin: InvalidXid })
        }
        const assignXid = (s: TransactionState): Xid => {
                if (s.xid !== InvalidXid) return s.xid
                if (s.parent) assignXid(s.parent)
                s.xid = nextXid++
                clog.set(s.xid, 'in_progress')
                if (s.parent) subParent.set(s.xid, s.parent.xid)
                const p = proc()
                if (!p) return s.xid
                if (s.parent) p.subxids.push(s.xid)
                if (!s.parent) p.xid = s.xid
                return s.xid
        }
        const activeXids = () => {
                const xids: Xid[] = []
                for (const p of procs.values()) {
                        if (p.xid !== InvalidXid) xids.push(p.xid)
                        for (const xid of p.subxids) xids.push(xid)
                }
                return xids
        }
        const getSnapshotData = (): Snapshot => {
                const xip = activeXids()
                const snap = { xmin: Math.min(nextXid, ...xip), xmax: latestCompletedXid + 1, xip, cid: current?.cid ?? 0, takenAt: Date.now() }
                if (!current) return snap
                current.snapshot = snap
                const p = proc()
                if (p) p.xmin = snap.xmin
                return snap
        }
        const findSavepoint = (name: string) => {
                let s = current
                while (s) {
                        if (s.parent && s.name === name) return s
                        s = s.parent
                }
                return null
        }
        const topXidOf = (xid: Xid): Xid => {
                let x = xid
                while (subParent.has(x)) x = subParent.get(x)!
                return x
        }
        const commandCounterIncrement = () => {
                if (current) current.cid = ++nextCid
        }
        const commitTransaction = () => {
                if (!current) return
                finish(current, 'committed')
                closeTop()
        }
        const abortTransaction = () => {
                if (current) finish(current, 'aborted')
        }
        const startTransactionCommand = () => {
                if (!current) return startTransaction()
                if (current.block === 'inprogress' || current.block === 'sub_inprogress' || current.block === 'abort') return
                startTransaction()
        }
        const commitTransactionCommand = () => {
                if (!current || current.block === 'abort') return
                if (current.block === 'inprogress' || current.block === 'sub_inprogress') return commandCounterIncrement()
                commitTransaction()
        }
        const beginTransactionBlock = () => {
                startTransactionCommand()
                if (current) current.block = 'inprogress'
        }
        const endTransactionBlock = () => {
                if (!current) return
                if (current.block === 'abort') return void (current.block = 'abort_end')
                closeChildren('committed')
                current.block = 'end'
        }
        const userAbortTransactionBlock = () => {
                if (!current) return
                closeChildren('aborted')
                abortTransaction()
                current.block = 'abort_end'
        }
        const pushTransaction = (name: string) => {
                if (!current) startTransaction()
                current = state(current, name, 'sub_inprogress')
        }
        const commitSubTransaction = () => {
                if (!current?.parent) return
                finish(current, 'sub_committed')
                current = current.parent
        }
        const abortSubTransaction = () => {
                if (current?.parent) finish(current, 'aborted')
        }
        const cleanupSubTransaction = () => {
                if (current?.parent) current = current.parent
        }
        const rollbackToSavepoint = (name: string) => {
                const target = findSavepoint(name)
                if (!target) return
                closeChildren('aborted', target)
                const parent = current?.parent ?? null
                if (current) finish(current, 'aborted')
                current = parent
                pushTransaction(name)
        }
        const releaseSavepoint = (name: string) => {
                const target = findSavepoint(name)
                if (!target) return
                closeChildren('sub_committed', target)
                commitSubTransaction()
        }
        const abortCurrentTransaction = () => {
                abortTransaction()
                if (current) current.block = 'abort'
        }
        const isVisible = (xid: Xid, snap: Snapshot) => {
                const top = topXidOf(xid)
                if (top >= snap.xmax) return false
                if (snap.xip.indexOf(top) >= 0) return false
                return clog.get(top) === 'committed'
        }
        return {
                startTransaction,
                startTransactionCommand,
                commitTransaction,
                commitTransactionCommand,
                abortTransaction,
                abortCurrentTransaction,
                cleanupTransaction: closeTop,
                beginTransactionBlock,
                endTransactionBlock,
                userAbortTransactionBlock,
                startSubTransaction: pushTransaction,
                commitSubTransaction,
                abortSubTransaction,
                cleanupSubTransaction,
                rollbackToSavepoint,
                releaseSavepoint,
                commandCounterIncrement,
                getSnapshotData,
                isVisible,
                defineSavepoint(name: string) {
                        if (current) pushTransaction(name)
                },
                assignXid() {
                        return current ? assignXid(current) : InvalidXid
                },
                isCommitted(xid: Xid) {
                        return clog.get(xid) === 'committed'
                },
                isAborted(xid: Xid) {
                        return clog.get(xid) === 'aborted'
                },
                isInProgress(xid: Xid) {
                        return clog.get(xid) === 'in_progress' || clog.get(xid) === 'sub_committed'
                },
                currentState() {
                        return current
                },
                currentXid() {
                        return current?.xid ?? InvalidXid
                },
                currentCid() {
                        return current?.cid ?? 0
                },
                latestCompletedXid() {
                        return latestCompletedXid
                },
                clog() {
                        return clog
                },
        }
}

export type Transam = ReturnType<typeof createTransam>
