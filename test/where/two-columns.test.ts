import { describe, it, expect } from 'vitest'
import { eq, gt, gte, lt, and, not } from '../../src/index'
import { seedPosts } from '../_helpers'
import { idsOf } from './_fixtures'
describe('predicates relating two columns of the same row', () => {
        // Each post carries id, userId and score. A reader can compare
        // two of a row's own columns instead of comparing one to a
        // literal; these scenarios exercise that against POSTS_SEED
        // (score/id/userId of 5/1/1, 7/2/1, 9/3/2, 4/4/3).
        it('finding posts more popular than their position keeps every post but the last', async () => {
                const { db, posts } = await seedPosts()
                const popular = await db.select().from(posts).where(gt(posts.score, posts.id))
                expect(idsOf(popular)).toEqual([1, 2, 3])
                // post 4 is the only one whose score does not beat its id
                const stale = await db
                        .select()
                        .from(posts)
                        .where(not(gt(posts.score, posts.id)))
                expect(idsOf(stale)).toEqual([4])
        })
        it('finding the post a user authored under their own id isolates the self-owned row', async () => {
                const { db, posts } = await seedPosts()
                const selfOwned = await db.select().from(posts).where(eq(posts.userId, posts.id))
                expect(idsOf(selfOwned)).toEqual([1])
                const delegated = await db
                        .select()
                        .from(posts)
                        .where(not(eq(posts.userId, posts.id)))
                expect(idsOf(delegated)).toEqual([2, 3, 4])
        })
        it('a column-pair comparison and its negation rerun on the seed recover every post', async () => {
                const { db, posts } = await seedPosts()
                const greater = await db.select().from(posts).where(gt(posts.score, posts.id))
                const notGreater = await db
                        .select()
                        .from(posts)
                        .where(not(gt(posts.score, posts.id)))
                expect(idsOf([...greater, ...notGreater])).toEqual([1, 2, 3, 4])
        })
        it('posts whose score covers their owning user id turn out to be every post', async () => {
                const { db, posts } = await seedPosts()
                const covered = await db.select().from(posts).where(gte(posts.score, posts.userId))
                expect(idsOf(covered)).toEqual([1, 2, 3, 4])
        })
        it('layering a literal cutoff onto a column-pair predicate drills into the popular posts', async () => {
                const { db, posts } = await seedPosts()
                const popular = await db.select().from(posts).where(gt(posts.score, posts.id))
                expect(idsOf(popular)).toEqual([1, 2, 3])
                const veryPopular = await db
                        .select()
                        .from(posts)
                        .where(and(gt(posts.score, posts.id), gt(posts.score, 6)))
                expect(idsOf(veryPopular)).toEqual([2, 3])
        })
        it('a strict less-than between two columns of the seed finds no row where the order flips', async () => {
                const { db, posts } = await seedPosts()
                const flipped = await db.select().from(posts).where(lt(posts.score, posts.id))
                expect(flipped).toEqual([])
        })
})
