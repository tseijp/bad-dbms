import type { ColumnType, Rid, Row } from '../shared/types'
import type { ColumnMeta, ColumnCodec } from './types'
export const BYTE_SIZE: Record<ColumnType, number> = { i32: 4, f32: 4, u32: 4 }
export const COLUMN_FORK_BASE = 10
export const INDEX_FORK_BASE = 1000
const STORAGE_STRIDE = 10000
export const storageRelOf = (relId: number, forkId: number) => relId * STORAGE_STRIDE + forkId
export const ridKey = (rid: Rid): string => `${rid[0]}:${rid[1]}`
export const makeCodec = (): ColumnCodec => ({ strings: [], intern: new Map(), nulls: new Set() })
export const buildColumn = (name: string, def: Partial<ColumnMeta>, forkId: number): ColumnMeta => ({
        name: def.name ?? name,
        type: def.type ?? 'i32',
        byteSize: BYTE_SIZE[def.type ?? 'i32'],
        forkId,
        isPrimary: !!def.isPrimary,
        isUnique: !!def.isUnique,
        notNull: !!def.notNull,
        isText: !!def.isText,
        defaultValue: def.defaultValue,
        defaultFn: def.defaultFn,
        references: def.references,
})
export const needsIndex = (col: ColumnMeta) => col.isPrimary || col.isUnique
export const encodeCell = (col: ColumnMeta, codec: ColumnCodec, value: unknown): number => {
        if (!col.isText) return Number(value)
        const s = String(value)
        const hit = codec.intern.get(s)
        if (hit !== undefined) return hit
        const id = codec.strings.length + 1
        codec.strings.push(s)
        codec.intern.set(s, id)
        return id
}
export const decodeCell = (col: ColumnMeta, codec: ColumnCodec, raw: number | undefined): unknown => {
        if (!col.isText) return raw
        if (raw === undefined || raw <= 0) return ''
        return codec.strings[raw - 1] ?? ''
}
export const resolveInsertValue = (col: ColumnMeta, row: Row): { value: unknown; isNull: boolean } => {
        const has = Object.prototype.hasOwnProperty.call(row, col.name)
        const raw = has ? row[col.name] : undefined
        if (has && raw !== undefined && raw !== null) return { value: raw, isNull: false }
        if (has && raw === null) return { value: col.isText ? '' : 0, isNull: true }
        if (col.defaultFn) return { value: col.defaultFn(), isNull: false }
        if (col.defaultValue !== undefined) return { value: col.defaultValue, isNull: false }
        return { value: col.isText ? '' : 0, isNull: true }
}
