// export type Xid = number
// export type SubXid = number
// export type Vxid = string
// export type CommandId = number
// export type BlockState = 'default' | 'started' | 'inprogress' | 'end' | 'abort' | 'abort_end' | 'sub_inprogress' | 'sub_end' | 'sub_abort'
// export type CommitStatus = 'in_progress' | 'sub_committed' | 'committed' | 'aborted'
// export interface Snapshot {
//         xmin: Xid
//         xmax: Xid
//         xip: Xid[]
//         cid: CommandId
//         takenAt: number
// }
// export interface TransactionState {
//         xid: Xid
//         subId: SubXid
//         parent: TransactionState | null
//         name: string
//         block: BlockState
//         cid: CommandId
//         snapshot: Snapshot | null
// }
// export interface ProcEntry {
//         vxid: Vxid
//         xid: Xid
//         subxids: Xid[]
//         xmin: Xid
// }
// export const createTransam = ({ firstXid = 3, firstSubId = 1, firstCid = 0, invalidXid = 0 }: { firstXid?: Xid; firstSubId?: SubXid; firstCid?: CommandId; invalidXid?: Xid } = {}) => {
//         let _nextXid = firstXid
//         let _nextSubId = firstSubId + 1
//         let _nextCid = firstCid
//         let _nextVxid = 0
//         let latestCompletedXid: Xid = invalidXid
//         let current: TransactionState | null = null
//         let _topVxid: Vxid = ''
//         const clog = new Map<Xid, CommitStatus>()
//         const _subParent = new Map<Xid, Xid>()
//         const _procs = new Map<Vxid, ProcEntry>()
//         const _state = (parent: TransactionState | null, name: string, block: BlockState): TransactionState => ({ xid: invalidXid, subId: parent ? _nextSubId++ : firstSubId, parent, name, block, cid: 0, snapshot: null })
//         const _proc = () => _procs.get(_topVxid)
//         const _finish = (s: TransactionState, status: CommitStatus) => {
//                 if (s.xid === invalidXid) return
//                 clog.set(s.xid, status)
//                 if (status !== 'sub_committed') latestCompletedXid = Math.max(latestCompletedXid, s.xid)
//         }
//         const _closeChildren = (status: CommitStatus, until?: TransactionState) => {
//                 while (current?.parent && current !== until) {
//                         _finish(current, status)
//                         current = current.parent
//                 }
//         }
//         const _assignXid = (s: TransactionState): Xid => {
//                 if (s.xid !== invalidXid) return s.xid
//                 if (s.parent) _assignXid(s.parent)
//                 s.xid = _nextXid++
//                 clog.set(s.xid, 'in_progress')
//                 if (s.parent) _subParent.set(s.xid, s.parent.xid)
//                 const p = _proc()
//                 if (!p) return s.xid
//                 if (s.parent) p.subxids.push(s.xid)
//                 if (!s.parent) p.xid = s.xid
//                 return s.xid
//         }
//         const _activeXids = () => {
//                 const xids: Xid[] = []
//                 for (const p of _procs.values()) {
//                         if (p.xid !== invalidXid) xids.push(p.xid)
//                         for (const xid of p.subxids) xids.push(xid)
//                 }
//                 return xids
//         }
//         const _findSavepoint = (name: string) => {
//                 let s = current
//                 while (s) {
//                         if (s.parent && s.name === name) return s
//                         s = s.parent
//                 }
//                 return null
//         }
//         const _topXidOf = (xid: Xid): Xid => {
//                 let x = xid
//                 while (_subParent.has(x)) x = _subParent.get(x)!
//                 return x
//         }
//         return {
//                 clog,
//                 state: () => current,
//                 xid: () => current?.xid ?? invalidXid,
//                 cid: () => current?.cid ?? 0,
//                 latestCompletedXid: () => latestCompletedXid,
//                 isCommitted: (xid: Xid) => clog.get(xid) === 'committed',
//                 isAborted: (xid: Xid) => clog.get(xid) === 'aborted',
//                 isInProgress: (xid: Xid) => clog.get(xid) === 'in_progress' || clog.get(xid) === 'sub_committed',
//                 startTransaction() {
//                         if (current) return
//                         _topVxid = `v${++_nextVxid}`
//                         current = _state(null, 'top', 'started')
//                         _procs.set(_topVxid, { vxid: _topVxid, xid: invalidXid, subxids: [], xmin: invalidXid })
//                 },
//                 cleanupTransaction() {
//                         _procs.delete(_topVxid)
//                         current = null
//                         _topVxid = ''
//                 },
//                 commitTransaction() {
//                         if (!current) return
//                         _finish(current, 'committed')
//                         _procs.delete(_topVxid)
//                         current = null
//                         _topVxid = ''
//                 },
//                 abortTransaction() {
//                         if (current) _finish(current, 'aborted')
//                 },
//                 commandCounterIncrement() {
//                         if (current) current.cid = ++_nextCid
//                 },
//                 startTransactionCommand() {
//                         if (!current) return this.startTransaction()
//                         if (current.block === 'inprogress' || current.block === 'sub_inprogress' || current.block === 'abort') return
//                         this.startTransaction()
//                 },
//                 commitTransactionCommand() {
//                         if (!current || current.block === 'abort') return
//                         if (current.block === 'inprogress' || current.block === 'sub_inprogress') return void (current.cid = ++_nextCid)
//                         this.commitTransaction()
//                 },
//                 beginTransactionBlock() {
//                         this.startTransactionCommand()
//                         if (current) current.block = 'inprogress'
//                 },
//                 endTransactionBlock() {
//                         if (!current) return
//                         if (current.block === 'abort') return void (current.block = 'abort_end')
//                         _closeChildren('committed')
//                         current.block = 'end'
//                 },
//                 userAbortTransactionBlock() {
//                         if (!current) return
//                         _closeChildren('aborted')
//                         _finish(current, 'aborted')
//                         current.block = 'abort_end'
//                 },
//                 abortCurrentTransaction() {
//                         if (!current) return
//                         _finish(current, 'aborted')
//                         current.block = 'abort'
//                 },
//                 startSubTransaction(name: string) {
//                         if (!current) this.startTransaction()
//                         current = _state(current, name, 'sub_inprogress')
//                 },
//                 commitSubTransaction() {
//                         if (!current?.parent) return
//                         _finish(current, 'sub_committed')
//                         current = current.parent
//                 },
//                 abortSubTransaction() {
//                         if (current?.parent) _finish(current, 'aborted')
//                 },
//                 cleanupSubTransaction() {
//                         if (current?.parent) current = current.parent
//                 },
//                 defineSavepoint(name: string) {
//                         if (current) this.startSubTransaction(name)
//                 },
//                 rollbackToSavepoint(name: string) {
//                         const target = _findSavepoint(name)
//                         if (!target) return
//                         _closeChildren('aborted', target)
//                         const parent = current?.parent ?? null
//                         if (current) _finish(current, 'aborted')
//                         current = parent
//                         this.startSubTransaction(name)
//                 },
//                 releaseSavepoint(name: string) {
//                         const target = _findSavepoint(name)
//                         if (!target) return
//                         _closeChildren('sub_committed', target)
//                         this.commitSubTransaction()
//                 },
//                 getSnapshotData(): Snapshot {
//                         const xip = _activeXids()
//                         const snap = { xmin: Math.min(_nextXid, ...xip), xmax: latestCompletedXid + 1, xip, cid: current?.cid ?? 0, takenAt: Date.now() }
//                         if (!current) return snap
//                         current.snapshot = snap
//                         const p = _proc()
//                         if (p) p.xmin = snap.xmin
//                         return snap
//                 },
//                 isVisible(xid: Xid, snap: Snapshot) {
//                         const top = _topXidOf(xid)
//                         if (top >= snap.xmax) return false
//                         if (snap.xip.indexOf(top) >= 0) return false
//                         return clog.get(top) === 'committed'
//                 },
//                 assignXid() {
//                         return current ? _assignXid(current) : invalidXid
//                 },
//         }
// }
// export type Transam = ReturnType<typeof createTransam>
