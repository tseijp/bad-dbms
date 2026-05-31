import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text, getTableConfig } from '../../src/index'
// schema rework: attack the foreign-key reference against the correct Drizzle
// spec, not the bad-dbms `$col.references` shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * `getTableConfig(table).foreignKeys` lists every declared foreign key.
//   * a foreign key resolves to its target table and column, and records the
//     `onDelete` action.
//   * a plain column contributes no foreign key to the table config.
// bad-dbms records a raw `$col.references = { fn, onDelete }` and exposes no
// introspection, so these fail honestly and are never weakened.
const factories = { integer, uint, float, text }
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']
describe('foreign key reference', () => {
        it('lists a declared foreign key in getTableConfig', () => {
                const users = table('users', { id: integer('id').primaryKey() })
                const posts = table('posts', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => users.id),
                })
                const config = getTableConfig(posts)
                expect(config.foreignKeys.length).toBe(1)
        })
        it('reports no foreign keys in getTableConfig when none is declared', () => {
                const t = table('t', { id: integer('id').primaryKey(), userId: integer('user_id') })
                const config = getTableConfig(t)
                expect(config.foreignKeys).toEqual([])
        })
        it('resolves a foreign key to its referencing column name', () => {
                const users = table('users', { id: integer('id').primaryKey() })
                const posts = table('posts', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => users.id),
                })
                const fk = getTableConfig(posts).foreignKeys[0]
                const ref = fk.reference()
                expect(ref.columns.map((c) => c.name)).toContain('user_id')
        })
        it('resolves a foreign key to its target table name', () => {
                const users = table('users', { id: integer('id').primaryKey() })
                const posts = table('posts', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => users.id),
                })
                const fk = getTableConfig(posts).foreignKeys[0]
                const ref = fk.reference()
                expect(ref.foreignTable.$meta?.name ?? ref.foreignTable.name).toBe('users')
        })
        it.each(['cascade', 'restrict', 'set null', 'no action'])('records the onDelete action %s on the foreign key', (action) => {
                const users = table('users', { id: integer('id').primaryKey() })
                const posts = table('posts', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => users.id, { onDelete: action }),
                })
                const fk = getTableConfig(posts).foreignKeys[0]
                expect(fk.onDelete).toBe(action)
        })
        it('records an onUpdate action on the foreign key', () => {
                const users = table('users', { id: integer('id').primaryKey() })
                const posts = table('posts', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => users.id, { onUpdate: 'cascade' }),
                })
                const fk = getTableConfig(posts).foreignKeys[0]
                expect(fk.onUpdate).toBe('cascade')
        })
        it.each(factoryNames)('contributes no foreign key from a plain %s column', (name) => {
                const t = table('t', { id: integer('id').primaryKey(), c: factories[name]('c') })
                const config = getTableConfig(t)
                expect(config.foreignKeys).toEqual([])
        })
        it('lists a self-referential foreign key in getTableConfig', () => {
                const nodes = table('nodes', {
                        id: integer('id').primaryKey(),
                        parentId: integer('parent_id').references(() => nodes.id),
                })
                const config = getTableConfig(nodes)
                expect(config.foreignKeys.length).toBe(1)
        })
        it('resolves a self-referential foreign key back to its own table', () => {
                const nodes = table('nodes', {
                        id: integer('id').primaryKey(),
                        parentId: integer('parent_id').references(() => nodes.id),
                })
                const fk = getTableConfig(nodes).foreignKeys[0]
                const ref = fk.reference()
                expect(ref.foreignTable.$meta?.name ?? ref.foreignTable.name).toBe('nodes')
        })
        it('lists two foreign keys when a table references two parents', () => {
                const users = table('users', { id: integer('id').primaryKey() })
                const groups = table('groups', { id: integer('id').primaryKey() })
                const members = table('members', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => users.id),
                        groupId: integer('group_id').references(() => groups.id),
                })
                const config = getTableConfig(members)
                expect(config.foreignKeys.length).toBe(2)
        })
})
