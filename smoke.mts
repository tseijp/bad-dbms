import { setup, runTicks, cells } from './src/index'

const main = async () => {
        const { db, tick } = await setup()
        const stats0 = db.stats()
        process.stdout.write('STATS_AFTER_INIT ' + JSON.stringify(stats0) + '\n')
        const rel = db.catalog.resolve('cells')
        if (!rel) {
                process.stdout.write('FAIL no relation\n')
                process.exit(1)
        }
        const desc = db.catalog.tupleDescriptor(rel)
        const initialRows: any[] = []
        rel.heaps[0].scan((rid: any) => {
                const row: any = { __rid: rid }
                for (const col of desc.columns) row[col.name] = col.heap.read(rid)
                initialRows.push(row)
        })
        process.stdout.write('INIT_ROW_COUNT ' + initialRows.length + '\n')
        process.stdout.write('FIRST5 ' + JSON.stringify(initialRows.slice(0, 5)) + '\n')
        const aliveBefore = initialRows.filter((r) => r.a === 1).length
        process.stdout.write('ALIVE_BEFORE ' + aliveBefore + '\n')
        process.stdout.write('STARTING_TICKS\n')
        await tick.run({})
        process.stdout.write('TICK_1_DONE\n')
        const after: any[] = []
        rel.heaps[0].scan((rid: any) => {
                const row: any = { __rid: rid }
                for (const col of desc.columns) row[col.name] = col.heap.read(rid)
                after.push(row)
        })
        const aliveAfter = after.filter((r) => r.a === 1).length
        process.stdout.write('ALIVE_AFTER ' + aliveAfter + '\n')
        process.stdout.write('AFTER_FIRST5 ' + JSON.stringify(after.slice(0, 5)) + '\n')
        process.stdout.write('OK\n')
}

main().catch((e) => {
        process.stdout.write('ERROR ' + (e && e.stack ? e.stack : String(e)) + '\n')
        process.exit(1)
})
