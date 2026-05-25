import type { Column } from './types'
import type { TableLike } from './infer'
type AnyTable = TableLike
export interface ColumnRef {
        name: string
        column: Column
}
export interface ConstraintGroup {
        columns: ColumnRef[]
}
export interface ForeignKeyRef {
        columns: ColumnRef[]
        foreignTable: { name: string }
        foreignColumns: ColumnRef[]
}
export interface ForeignKey {
        columns: ColumnRef[]
        reference(): ForeignKeyRef
        onDelete?: string
        onUpdate?: string
}
export interface TableConfig {
        name: string
        schema?: string
        columns: Column[]
        primaryKeys: ConstraintGroup[]
        foreignKeys: ForeignKey[]
        uniqueConstraints: ConstraintGroup[]
        indexes: unknown[]
        checks: unknown[]
}
const colRef = (col: Column): ColumnRef => ({ name: col.$col.name, column: col })
export const getTableColumns = (t: AnyTable): Record<string, Column> => {
        const cols: Record<string, Column> = {}
        for (const col of t.$meta.columns) cols[col.$col.key ?? col.$col.name] = col
        return cols
}
export const getTableConfig = (t: AnyTable): TableConfig => {
        const columns = t.$meta.columns
        const primaryCols = columns.filter((c) => !!c.$col.primaryKey)
        const primaryKeys: ConstraintGroup[] = primaryCols.length > 0 ? [{ columns: primaryCols.map(colRef) }] : []
        const uniqueConstraints: ConstraintGroup[] = columns.filter((c) => !!c.$col.unique).map((c) => ({ columns: [colRef(c)] }))
        const foreignKeys: ForeignKey[] = []
        for (const col of columns) {
                const ref = col.$col.references
                if (!ref) continue
                const reference = (): ForeignKeyRef => {
                        const target = ref.fn() as Column
                        const tableName = target?.$col?.tableName ?? ''
                        return { columns: [colRef(col)], foreignColumns: [colRef(target)], foreignTable: { name: tableName } }
                }
                foreignKeys.push({ columns: [colRef(col)], reference, onDelete: ref.onDelete, onUpdate: ref.onUpdate })
        }
        return { name: t.$meta.name, schema: undefined, columns, primaryKeys, foreignKeys, uniqueConstraints, indexes: [], checks: [] }
}
