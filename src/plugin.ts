import {
  createPlugin,
  type Client,
  type SeyfertPlugin,
  type WorkerClient,
} from 'seyfert'
import type { BaseClient } from 'seyfert/lib/client/base.js'
import { StatfertPostable } from './postable.js'
import {
  type StatfertHandle,
  StatfertRuntime,
} from './runtime.js'

export type { StatfertGraph, StatfertHandle } from './runtime.js'

export type StatfertPluginOptions = {
  apiKey: string
  postables?: readonly StatfertPostable[]
  timeBetweenRequests?: number
}

export type StatfertPlugin = SeyfertPlugin<
  {statfert: StatfertHandle},
  {statfert: StatfertHandle}
> & {
  name: 'statfert'
}

export function statfert(options: StatfertPluginOptions): StatfertPlugin {
  const postables = options.postables ?? [StatfertPostable.GuildCount]
  const timeBetweenRequests = options.timeBetweenRequests ?? 60
  const runtimes = new WeakMap<BaseClient, StatfertRuntime>()

  if (options.apiKey.length === 0)
    throw new Error('The API key cannot be empty!')

  return createPlugin({
    name: 'statfert',
    client: {
      statfert(client): StatfertHandle {
        const runtime = new StatfertRuntime(client, options.apiKey)
        runtimes.set(client, runtime)
        return runtime.handle
      },
    },
    ctx: {
      statfert: (_context, client): StatfertHandle => client.statfert,
    },
    register(api) {
      api.events.on('botReady', async (_bot, client) => {
        await startStatfert(
          client,
          postables,
          timeBetweenRequests,
          runtimes
        )
      })
      api.commands.observe({
        onBeforeMiddlewares(context) {
          if (
            isWorkerClient(context.client) ||
            !('name' in context.command)
          ) return

          getRuntime(runtimes, context.client).recordCommand(
            context.command.name
          )
        },
      })
    },
    async setup(client) {
      if (!isShardedClient(client))
        await startStatfert(client, postables, timeBetweenRequests, runtimes)
    },
    teardown(client) {
      getRuntime(runtimes, client).stop()
      runtimes.delete(client)
    },
  })
}

async function startStatfert(
  client: BaseClient,
  postables: readonly StatfertPostable[],
  timeBetweenRequests: number,
  runtimes: WeakMap<BaseClient, StatfertRuntime>
) {
  const runtime = getRuntime(runtimes, client)
  if (runtime.isRunning) return

  await runtime.start(
    error => {
      client.logger.error('[Statfert] Failed to post stats:', error)
    },
    postables,
    timeBetweenRequests
  )
}

function getRuntime(
  runtimes: WeakMap<BaseClient, StatfertRuntime>,
  client: BaseClient
) {
  const runtime = runtimes.get(client)
  if (!runtime) throw new Error('Statfert runtime is unavailable!')
  return runtime
}

function isShardedClient(client: BaseClient): client is Client | WorkerClient {
  return 'gateway' in client || 'workerData' in client
}

function isWorkerClient(client: BaseClient): client is WorkerClient {
  return 'workerData' in client
}
