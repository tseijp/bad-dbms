import type { SQL } from '../../shared/types'
import type { Column } from '../types'
import { make } from '../sql'
export const asc = (col: Column | SQL): SQL => make({ type: 'order', dir: 'asc', col: col as SQL })
export const desc = (col: Column | SQL): SQL => make({ type: 'order', dir: 'desc', col: col as SQL })
