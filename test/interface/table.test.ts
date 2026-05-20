import { describe, it, expect } from 'vitest'
import { table } from '../../src/interface/table'
import { integer, text } from '../../src/interface/column'

describe('table factory', () => {
        it('attaches $meta.name', () => {
                const t = table('users', { id: integer('id') })
                expect((t as any).$meta.name).toBe('users')
        })

        it('$meta.columns lists schema columns in declaration order', () => {
                const t = table('users', { id: integer('id'), name: text('name') })
                const names = (t as any).$meta.columns.map((c: any) => c.$col.name)
                expect(names).toEqual(['id', 'name'])
        })

        it('each column SqlNode carries tableName for qualified resolution', () => {
                const t = table('users', { id: integer('id') })
                expect((t as any).id.node.tableName).toBe('users')
        })
})

// Roadmap: subquery, EXISTS, CTE, window function, NULLS FIRST,
// DISTINCT ON, GROUPING SETS, update().from() join, on conflict are
// out of scope for table.ts tests.
