import type { Column } from '../../column'
import type { SQL } from '../sql'

/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in ascending
 * order. By the SQL standard, ascending order is the
 * default, so it is not usually necessary to specify
 * ascending sort order.
 *
 * ```ts
 * // Return cars, starting with the oldest models
 * // and going in ascending order to the newest.
 * db.select().from(cars)
 *   .orderBy(asc(cars.year));
 * ```
 */
export function asc(column: Column | SQL) {}

/**
 * Used in sorting, this specifies that the given
 * column or expression should be sorted in descending
 * order.
 *
 * ```ts
 * // Select users, with the most recently created
 * // records coming first.
 * db.select().from(users)
 *   .orderBy(desc(users.createdAt));
 * ```
 */
export function desc(column: Column | SQL) {}
