import { describe, it, expect } from 'vitest'
import { planSelect, buildProjection, tableNameOf } from '../../src/interface/plan'
import { table } from '../../src/interface/table'
import { integer, text } from '../../src/interface/column'
import { eq } from '../../src/interface/expressions/conditions'
import { asc } from '../../src/interface/expressions/select'
import { count, sum } from '../../src/interface/functions/aggregate'
import { ctx0 } from './_helpers'

const makeUsers = () =>
        table('users', {
                id: integer('id').primaryKey(),
                name: text('name'),
                score: integer('score'),
        })

describe('planSelect base shape', () => {
        it('emits SeqScan as innermost op', () => {
                const users = makeUsers()
                const { plan } = planSelect({ op: 'Select', table: users }, ctx0())
                expect(plan.op).toBe('SeqScan')
        })

        it('puts Filter above SeqScan when where is given', () => {
                const users = makeUsers()
                const { plan } = planSelect({ op: 'Select', table: users, where: eq((users as any).id, 1) }, ctx0())
                expect(plan.op).toBe('Filter')
                expect(plan.child.op).toBe('SeqScan')
        })

        it('Filter predicate is a compiled function', () => {
                const users = makeUsers()
                const { plan } = planSelect({ op: 'Select', table: users, where: eq((users as any).id, 1) }, ctx0())
                expect(typeof plan.predicate).toBe('function')
        })
})

describe('planSelect projection', () => {
        it('puts Projection on top when projection is plain columns', () => {
                const users = makeUsers()
                const projection = [{ alias: 'id', expr: (users as any).id }]
                const { plan } = planSelect({ op: 'Select', table: users, projection }, ctx0())
                expect(plan.op).toBe('Projection')
        })

        it('Projection.fields contains projected field names', () => {
                const users = makeUsers()
                const projection = [
                        { alias: 'id', expr: (users as any).id },
                        { alias: 'name', expr: (users as any).name },
                ]
                const { plan } = planSelect({ op: 'Select', table: users, projection }, ctx0())
                expect(plan.fields).toEqual(['id', 'name'])
        })
})

describe('planSelect aggregate', () => {
        it('puts Aggregate when projection has aggregate', () => {
                const users = makeUsers()
                const projection = [{ alias: 't', expr: count() }]
                const { plan } = planSelect({ op: 'Select', table: users, projection }, ctx0())
                const inner = plan.op === 'Projection' ? plan.child : plan
                expect(inner.op).toBe('Aggregate')
        })

        it('puts Projection on top of Aggregate when projection has aggregates', () => {
                const users = makeUsers()
                const projection = [{ alias: 't', expr: count() }]
                const { plan } = planSelect({ op: 'Select', table: users, projection }, ctx0())
                expect(plan.op).toBe('Projection')
        })

        it('Aggregate defaults groupBy to empty array when omitted', () => {
                const users = makeUsers()
                const projection = [{ alias: 's', expr: sum((users as any).score) }]
                const { plan } = planSelect({ op: 'Select', table: users, projection }, ctx0())
                const agg = plan.op === 'Projection' ? plan.child : plan
                expect(agg.groupBy).toEqual([])
        })
})

describe('planSelect orderBy', () => {
        it('puts Sort on top when orderBy is given', () => {
                const users = makeUsers()
                const { plan } = planSelect({ op: 'Select', table: users, orderBy: [asc((users as any).id)] }, ctx0())
                expect(plan.op).toBe('Sort')
        })

        it('Sort.keys contains field and dir', () => {
                const users = makeUsers()
                const { plan } = planSelect({ op: 'Select', table: users, orderBy: [asc((users as any).id)] }, ctx0())
                expect(plan.keys[0]).toEqual({ field: 'id', dir: 'asc' })
        })
})

describe('buildProjection', () => {
        it('returns hasAgg false when only columns are projected', () => {
                const users = makeUsers()
                const info = buildProjection([{ alias: 'id', expr: (users as any).id }])
                expect(info.hasAgg).toBe(false)
        })

        it('returns hasAgg true when an aggregate is projected', () => {
                const info = buildProjection([{ alias: 't', expr: count() }])
                expect(info.hasAgg).toBe(true)
        })

        it('returns empty fields array for missing projection', () => {
                expect(buildProjection(undefined).fields).toEqual([])
        })
})

describe('tableNameOf', () => {
        it('returns name for a string table reference', () => {
                expect(tableNameOf('users')).toBe('users')
        })

        it('returns $meta.name for a Table object', () => {
                const users = makeUsers()
                expect(tableNameOf(users)).toBe('users')
        })
})

// Roadmap: subquery / EXISTS / CTE / window functions / NULLS FIRST /
// DISTINCT ON / GROUPING SETS / update().from() join lowering is not
// covered. limit / offset shaping above Projection / Sort is also out
// of scope until planSelect emits a dedicated Limit op.
