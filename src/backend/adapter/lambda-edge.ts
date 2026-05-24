import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { FileAdapter } from '../../shared/types'

export const createLambdaEdgeAdapter = (s3: any, bucket: string): FileAdapter => ({
        get: async (key) => {
                const res: any = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined)
                if (!res?.Body) return undefined
                const buf = await res.Body.transformToByteArray()
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes }))
        },
        delete: async (key) => {
                await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        },
        list: async (prefix) => {
                const out: string[] = []
                let token: string | undefined = undefined
                while (true) {
                        const res: any = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
                        const items = res?.Contents ?? []
                        for (const c of items) if (c.Key) out.push(c.Key)
                        if (!res?.IsTruncated) return out
                        token = res.NextContinuationToken
                }
        },
})
