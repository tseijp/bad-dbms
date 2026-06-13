import { tableNameOf, fromRows } from './utils'
import type { CreateTableOp, DropTableOp, AlterTableOp, AlterCmd, ColumnDef } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
const done = () => fromRows([{ rowCount: 0, changes: 0 }])
export const createCreateTable = async (catalog: Catalog, ast: CreateTableOp): Promise<RowIterator> => {
        const name = tableNameOf(ast.table)
        if (catalog.find(name)) throw new Error(`relation already exists: ${name}`)
        const def: Record<string, ColumnDef> = {}
        for (const c of ast.columns) def[c.name] = c
        catalog.register(name, def as Parameters<Catalog['register']>[1])
        return done()
}
export const createDropTable = async (catalog: Catalog, ast: DropTableOp): Promise<RowIterator> => {
        await catalog.dropTable(tableNameOf(ast.table))
        return done()
}
const applyCmd = async (catalog: Catalog, name: string, cmd: AlterCmd): Promise<string> => {
        if (cmd.kind === 'RenameTable') return catalog.rename(name, cmd.to), cmd.to
        const rel = catalog.resolve(name)
        if (cmd.kind === 'AddColumn') await catalog.alter.addColumn(rel, cmd.def)
        if (cmd.kind === 'DropColumn') await catalog.alter.dropColumn(rel, cmd.name)
        if (cmd.kind === 'RenameColumn') catalog.alter.renameColumn(rel, cmd.name, cmd.to)
        if (cmd.kind === 'SetDefault') catalog.alter.setDefault(rel, cmd.name, cmd.value)
        if (cmd.kind === 'DropDefault') catalog.alter.dropDefault(rel, cmd.name)
        if (cmd.kind === 'AddUnique') await catalog.alter.addUnique(rel, cmd.name)
        if (cmd.kind === 'DropUnique') catalog.alter.dropUnique(rel, cmd.name)
        return name
}
export const createAlterTable = async (catalog: Catalog, ast: AlterTableOp): Promise<RowIterator> => {
        let name = tableNameOf(ast.table)
        for (const cmd of ast.cmds) name = await applyCmd(catalog, name, cmd)
        return done()
}
