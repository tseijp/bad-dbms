import { finalizeColumn } from './table'
import { colNameOf } from './compile'
import type { SQL, AlterCmd, ColumnDef } from '../shared/types'
import type { AlterAst } from './types'
export const referenceOf = (c: { references?: { fn: () => SQL; onDelete?: string } }) => {
        const tc = (c.references?.fn() as { $col?: { key?: string; name?: string; tableName?: string } } | undefined)?.$col
        if (!c.references || !tc?.tableName) return undefined
        return { table: tc.tableName, column: tc.key ?? tc.name ?? '', onDelete: c.references.onDelete }
}
export const columnDefOf = (key: string, col: any): ColumnDef => {
        const c = col.$col
        return {
                name: c.key ?? c.name ?? key,
                type: c.type,
                isPrimary: !!c.primaryKey,
                isUnique: !!c.unique,
                notNull: !!c.notNull || !!c.primaryKey,
                isText: c.tag === 'str',
                defaultValue: c.defaultValue,
                defaultFn: c.defaultFn,
                references: referenceOf(c),
        }
}
export const columnDefsOf = (table: any): ColumnDef[] => table.$meta.columns.map((col: any) => columnDefOf(col.$col.key ?? col.$col.name, col))
export const alterMethods = (ast: AlterAst, b: () => any) => {
        const push = (cmd: AlterCmd) => (ast.cmds.push(cmd), b())
        return {
                renameTo(to: string) {
                        return push({ kind: 'RenameTable', to })
                },
                addColumn(col: any) {
                        return push({ kind: 'AddColumn', def: columnDefOf(col.$col?.name ?? '', col), col })
                },
                dropColumn(col: unknown) {
                        return push({ kind: 'DropColumn', name: colNameOf(col) })
                },
                renameColumn(col: unknown, to: string) {
                        return push({ kind: 'RenameColumn', name: colNameOf(col), to })
                },
                setDefault(col: unknown, value: unknown) {
                        return push({ kind: 'SetDefault', name: colNameOf(col), value })
                },
                dropDefault(col: unknown) {
                        return push({ kind: 'DropDefault', name: colNameOf(col) })
                },
                addUnique(col: unknown) {
                        return push({ kind: 'AddUnique', name: colNameOf(col) })
                },
                dropUnique(col: unknown) {
                        return push({ kind: 'DropUnique', name: colNameOf(col) })
                },
        }
}
const renameKey = (table: any, from: string, to: string) => {
        const col = table[from]
        if (!col) return
        col.$col.name = to
        col.$col.key = to
        col.node.name = to
        col.name = to
        delete table[from]
        table[to] = col
}
export const syncTable = (table: any, cmds: AlterCmd[]) => {
        for (const cmd of cmds) {
                if (cmd.kind === 'RenameTable') {
                        table.$meta.name = cmd.to
                        table.node.name = cmd.to
                        for (const col of table.$meta.columns) ((col.$col.tableName = cmd.to), (col.node.tableName = cmd.to))
                }
                if (cmd.kind === 'AddColumn' && cmd.col) {
                        const col = finalizeColumn(cmd.col as any, cmd.def.name, table.$meta.name)
                        table[cmd.def.name] = col
                        table.$meta.columns.push(col)
                }
                if (cmd.kind === 'DropColumn') {
                        delete table[cmd.name]
                        table.$meta.columns = table.$meta.columns.filter((col: any) => (col.$col.key ?? col.$col.name) !== cmd.name)
                }
                if (cmd.kind === 'RenameColumn') renameKey(table, cmd.name, cmd.to)
                if (cmd.kind === 'SetDefault') Object.assign(table[cmd.name]?.$col ?? {}, { defaultValue: cmd.value })
                if (cmd.kind === 'DropDefault') Object.assign(table[cmd.name]?.$col ?? {}, { defaultValue: undefined, defaultFn: undefined })
                if (cmd.kind === 'AddUnique') Object.assign(table[cmd.name]?.$col ?? {}, { unique: true })
                if (cmd.kind === 'DropUnique') Object.assign(table[cmd.name]?.$col ?? {}, { unique: false })
        }
}
