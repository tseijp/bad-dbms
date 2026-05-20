import type { SQL } from '../sql'
import type { Column } from '../column'
const make = (node: any): SQL => ({ kind: 'sql', node })
export const asc = (col: Column | SQL): SQL => make({ type: 'order', dir: 'asc', col })
export const desc = (col: Column | SQL): SQL => make({ type: 'order', dir: 'desc', col })
