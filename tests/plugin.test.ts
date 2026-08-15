import { describe, expect, it } from 'bun:test'
import { Client, type PluginCommandObserver } from 'seyfert'
import {
  type StatfertHandle,
  StatfertPostable,
  statfert,
} from '../src/index.js'

type TestClient = {
  botId: string
  cache: object
  gateway: {totalShards: number}
  guilds: {list: () => Promise<never[]>}
  logger: {error: () => undefined}
  statfert?: StatfertHandle
}

type ReadyHandler = (bot: unknown, client: never) => unknown

function createClient(): TestClient {
  return {
    botId: 'bot-id',
    cache: {},
    gateway: { totalShards: 2 },
    guilds: { list: async () => [] },
    logger: {
      error() {
        return undefined
      },
    },
  }
}

describe('statfert plugin', () => {
  it('validates its required API key immediately', () => {
    expect(() => statfert({ apiKey: '' })).toThrow(
      'The API key cannot be empty!'
    )
  })

  it('registers lifecycle and command observers', async () => {
    let observer: PluginCommandObserver | undefined
    const readyHandlers = new Map<string, ReadyHandler>()
    const plugin = statfert({
      apiKey: 'api-key',
      postables: [StatfertPostable.GuildCount, StatfertPostable.ShardCount],
    })
    const client = createClient()

    plugin.register?.({
      events: {
        on(name: string, handler: ReadyHandler) {
          readyHandlers.set(name, handler)
          return () => undefined
        },
      },
      commands: {
        observe(value: PluginCommandObserver) {
          observer = value
          return () => undefined
        },
      },
    } as never)

    expect(readyHandlers.has('botReady')).toBe(true)
    expect(readyHandlers.has('workerReady')).toBe(false)

    const service = plugin.client?.statfert?.(client as never)
    if (!service) throw new Error('The plugin did not create its service')

    client.statfert = service

    await plugin.setup?.(client as never)

    await observer?.onBeforeMiddlewares?.({
      client,
      command: { name: 'ping' },
    } as never)
    await observer?.onBeforeMiddlewares?.({
      client,
      command: { name: 'ping' },
    } as never)
    await observer?.onBeforeMiddlewares?.({
      client: { ...client, workerData: { totalShards: 2 } },
      command: { name: 'ping' },
    } as never)

    await plugin.teardown?.(client as never)
  })

  it('does not read an uninitialized gateway during setup', async () => {
    const plugin = statfert({
      apiKey: 'api-key',
      postables: [StatfertPostable.ShardCount],
    })
    const client = new Client({ plugins: [plugin] as const })

    expect(client.gateway).toBeUndefined()
    expect(client.statfert.sendStats).toBeFunction()

    await plugin.setup?.(client)
    await plugin.teardown?.(client)
  })

  it('exposes the same service on interaction contexts', () => {
    const plugin = statfert({ apiKey: 'api-key' })
    const client = createClient()
    const service = plugin.client?.statfert?.(client as never)
    if (!service) throw new Error('The plugin did not create its service')
    client.statfert = service

    expect(plugin.ctx?.statfert?.({} as never, client as never)).toBe(service)
  })
})
