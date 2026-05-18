import type { Page } from '../storage/page'
import { NONE, bound, createPageStore, defaultCmp, isPivot, sameRid } from './nbtree-page'
import { createNbtreeScans } from './nbtree-scan'
import type { Cmp, Key, LeafItem, Meta, Node, Pivot, Rid } from './nbtree-page'

export const createNbtree = <K extends Key = Key>(pageCapacity = 64, cmp: Cmp<K> = defaultCmp) => {
        const meta: Meta = { root: NONE, next: 1, height: 0, tuples: 0, capacity: pageCapacity }
        const { pages, page, get } = createPageStore<K>(meta)
        const right = (node: Node<K>, key: K) => {
                let cur = node
                while (cur.next !== NONE && cur.high !== undefined && cmp(cur.high, key) < 0) cur = get(cur.next)
                return cur
        }
        const seek = (key: K, stop = 0) => {
                const path: Node<K>[] = []
                let node = get(meta.root)
                while (node.level > stop) {
                        node = right(node, key)
                        path.push(node)
                        const at = Math.max(0, bound(node.items, key, cmp, true) - 1)
                        node = get((node.items[at] as Pivot<K>).child)
                }
                return { node: right(node, key), path }
        }
        const link = (left: Node<K>, sibling: Node<K>) => {
                sibling.next = left.next
                sibling.prev = left.id
                if (left.next !== NONE) get(left.next).prev = sibling.id
                left.next = sibling.id
        }
        const newRoot = (left: Node<K>, right: Node<K>, key: K) => {
                const root = page(left.level + 1)
                root.items = [
                        { key: left.items[0].key, child: left.id },
                        { key, child: right.id },
                ]
                meta.root = root.id
                meta.height = root.level
        }
        const insertPivot = (path: Node<K>[], left: Node<K>, sibling: Node<K>, key: K): void => {
                const parent = path.pop()
                if (parent === undefined) return newRoot(left, sibling, key)
                const node = right(parent, key)
                node.items.splice(bound(node.items, key, cmp), 0, { key, child: sibling.id })
                if (node.items.length > pageCapacity) split(node, path)
        }
        const split = (node: Node<K>, path: Node<K>[]) => {
                const mid = node.items.length >>> 1
                const sibling = page(node.level)
                sibling.items = node.items.splice(mid)
                link(node, sibling)
                node.high = sibling.items[0].key
                const sep = sibling.items[0].key
                if (meta.root === node.id) return newRoot(node, sibling, sep)
                insertPivot(path, node, sibling, sep)
        }
        const insert = (key: K, rid: Rid): void => {
                if (meta.root === NONE) {
                        const root = page(0)
                        root.items.push({ key, rid })
                        meta.root = root.id
                        meta.tuples = 1
                        return
                }
                const { node, path } = seek(key)
                const item = { key, rid }
                const at = bound(node.items, key, cmp)
                node.items.splice(at, 0, item)
                meta.tuples += 1
                if (node.items.length > pageCapacity) split(node, path)
        }
        const search = (key: K): Rid | undefined => {
                if (meta.root === NONE) return undefined
                const { node } = seek(key)
                const item = node.items[bound(node.items, key, cmp)]
                if (item === undefined || isPivot(item) || cmp(item.key, key) !== 0) return undefined
                return item.rid
        }
        const { forward, backward } = createNbtreeScans(meta, get, seek, cmp)
        const lookup = (key: K, emit: (rid: Rid) => boolean): void => forward(key, key, (_, rid) => emit(rid))
        const deleteKey = (key: K, rid?: Rid): boolean => {
                if (meta.root === NONE) return false
                const { node } = seek(key)
                let at = bound(node.items, key, cmp)
                while (at < node.items.length && cmp(node.items[at].key, key) === 0) {
                        const item = node.items[at] as LeafItem<K>
                        if (rid === undefined || sameRid(item.rid, rid)) {
                                node.items.splice(at, 1)
                                meta.tuples -= 1
                                return true
                        }
                        at += 1
                }
                return false
        }
        const bulkLoad = (entries: Iterable<[K, Rid]>): void => {
                for (const [key, rid] of entries) insert(key, rid)
        }
        const beginVacuum = () => 0
        const stats = () => ({ pages: pages.size, root: meta.root, height: meta.height, tuples: meta.tuples, pageCapacity: meta.capacity })
        return { insert, search, lookup, forward, backward, deleteKey, bulkLoad, beginVacuum, stats, _pages: pages, _meta: meta }
}

export type Nbtree<K extends Key = Key> = ReturnType<typeof createNbtree<K>>
export type { Cmp, Key, Rid }
export type { Page }
