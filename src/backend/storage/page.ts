export type Key = number | string
export type Rid = [number, number]
export type Cmp<K = Key> = (a: K, b: K) => number
export type LeafItem<K> = { key: K; rid: Rid }
export type Pivot<K> = { key: K; child: number }
export type Item<K> = LeafItem<K> | Pivot<K>
export type Node<K> = { id: number; level: number; prev: number; next: number; high?: K; items: Array<Item<K>> }
export type Meta = { root: number; next: number; height: number; tuples: number; capacity: number }
export const NONE = 0
export const defaultCmp: Cmp<any> = (a, b) => {
        if (a < b) return -1
        if (a > b) return 1
        return 0
}
export const isPivot = <K>(item: Item<K>): item is Pivot<K> => 'child' in item
export const sameRid = (a: Rid, b: Rid) => a[0] === b[0] && a[1] === b[1]
export const createPage = <K>(meta: Meta) => {
        const pages = new Map<number, Node<K>>()
        return {
                pages,
                page(level: number): Node<K> {
                        const node = { id: meta.next++, level, prev: NONE, next: NONE, items: [] }
                        pages.set(node.id, node)
                        return node
                },
                get(id: number) {
                        return pages.get(id) as Node<K>
                },
        }
}
export const bound = <K>(items: Array<Item<K>>, key: K, cmp: Cmp<K>, upper = false) => {
        let lo = 0
        let hi = items.length
        while (lo < hi) {
                const mid = (lo + hi) >>> 1
                const order = cmp(items[mid].key, key)
                if (order < 0 || (upper && order === 0)) lo = mid + 1
                if (order > 0 || (!upper && order === 0)) hi = mid
        }
        return lo
}
