import type { FileAdapter, AdapterKind, AdapterOptions } from '../../shared/types'
export type { AdapterKind, AdapterOptions } from '../../shared/types'
export const createAdapter = async (kind: AdapterKind, opts: AdapterOptions = {}): Promise<FileAdapter> => {
        if (kind === 'memory') return (await import('./memory')).createMemoryAdapter()
        if (kind === 'nodejs') return (await import('./nodejs')).createNodejsAdapter(opts.dir)
        if (kind === 'bun') return (await import('./bun')).createBunAdapter(opts.dir)
        if (kind === 'deno') return (await import('./deno')).createDenoAdapter(opts.dir)
        if (kind === 'browser') return (await import('./browser')).createBrowserAdapter(opts.rootName)
        if (kind === 'cloudflare') return (await import('./cloudflare')).createCloudflareAdapter(opts.kv)
        if (kind === 'vercel') return (await import('./vercel')).createVercelAdapter(opts.kv)
        if (kind === 'netlify') return (await import('./netlify')).createNetlifyAdapter(opts.store)
        if (kind === 'fastly') return (await import('./fastly')).createFastlyAdapter(opts.store)
        if (kind === 'aws-lambda') return (await import('./aws-lambda')).createAwsLambdaAdapter(opts.s3, opts.bucket)
        if (kind === 'lambda-edge') return (await import('./lambda-edge')).createLambdaEdgeAdapter(opts.s3, opts.bucket)
        throw new Error(`unknown adapter kind: ${kind}`)
}
