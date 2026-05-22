import { describe, it, expect } from 'vitest'
import { table, text } from '../../src/index'
// schema rework: attack the text column against the correct Drizzle spec.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a `text` column is a STRING type. Its public `dataType` denotes a
//     string ('text' / 'string'), never a numeric bit-width code, and its
//     `columnType` tag identifies it as a text column.
//   * a text column carries a string default and a string-producing
//     `$defaultFn` — its declared value type is string, not number.
//   * text columns still expose the public constraint flags as strict
//     booleans (`primary`, `notNull`, `isUnique`).
// bad-dbms models text internally as `u32`, so the type assertions fail
// honestly and are never weakened to the implementation.
describe('text column data type (Drizzle parity)', () => {
        it('reports a string-denoting data type for a text column', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.dataType).toBe('text')
        })
        it('does not report a numeric u32 code as the text column type', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.dataType).not.toBe('u32')
        })
        it('does not report a numeric i32 code as the text column type', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.dataType).not.toBe('i32')
        })
        it('does not report a numeric f32 code as the text column type', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.dataType).not.toBe('f32')
        })
        it('tags a text column with a text columnType', () => {
                const t = table('t', { c: text('c') })
                expect(String((t as any).c.columnType).toLowerCase()).toContain('text')
        })
        it('records a string-denoting dataType on the text column node', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.node.dataType).toBe('text')
        })
        it('does not record a numeric u32 dataType on the text column node', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.node.dataType).not.toBe('u32')
        })
        it('keeps the explicit factory name on a text column', () => {
                const t = table('t', { c: text('given_name') })
                expect((t as any).c.name).toBe('given_name')
        })
        it('records a string default value on a text column', () => {
                const t = table('t', { c: text('c').default('hello') })
                expect((t as any).c.default).toBe('hello')
        })
        it('records an empty-string default on a text column', () => {
                const t = table('t', { c: text('c').default('') })
                expect((t as any).c.default).toBe('')
        })
        it('marks hasDefault true on a text column with a string default', () => {
                const t = table('t', { c: text('c').default('x') })
                expect((t as any).c.hasDefault).toBe(true)
        })
        it('marks a notNull text column not-null on the public flag', () => {
                const t = table('t', { c: text('c').notNull() })
                expect((t as any).c.notNull).toBe(true)
        })
        it('reports a plain text column as strictly nullable', () => {
                const t = table('t', { c: text('c') })
                expect((t as any).c.notNull).toBe(false)
        })
        it('marks a primaryKey text column primary on the public flag', () => {
                const t = table('t', { c: text('c').primaryKey() })
                expect((t as any).c.primary).toBe(true)
        })
        it('marks a unique text column unique on the public flag', () => {
                const t = table('t', { c: text('c').unique() })
                expect((t as any).c.isUnique).toBe(true)
        })
        it('records a string-producing $defaultFn on a text column', () => {
                const t = table('t', { c: text('c').$defaultFn(() => 'uuid') })
                expect((t as any).c.defaultFn()).toBe('uuid')
        })
})
