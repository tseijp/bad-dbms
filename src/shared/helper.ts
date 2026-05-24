import type { Row, TableRef } from './types'
export const isNullish = (v: unknown): boolean => v === null || v === undefined
export const tableNameOf = (t: TableRef | unknown): string => {
        if (typeof t === 'string') return t
        const v = t as { $meta?: { name: string }; node?: { name?: string } }
        return v?.$meta?.name ?? v?.node?.name ?? ''
}
export const stripRid = (row: Row): Row => {
        if (!row || typeof row !== 'object' || !('__rid' in row)) return row
        const out: Row = {}
        for (const k in row) if (k !== '__rid') out[k] = row[k]
        return out
}
