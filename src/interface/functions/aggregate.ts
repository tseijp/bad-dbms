import { SQL } from '../sql'

/**
 * Returns the number of values in `expression`.
 *
 * ```ts
 * // Number employees with null values
 * db.select({ value: count() }).from(employees)
 * // Number of employees where `name` is not null
 * db.select({ value: count(employees.name) }).from(employees)
 * ```
 */
export const count = (expression?: SQL) => {}

/**
 * Returns the number of non-duplicate values in `expression`.
 *
 * ```ts
 * // Number of employees where `name` is distinct
 * db.select({ value: countDistinct(employees.name) }).from(employees)
 * ```
 */
export const countDistinct = (expression: SQL) => {}

/**
 * Returns the average (arithmetic mean) of all non-null values in `expression`.
 *
 * ```ts
 * // Average salary of an employee
 * db.select({ value: avg(employees.salary) }).from(employees)
 * ```
 */
export const avg = (expression: SQL) => {}

/**
 * Returns the average (arithmetic mean) of all non-null and non-duplicate values in `expression`.
 *
 * ```ts
 * // Average salary of an employee where `salary` is distinct
 * db.select({ value: avgDistinct(employees.salary) }).from(employees)
 * ```
 */
export const avgDistinct = (expression: SQL) => {}

/**
 * Returns the sum of all non-null values in `expression`.
 *
 * ```ts
 * // Sum of every employee's salary
 * db.select({ value: sum(employees.salary) }).from(employees)
 * ```
 *
 * @see sumDistinct to get the sum of all non-null and non-duplicate values in `expression`
 */
export const sum = (expression: SQL) => {}

/**
 * Returns the sum of all non-null and non-duplicate values in `expression`.
 *
 * ```ts
 * // Sum of every employee's salary where `salary` is distinct (no duplicates)
 * db.select({ value: sumDistinct(employees.salary) }).from(employees)
 * ```
 *
 * @see sum to get the sum of all non-null values in `expression`, including duplicates
 */
export const sumDistinct = (expression: SQL) => {}

/**
 * Returns the maximum value in `expression`.
 *
 * ```ts
 * // The employee with the highest salary
 * db.select({ value: max(employees.salary) }).from(employees)
 * ```
 */
export const max = <T extends SQL>(expression: T) => {}

/**
 * Returns the minimum value in `expression`.
 *
 * ```ts
 * // The employee with the lowest salary
 * db.select({ value: min(employees.salary) }).from(employees)
 * ```
 */
export const min = <T extends SQL>(expression: T) => {}
