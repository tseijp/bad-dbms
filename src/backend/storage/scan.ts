import { NONE, bound } from './page'
import type { Cmp, Key, LeafItem, Meta, Node, Rid } from './page'
export const createNbtreeScans = <K extends Key>(meta: Meta, get: (id: number) => Node<K>, seek: (key: K) => { node: Node<K>; path: Node<K>[] }, cmp: Cmp<K>) => {
        return {
                forward(start: K, end: K, emit: (key: K, rid: Rid) => boolean): void {
                        if (meta.root === NONE) return
                        let { node } = seek(start)
                        let at = bound(node.items, start, cmp)
                        while (true) {
                                while (at < node.items.length) {
                                        const item = node.items[at++] as LeafItem<K>
                                        if (cmp(item.key, end) > 0) return
                                        if (!emit(item.key, item.rid)) return
                                }
                                if (node.next === NONE) return
                                node = get(node.next)
                                at = 0
                        }
                },
                backward(start: K, end: K, emit: (key: K, rid: Rid) => boolean): void {
                        if (meta.root === NONE) return
                        let { node } = seek(start)
                        let at = bound(node.items, start, cmp)
                        if (at >= node.items.length || cmp(node.items[at].key, start) > 0) at -= 1
                        while (true) {
                                while (at >= 0) {
                                        const item = node.items[at--] as LeafItem<K>
                                        if (cmp(item.key, end) < 0) return
                                        if (!emit(item.key, item.rid)) return
                                }
                                if (node.prev === NONE) return
                                node = get(node.prev)
                                at = node.items.length - 1
                        }
                },
        }
}
