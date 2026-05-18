import type { Page } from '../storage/page'

const F_LEAF = 1 << 0
const F_ROOT = 1 << 1
const F_DELETED = 1 << 2
const F_HALF_DEAD = 1 << 3
const F_INCOMPLETE_SPLIT = 1 << 4
const P_NONE = 0

export type Key = number | string | symbol
export type Rid = [number, number]
type Item = { key: Key; rid: Rid; downlink: number }
type Opaque = { prev: number; next: number; level: number; flags: number; cycleId: number; safeXid: number }
type BTPage = { id: number; opaque: Opaque; items: Item[]; highKey?: Item }
type Meta = { root: number; fastRoot: number; fastLevel: number; nextId: number }
export type Cmp = (a: Key, b: Key) => number

const MINUS_INF: Key = Symbol('minus-infinity') as Key
const INVALID_RID: Rid = [0, 0]
const isLeaf = (p: BTPage) => (p.opaque.flags & F_LEAF) !== 0
const isRightmost = (p: BTPage) => p.opaque.next === P_NONE
const hasHighKey = (p: BTPage) => p.highKey !== undefined && !isRightmost(p)

const defaultCmp: Cmp = (a, b) => {
        if (a === MINUS_INF && b === MINUS_INF) return 0
        if (a === MINUS_INF) return -1
        if (b === MINUS_INF) return 1
        if (a < (b as any)) return -1
        if (a > (b as any)) return 1
        return 0
}

const cmpItem = (cmp: Cmp, a: Item, b: Item): number => {
        const k = cmp(a.key, b.key)
        if (k !== 0) return k
        const r = a.rid[0] - b.rid[0]
        if (r !== 0) return r
        return a.rid[1] - b.rid[1]
}

