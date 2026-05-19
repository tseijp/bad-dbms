import { Column } from '../column'
import { SQL, Placeholder } from '../sql'

export const bindIfParam = (value: unknown, column: SQL) => {}

/**
 * Test that two values are equal.
 *
 * ```ts
 * // Select cars made by Ford
 * db.select().from(cars)
 *   .where(eq(cars.make, 'Ford'))
 * ```
 */
export const eq = (left: SQL, right: unknown) => {}

/**
 * Test that two values are not equal.
 *
 * ```ts
 * // Select cars not made by Ford
 * db.select().from(cars)
 *   .where(ne(cars.make, 'Ford'))
 * ```
 */
export const ne = (left: SQL, right: unknown) => {}

/**
 * Combine a list of conditions with the `and` operator. Conditions
 * that are equal `undefined` are automatically ignored.
 *
 * ```ts
 * db.select().from(cars)
 *   .where(
 *     and(
 *       eq(cars.make, 'Volvo'),
 *       eq(cars.year, 1950),
 *     )
 *   )
 * ```
 */
export const and = (...conditions: (SQL | undefined)[]) => {}

/**
 * Combine a list of conditions with the `or` operator. Conditions
 * that are equal `undefined` are automatically ignored.
 *
 * ```ts
 * db.select().from(cars)
 *   .where(
 *     or(
 *       eq(cars.make, 'GM'),
 *       eq(cars.make, 'Ford'),
 *     )
 *   )
 * ```
 */
export const or = (...conditions: (SQL | undefined)[]) => {}

/**
 * Negate the meaning of an expression using the `not` keyword.
 *
 * ```ts
 * // Select cars _not_ made by GM or Ford.
 * db.select().from(cars)
 *   .where(not(inArray(cars.make, ['GM', 'Ford'])))
 * ```
 */
export const not = (condition: SQL) => {}

/**
 * Test that the first expression passed is greater than
 * the second expression.
 *
 * ```ts
 * // Select cars made after 2000.
 * db.select().from(cars)
 *   .where(gt(cars.year, 2000))
 * ```
 */
export const gt = (left: SQL, right: unknown) => {}

/**
 * Test that the first expression passed is greater than
 * or equal to the second expression. Use `gt` to
 * test whether an expression is strictly greater
 * than another.
 *
 * ```ts
 * // Select cars made on or after 2000.
 * db.select().from(cars)
 *   .where(gte(cars.year, 2000))
 * ```
 */
export const gte = (left: SQL, right: unknown) => {}

/**
 * Test that the first expression passed is less than
 * the second expression.
 *
 * ```ts
 * // Select cars made before 2000.
 * db.select().from(cars)
 *   .where(lt(cars.year, 2000))
 * ```
 */
export const lt = (left: SQL, right: unknown) => {}

/**
 * Test that the first expression passed is less than
 * or equal to the second expression.
 *
 * ```ts
 * // Select cars made before 2000.
 * db.select().from(cars)
 *   .where(lte(cars.year, 2000))
 * ```
 */
export const lte = (left: SQL, right: unknown) => {}

/**
 * Test whether the first parameter, a column or expression,
 * has a value from a list passed as the second argument.
 *
 * ```ts
 * // Select cars made by Ford or GM.
 * db.select().from(cars)
 *   .where(inArray(cars.make, ['Ford', 'GM']))
 * ```
 */
export const inArray = (column: SQL, values: ReadonlyArray<unknown | Placeholder> | SQL) => {}

/**
 * Test whether the first parameter, a column or expression,
 * has a value that is not present in a list passed as the
 * second argument.
 *
 * ```ts
 * // Select cars made by any company except Ford or GM.
 * db.select().from(cars)
 *   .where(notInArray(cars.make, ['Ford', 'GM']))
 * ```
 */
export const notInArray = (column: SQL, values: (unknown | Placeholder)[] | SQL) => {}

/**
 * Test whether an expression is NULL. By the SQL standard,
 * NULL is neither equal nor not equal to itself, so
 * it's recommended to use `isNull` and `notIsNull` for
 * comparisons to NULL.
 *
 * ```ts
 * // Select cars that have no discontinuedAt date.
 * db.select().from(cars)
 *   .where(isNull(cars.discontinuedAt))
 * ```
 */
export const isNull = (value: SQL) => {}

/**
 * Test whether an expression is not NULL. By the SQL standard,
 * NULL is neither equal nor not equal to itself, so
 * it's recommended to use `isNull` and `notIsNull` for
 * comparisons to NULL.
 *
 * ```ts
 * // Select cars that have been discontinued.
 * db.select().from(cars)
 *   .where(isNotNull(cars.discontinuedAt))
 * ```
 */
export const isNotNull = (value: SQL) => {}

