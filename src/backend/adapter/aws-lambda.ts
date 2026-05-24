import type { FileAdapter } from '../../shared/types'
// @ts-ignore
const _sdk = () => import('@aws-sdk/client-s3')
export const createAwsLambdaAdapter = (s3: any, bucket = 'tmp'): FileAdapter => ({
        get: async (key) => {
                const { GetObjectCommand } = await _sdk()
                const res: any = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined)
                if (!res?.Body) return undefined
                const buf = await res.Body.transformToByteArray()
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                const { PutObjectCommand } = await _sdk()
                await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes }))
        },
        delete: async (key) => {
                const { DeleteObjectCommand } = await _sdk()
                await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        },
        list: async (prefix) => {
                const { ListObjectsV2Command } = await _sdk()
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
