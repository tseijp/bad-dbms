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
        pendingCommit: boolean
        pendingAbort: boolean
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
        let nextXid: Xid = FirstNormalXid
        let nextSubId: SubXid = TopSubId + 1
        let nextCid: CommandId = 0
        let nextVxidCounter = 0
        let latestCompletedXid: Xid = InvalidXid
        const clog = new Map<Xid, CommitStatus>()
        const subParent = new Map<Xid, Xid>()
        const procs = new Map<Vxid, ProcEntry>()
        let current: TransactionState | null = null
        let topVxid: Vxid = ''
        const makeVxid = () => `v${++nextVxidCounter}`
        const makeState = (parent: TransactionState | null, name: string, block: BlockState): TransactionState => ({
                xid: InvalidXid,
                subId: parent ? nextSubId++ : TopSubId,
                parent,
                name,
                block,
                cid: 0,
                snapshot: null,
                pendingCommit: false,
                pendingAbort: false,
        })
        const assignXid = (state: TransactionState): Xid => {
                if (state.xid !== InvalidXid) return state.xid
                if (state.parent) assignXid(state.parent)
                const xid = nextXid++
                state.xid = xid
                clog.set(xid, 'in_progress')
                if (state.parent && state.parent.xid !== InvalidXid) subParent.set(xid, state.parent.xid)
                const proc = procs.get(topVxid)
                if (!proc) return xid
                if (state.parent) proc.subxids.push(xid)
                else proc.xid = xid
                return xid
        }
        const computeXmin = (): Xid => {
                let min = nextXid
                for (const p of procs.values()) {
                        if (p.xid !== InvalidXid && p.xid < min) min = p.xid
                        for (const s of p.subxids) if (s < min) min = s
                }
                return min
        }
        const getSnapshotData = (): Snapshot => {
                const xip: Xid[] = []
                for (const p of procs.values()) {
                        if (p.xid !== InvalidXid) xip.push(p.xid)
                        for (const s of p.subxids) xip.push(s)
                }
                const snap: Snapshot = {
                        xmin: computeXmin(),
                        xmax: latestCompletedXid + 1,
                        xip,
                        cid: current ? current.cid : 0,
                        takenAt: Date.now(),
                }
                if (current) {
                        current.snapshot = snap
                        const proc = procs.get(topVxid)
                        if (proc) proc.xmin = snap.xmin
                }
                return snap
        }
        const isCommitted = (xid: Xid): boolean => clog.get(xid) === 'committed'
        const isAborted = (xid: Xid): boolean => clog.get(xid) === 'aborted'
        const isInProgress = (xid: Xid): boolean => {
                const s = clog.get(xid)
                return s === 'in_progress' || s === 'sub_committed'
        }
        const topXidOf = (xid: Xid): Xid => {
                let cur = xid
                while (subParent.has(cur)) cur = subParent.get(cur)!
                return cur
        }
        const isVisible = (xidWrote: Xid, snap: Snapshot): boolean => {
                const top = topXidOf(xidWrote)
                if (top >= snap.xmax) return false
                if (snap.xip.includes(top)) return false
                if (top < snap.xmin) return isCommitted(top)
                return isCommitted(top)
        }
        const startTransaction = () => {
                if (current) return
                topVxid = makeVxid()
                current = makeState(null, 'top', 'started')
                procs.set(topVxid, { vxid: topVxid, xid: InvalidXid, subxids: [], xmin: InvalidXid })
        }
        const startTransactionCommand = () => {
                if (!current) {
                        startTransaction()
                        return
                }
                if (current.block === 'inprogress' || current.block === 'sub_inprogress') return
                if (current.block === 'abort') return
                startTransaction()
        }
        const commandCounterIncrement = () => {
                if (!current) return
                nextCid++
                current.cid = nextCid
        }
        const finalizeCommit = (state: TransactionState) => {
                if (state.xid === InvalidXid) return
                clog.set(state.xid, 'committed')
                latestCompletedXid = Math.max(latestCompletedXid, state.xid)
        }
        const finalizeAbort = (state: TransactionState) => {
                if (state.xid === InvalidXid) return
                clog.set(state.xid, 'aborted')
                latestCompletedXid = Math.max(latestCompletedXid, state.xid)
        }
        const commitTransaction = () => {
                if (!current) return
                finalizeCommit(current)
                procs.delete(topVxid)
                current = null
                topVxid = ''
        }
        const abortTransaction = () => {
                if (!current) return
                finalizeAbort(current)
        }
        const cleanupTransaction = () => {
                if (!current) return
                procs.delete(topVxid)
                current = null
                topVxid = ''
        }
        const commitTransactionCommand = () => {
                if (!current) return
                if (current.block === 'abort') return
                if (current.block === 'sub_inprogress') {
                        commandCounterIncrement()
                        return
                }
                if (current.block === 'inprogress') {
                        commandCounterIncrement()
                        return
                }
                if (current.block === 'end') {
                        commitTransaction()
                        return
                }
                if (current.block === 'started') {
                        commitTransaction()
                        return
                }
                commitTransaction()
        }
        const abortCurrentTransaction = () => {
                if (!current) return
                abortTransaction()
                current.block = 'abort'
        }
        const beginTransactionBlock = () => {
                startTransactionCommand()
                if (current) current.block = 'inprogress'
        }
        const endTransactionBlock = () => {
                if (!current) return
                if (current.block === 'abort') {
                        current.block = 'abort_end'
                        return
                }
                while (current.parent) {
                        finalizeCommit(current)
                        current = current.parent
                }
                current.block = 'end'
        }
        const userAbortTransactionBlock = () => {
                if (!current) return
                while (current.parent) {
                        finalizeAbort(current)
                        current = current.parent
                }
                abortTransaction()
                current.block = 'abort_end'
        }
        const pushTransaction = (name: string) => {
                if (!current) startTransaction()
                const child = makeState(current, name, 'sub_inprogress')
                current = child
        }
        const popTransaction = () => {
                if (!current || !current.parent) return
                current = current.parent
        }
        const startSubTransaction = (name: string) => {
                pushTransaction(name)
        }
        const commitSubTransaction = () => {
                if (!current || !current.parent) return
                if (current.xid !== InvalidXid) clog.set(current.xid, 'sub_committed')
                popTransaction()
        }
        const abortSubTransaction = () => {
                if (!current || !current.parent) return
                finalizeAbort(current)
        }
        const cleanupSubTransaction = () => {
                if (!current || !current.parent) return
                popTransaction()
        }
        const defineSavepoint = (name: string) => {
                if (!current) return
                startSubTransaction(name)
        }
        const findSavepoint = (name: string): TransactionState | null => {
                let s = current
                while (s) {
                        if (s.name === name && s.parent) return s
                        s = s.parent
                }
                return null
        }
        const rollbackToSavepoint = (name: string) => {
                const target = findSavepoint(name)
                if (!target) return
                while (current && current !== target) {
                        finalizeAbort(current)
                        popTransaction()
                }
                if (!current) return
                finalizeAbort(current)
                const parent = current.parent
                popTransaction()
                pushTransaction(name)
                if (current && parent) current.parent = parent
        }
        const releaseSavepoint = (name: string) => {
                const target = findSavepoint(name)
                if (!target) return
                while (current && current !== target) {
                        commitSubTransaction()
                }
                if (!current || !current.parent) return
                if (current.xid !== InvalidXid) clog.set(current.xid, 'sub_committed')
                popTransaction()
        }
        return {
                startTransaction,
                startTransactionCommand,
                commitTransaction,
                commitTransactionCommand,
                abortTransaction,
                abortCurrentTransaction,
                cleanupTransaction,
                beginTransactionBlock,
                endTransactionBlock,
                userAbortTransactionBlock,
                startSubTransaction,
                commitSubTransaction,
                abortSubTransaction,
                cleanupSubTransaction,
                defineSavepoint,
                rollbackToSavepoint,
                releaseSavepoint,
                commandCounterIncrement,
                getSnapshotData,
                assignXid: () => (current ? assignXid(current) : InvalidXid),
                isCommitted,
                isAborted,
                isInProgress,
                isVisible,
                currentState: () => current,
                currentXid: () => (current ? current.xid : InvalidXid),
                currentCid: () => (current ? current.cid : 0),
                latestCompletedXid: () => latestCompletedXid,
                clog: () => clog,
        }
}

export type Transam = ReturnType<typeof createTransam>