/**
 * Test whether a subquery evaluates to have any rows.
 *
 * ```ts
 * // Users whose `homeCity` column has a match in a cities
 * // table.
 * db
 *   .select()
 *   .from(users)
 *   .where(
 *     exists(db.select()
 *       .from(cities)
 *       .where(eq(users.homeCity, cities.id))),
 *   );
 * ```
 */
export const exists = (subquery: SQL) => {}

/**
 * Test whether a subquery doesn't include any result
 * rows.
 *
 * ```ts
 * // Users whose `homeCity` column doesn't match
 * // a row in the cities table.
 * db
 *   .select()
 *   .from(users)
 *   .where(
 *     notExists(db.select()
 *       .from(cities)
 *       .where(eq(users.homeCity, cities.id))),
 *   );
 * ```
 */
export const notExists = (subquery: SQL) => {}

/**
 * Test whether an expression is between two values. This
 * is an easier way to express range tests, which would be
 * expressed mathematically as `x <= a <= y` but in SQL
 * would have to be like `a >= x AND a <= y`.
 *
 * Between is inclusive of the endpoints: if `column`
 * is equal to `min` or `max`, it will be TRUE.
 *
 * ```ts
 * // Select cars made between 1990 and 2000
 * db.select().from(cars)
 *   .where(between(cars.year, 1990, 2000))
 * ```
 */
export const between = (column: SQL, min: unknown, max: unknown) => {}

/**
 * Test whether an expression is not between two values.
 *
 * This, like `between`, includes its endpoints, so if
 * the `column` is equal to `min` or `max`, in this case
 * it will evaluate to FALSE.
 *
 * ```ts
 * // Exclude cars made in the 1970s
 * db.select().from(cars)
 *   .where(notBetween(cars.year, 1970, 1979))
 * ```
 */
export const notBetween = (column: SQL, min: unknown, max: unknown) => {}

/**
 * Compare a column to a pattern, which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * ```ts
 * // Select all cars with 'Turbo' in their names.
 * db.select().from(cars)
 *   .where(like(cars.name, '%Turbo%'))
 * ```
 */
export const like = (column: Column | SQL, value: string | SQL) => {}

/**
 * The inverse of like - this tests that a given column
 * does not match a pattern, which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * ```ts
 * // Select all cars that don't have "ROver" in their name.
 * db.select().from(cars)
 *   .where(notLike(cars.name, '%Rover%'))
 * ```
 */
export const notLike = (column: Column | SQL, value: string | SQL) => {}

/**
 * Case-insensitively compare a column to a pattern,
 * which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * Unlike like, this performs a case-insensitive comparison.
 *
 * ```ts
 * // Select all cars with 'Turbo' in their names.
 * db.select().from(cars)
 *   .where(ilike(cars.name, '%Turbo%'))
 * ```
 */
export const ilike = (column: Column | SQL, value: string | SQL) => {}

/**
 * The inverse of ilike - this case-insensitively tests that a given column
 * does not match a pattern, which can include `%` and `_`
 * characters to match multiple variations. Including `%`
 * in the pattern matches zero or more characters, and including
 * `_` will match a single character.
 *
 * ```ts
 * // Select all cars that don't have "Rover" in their name.
 * db.select().from(cars)
 *   .where(notLike(cars.name, '%Rover%'))
 * ```
 */
export const notIlike = (column: Column | SQL, value: string | SQL) => {}

/**
 * Test that a column or expression contains all elements of
 * the list passed as the second argument.
 *
 * ## Throws
 *
 * The argument passed in the second array can't be empty:
 * if an empty is provided, this method will throw.
 *
 * ## Examples
 *
 * ```ts
 * // Select posts where its tags contain "Typescript" and "ORM".
 * db.select().from(posts)
 *   .where(arrayContains(posts.tags, ['Typescript', 'ORM']))
 * ```
 */
export const arrayContains = (column: SQL, values: (unknown | Placeholder)[] | SQL) => {}

/**
 * Test that the list passed as the second argument contains
 * all elements of a column or expression.
 *
 * ```ts
 * // Select posts where its tags contain "Typescript", "ORM" or both,
 * // but filtering posts that have additional tags.
 * db.select().from(posts)
 *   .where(arrayContained(posts.tags, ['Typescript', 'ORM']))
 * ```
 */
export const arrayContained = (column: SQL, values: (unknown | Placeholder)[] | SQL) => {}

/**
 * Test that a column or expression contains any elements of
 * the list passed as the second argument.
 *
 * ```ts
 * // Select posts where its tags contain "Typescript", "ORM" or both.
 * db.select().from(posts)
 *   .where(arrayOverlaps(posts.tags, ['Typescript', 'ORM']))
 * ```
 */
export const arrayOverlaps = (column: SQL, values: (unknown | Placeholder)[] | SQL) => {}
