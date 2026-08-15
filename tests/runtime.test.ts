/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { describe, expect, it } from 'bun:test'
import type { BaseClient } from 'seyfert/lib/client/base.js'
import { StatfertPostable } from '../src/index.js'
import { StatfertRuntime } from '../src/runtime.js'

type PostedStats = {
  botId: string
  body: Record<string, unknown>
}

class TestRuntime extends StatfertRuntime {
  public readonly posts: PostedStats[] = []

  protected override async postStats(
    botId: string,
    body: Record<string, unknown>
  ) {
    this.posts.push({ botId, body })
  }
}

class RecoveringRuntime extends TestRuntime {
  public attempts = 0

  protected override async postStats(
    botId: string,
    body: Record<string, unknown>
  ) {
    this.attempts++
    if (this.attempts === 1) throw new Error('temporary failure')
    await super.postStats(botId, body)
  }
}

function createClient(
  extra: Record<string, unknown> = {}
): BaseClient {
  return {
    botId: 'bot-id',
    cache: {
      guilds: {
        count: async () => 2,
        async values() {
          throw new Error('transformed guild values should not be read')
        },
        valuesRaw: async () => [
          { member_count: 3 },
          { member_count: 5 },
        ],
      },
      users: {
        count: async () => 7,
      },
    },
    guilds: {
      async list() {
        throw new Error('guild list should not be read')
      },
    },
    ...extra,
  } as unknown as BaseClient
}

function ignoreError() {
  return undefined
}

describe('Statfert runtime', () => {
  it('validates autopost configuration', async () => {
    const runtime = new TestRuntime(createClient(), 'api-key')

    await expect(runtime.start(ignoreError, [])).rejects.toThrow(
      'The postables array cannot be empty!'
    )
    await Promise.all(
      [10, Number.NaN, Number.POSITIVE_INFINITY, 2_147_484].map(
        async interval => {
          await expect(
            runtime.start(
              ignoreError,
              [StatfertPostable.GuildCount],
              interval
            )
          ).rejects.toThrow('The time between requests must be between 60')
        }
      )
    )
  })

  it('requires the guild cache for guild statistics', async () => {
    const runtime = new TestRuntime(
      createClient({ cache: { users: { count: async () => 7 } } }),
      'api-key'
    )

    await expect(
      runtime.handle.sendStats([StatfertPostable.GuildCount])
    ).rejects.toThrow(
      'The guild cache must be enabled to collect guild statistics!'
    )
  })

  it('keeps the interval after a handled initial failure', async () => {
    const runtime = new RecoveringRuntime(createClient(), 'api-key')
    const errors: unknown[] = []

    const interval = await runtime.start(error => {
      errors.push(error)
    })

    expect(interval).not.toBeNull()
    expect(runtime.isRunning).toBe(true)
    expect(errors).toHaveLength(1)
    runtime.stop()
  })

  it('does not post after a pending start is stopped', async () => {
    let releaseGuildCount: (() => void) | undefined
    const guildCount = new Promise<number>(resolve => {
      releaseGuildCount = () => {
        resolve(2)
      }
    })
    const runtime = new TestRuntime(
      createClient({
        cache: {
          guilds: {
            count: async () => guildCount,
            valuesRaw: async () => [],
          },
        },
      }),
      'api-key'
    )
    const starting = runtime.start(ignoreError)

    await Promise.resolve()
    runtime.stop()
    releaseGuildCount?.()

    expect(await starting).toBeNull()
    expect(runtime.isRunning).toBe(false)
    expect(runtime.posts).toHaveLength(0)
  })

  it('builds metrics, graphs, and command data', async () => {
    const runtime = new TestRuntime(
      createClient({ gateway: { totalShards: 4 } }),
      'api-key'
    )
    runtime.recordCommand('ping')
    runtime.recordCommand('ping')
    runtime.handle.createCustomGraph({ id: 'growth', data: { daily: 4 } })

    await runtime.handle.sendStats([
      StatfertPostable.GuildCount,
      StatfertPostable.Members,
      StatfertPostable.ShardCount,
      StatfertPostable.UserCount,
    ])

    expect(runtime.posts[0]?.body).toMatchObject({
      guildCount: 2,
      members: 8,
      shardCount: 4,
      userCount: 7,
      customCharts: [{ id: 'growth', data: { daily: 4 } }],
      topCommands: [{ name: 'ping', count: 2 }],
    })
  })

  it('omits process-local worker metrics', async () => {
    const runtime = new TestRuntime(
      createClient({
        workerData: { totalShards: 6 },
        cache: {
          users: {
            async count() {
              throw new Error('worker-local user count should not be read')
            },
          },
        },
      }),
      'api-key'
    )
    runtime.recordCommand('ping')

    await runtime.sendStats([
      StatfertPostable.ShardCount,
      StatfertPostable.UserCount,
    ])

    expect(runtime.posts[0]?.body).toEqual({ shardCount: 6 })
  })
})