export const createNbtree = (pageCapacity = 64, cmp: Cmp = defaultCmp) => {
        const pages = new Map<number, BTPage>()
        const meta: Meta = { root: P_NONE, fastRoot: P_NONE, fastLevel: 0, nextId: 1 }
        let cycleId = 0

        const allocPage = (level: number, flags: number): BTPage => {
                const id = meta.nextId++
                const opaque: Opaque = { prev: P_NONE, next: P_NONE, level, flags, cycleId, safeXid: 0 }
                const page: BTPage = { id, opaque, items: [] }
                pages.set(id, page)
                return page
        }

        const getPage = (id: number) => pages.get(id) as BTPage

        const findItem = (page: BTPage, key: Key): number => {
                let lo = 0,
                        hi = page.items.length
                while (lo < hi) {
                        const mid = (lo + hi) >>> 1
                        if (cmp(page.items[mid].key, key) < 0) lo = mid + 1
                        else hi = mid
                }
                return lo
        }

        const moveRight = (start: BTPage, key: Key): BTPage => {
                let p = start
                while (hasHighKey(p) && cmp(p.highKey!.key, key) < 0 && p.opaque.next !== P_NONE) p = getPage(p.opaque.next)
                return p
        }

        const descendFrom = (rootId: number, key: Key, stopLevel: number): { page: BTPage; stack: number[] } => {
                const stack: number[] = []
                let page = getPage(rootId)
                while (page.opaque.level > stopLevel) {
                        page = moveRight(page, key)
                        stack.push(page.id)
                        const i = findItem(page, key)
                        const idx = i < page.items.length ? i : page.items.length - 1
                        const child = page.items[idx].downlink
                        page = getPage(child)
                }
                page = moveRight(page, key)
                return { page, stack }
        }

        const descend = (key: Key, stopLevel = 0) => {
                if (meta.root === P_NONE) return { page: undefined as any as BTPage, stack: [] as number[] }
                return descendFrom(meta.fastRoot, key, stopLevel)
        }

        const initRoot = (key: Key, rid: Rid) => {
                const leaf = allocPage(0, F_LEAF | F_ROOT)
                leaf.items.push({ key, rid, downlink: P_NONE })
                meta.root = leaf.id
                meta.fastRoot = leaf.id
                meta.fastLevel = 0
        }

        const truncateSeparator = (lastLeft: Item, firstRight: Item): Item => {
                if (cmp(lastLeft.key, firstRight.key) === 0) return { key: firstRight.key, rid: firstRight.rid, downlink: 0 }
                return { key: firstRight.key, rid: INVALID_RID, downlink: 0 }
        }

        const installNewRoot = (left: BTPage, right: BTPage, sep: Item) => {
                left.opaque.flags &= ~F_ROOT
                const root = allocPage(left.opaque.level + 1, F_ROOT)
                root.items.push({ key: MINUS_INF, rid: INVALID_RID, downlink: left.id })
                root.items.push({ key: sep.key, rid: sep.rid, downlink: right.id })
                meta.root = root.id
                if (meta.fastLevel < root.opaque.level - 1) {
                        meta.fastRoot = root.id
                        meta.fastLevel = root.opaque.level
                }
                left.opaque.flags &= ~F_INCOMPLETE_SPLIT
        }

        const findParentByRedescend = (child: BTPage): number => {
                if (child.opaque.flags & F_ROOT) return P_NONE
                const sentinel = child.items.length > 0 ? child.items[0].key : MINUS_INF
                const { stack } = descendFrom(meta.root, sentinel, child.opaque.level + 1)
                return stack.length > 0 ? stack[stack.length - 1] : P_NONE
        }

        const insertDownlink = (stack: number[], child: BTPage, sibling: BTPage, sep: Item) => {
                const parentId = stack.length > 0 ? stack[stack.length - 1] : findParentByRedescend(child)
                if (parentId === P_NONE) return installNewRoot(child, sibling, sep)
                let parent = getPage(parentId)
                parent = moveRight(parent, sep.key)
                const insertItem: Item = { key: sep.key, rid: sep.rid, downlink: sibling.id }
                const pos = findItem(parent, sep.key)
                parent.items.splice(pos, 0, insertItem)
                if (parent.items.length > pageCapacity) splitPage(parent, stack.slice(0, -1))
        }

        const splitPage = (page: BTPage, parentStack: number[]): void => {
                const all = page.items
                const mid = all.length >>> 1
                const left = all.slice(0, mid)
                const right = all.slice(mid)
                const sibling = allocPage(page.opaque.level, page.opaque.flags & F_LEAF)
                sibling.items = right
                sibling.opaque.next = page.opaque.next
                sibling.opaque.prev = page.id
                if (page.opaque.next !== P_NONE) getPage(page.opaque.next).opaque.prev = sibling.id
                if (hasHighKey(page)) sibling.highKey = page.highKey
                page.items = left
                page.opaque.next = sibling.id
                page.opaque.flags |= F_INCOMPLETE_SPLIT
                const sep = isLeaf(page) ? truncateSeparator(left[left.length - 1], right[0]) : { key: right[0].key, rid: INVALID_RID, downlink: 0 }
                page.highKey = { key: sep.key, rid: sep.rid, downlink: sibling.id }
                if (page.opaque.flags & F_ROOT) return installNewRoot(page, sibling, sep)
                insertDownlink(parentStack, page, sibling, sep)
                page.opaque.flags &= ~F_INCOMPLETE_SPLIT
        }

        const insert = (key: Key, rid: Rid): void => {
                if (meta.root === P_NONE) return initRoot(key, rid)
                const { page, stack } = descend(key, 0)
                const pos = findItem(page, key)
                page.items.splice(pos, 0, { key, rid, downlink: P_NONE })
                if (page.items.length > pageCapacity) splitPage(page, stack)
        }

        const search = (key: Key): Rid | undefined => {
                if (meta.root === P_NONE) return undefined
                const { page } = descend(key, 0)
                const pos = findItem(page, key)
                if (pos >= page.items.length) return undefined
                const it = page.items[pos]
                if (cmp(it.key, key) !== 0) return undefined
                return it.rid
        }

        const scanForward = (start: Key, end: Key, emit: (key: Key, rid: Rid) => boolean): void => {
                if (meta.root === P_NONE) return
                let { page } = descend(start, 0)
                let idx = findItem(page, start)
                while (true) {
                        while (idx < page.items.length) {
                                const it = page.items[idx]
                                if (cmp(it.key, end) > 0) return
                                if (!emit(it.key, it.rid)) return
                                idx++
                        }
                        if (isRightmost(page)) return
                        page = getPage(page.opaque.next)
                        idx = 0
                }
        }

        const scanBackward = (start: Key, end: Key, emit: (key: Key, rid: Rid) => boolean): void => {
                if (meta.root === P_NONE) return
                let { page } = descend(start, 0)
                let original = page.id
                let idx = findItem(page, start) - 1
                if (idx < 0) idx = page.items.length - 1
                while (true) {
                        while (idx >= 0) {
                                const it = page.items[idx]
                                if (cmp(it.key, end) < 0) return
                                if (!emit(it.key, it.rid)) return
                                idx--
                        }
                        const leftId = page.opaque.prev
                        if (leftId === P_NONE) return
                        let left = getPage(leftId)
                        while (left.opaque.next !== original && left.opaque.next !== P_NONE) left = getPage(left.opaque.next)
                        page = left
                        original = page.id
                        idx = page.items.length - 1
                }
        }

        const unlinkPage = (page: BTPage) => {
                const left = page.opaque.prev !== P_NONE ? getPage(page.opaque.prev) : undefined
                const right = page.opaque.next !== P_NONE ? getPage(page.opaque.next) : undefined
                if (left) left.opaque.next = page.opaque.next
                if (right) right.opaque.prev = page.opaque.prev
                page.opaque.flags = (page.opaque.flags & ~F_HALF_DEAD) | F_DELETED
                page.opaque.safeXid = ++cycleId
        }

        const markHalfDead = (page: BTPage, stack: number[]) => {
                page.opaque.flags |= F_HALF_DEAD
                const parentId = stack.length > 0 ? stack[stack.length - 1] : P_NONE
                if (parentId === P_NONE) return
                const parent = getPage(parentId)
                const dlIdx = parent.items.findIndex((it) => it.downlink === page.id)
                if (dlIdx >= 0) parent.items.splice(dlIdx, 1)
                unlinkPage(page)
        }

        const deleteKey = (key: Key, rid?: Rid): boolean => {
                if (meta.root === P_NONE) return false
                const { page, stack } = descend(key, 0)
                const pos = findItem(page, key)
                if (pos >= page.items.length || cmp(page.items[pos].key, key) !== 0) return false
                const target: Item = { key, rid: rid ?? page.items[pos].rid, downlink: P_NONE }
                const idx = page.items.findIndex((it) => cmpItem(cmp, it, target) === 0)
                if (idx < 0) return false
                page.items.splice(idx, 1)
                if (page.items.length === 0 && !(page.opaque.flags & F_ROOT) && !isRightmost(page)) markHalfDead(page, stack)
                return true
        }

        const buildUpperLevels = (children: BTPage[]) => {
                let level = children
                while (level.length > 1) {
                        const parents: BTPage[] = []
                        let parent = allocPage(level[0].opaque.level + 1, 0)
                        parents.push(parent)
                        parent.items.push({ key: MINUS_INF, rid: INVALID_RID, downlink: level[0].id })
                        for (let i = 1; i < level.length; i++) {
                                if (parent.items.length >= pageCapacity) {
                                        const next = allocPage(parent.opaque.level, 0)
                                        next.opaque.prev = parent.id
                                        parent.opaque.next = next.id
                                        parent = next
                                        parents.push(parent)
                                        parent.items.push({ key: MINUS_INF, rid: INVALID_RID, downlink: level[i].id })
                                        continue
                                }
                                parent.items.push({ key: level[i].items[0].key, rid: INVALID_RID, downlink: level[i].id })
                        }
                        level = parents
                }
                level[0].opaque.flags |= F_ROOT
                meta.root = level[0].id
                meta.fastRoot = level[0].id
                meta.fastLevel = level[0].opaque.level
        }

        const bulkLoad = (sorted: Array<[Key, Rid]>): void => {
                if (sorted.length === 0) return
                let current = allocPage(0, F_LEAF | F_ROOT)
                meta.root = current.id
                meta.fastRoot = current.id
                const leaves: BTPage[] = [current]
                for (const [k, r] of sorted) {
                        if (current.items.length >= pageCapacity) {
                                const next = allocPage(0, F_LEAF)
                                next.opaque.prev = current.id
                                current.opaque.next = next.id
                                current.highKey = { key: k, rid: INVALID_RID, downlink: next.id }
                                current.opaque.flags &= ~F_ROOT
                                current = next
                                leaves.push(current)
                        }
                        current.items.push({ key: k, rid: r, downlink: P_NONE })
                }
                if (leaves.length === 1) return
                buildUpperLevels(leaves)
        }

        const beginVacuum = () => ++cycleId
        const stats = () => ({ pages: pages.size, root: meta.root, fastRoot: meta.fastRoot, fastLevel: meta.fastLevel })

        return { insert, search, scanForward, scanBackward, deleteKey, bulkLoad, beginVacuum, stats, _pages: pages, _meta: meta }
}

export const MINUS_INFINITY = MINUS_INF
export type Nbtree = ReturnType<typeof createNbtree>
export type { Page }
