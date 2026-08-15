/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-await-in-loop */
import type { BaseClient } from 'seyfert/lib/client/base.js'
import { request } from 'undici'
import { StatfertPostable } from './postable.js'
import { getCpuUsage, getRamInformation } from './utils.js'

const MAX_TIMER_DELAY = 2_147_483_647

export type StatfertGraph = {
  id: string
  data: Record<string, any>
}

export type StatfertHandle = {
  createCustomGraph(graph: StatfertGraph): StatfertHandle
  sendStats(postables?: readonly StatfertPostable[]): Promise<void>
}

export class StatfertRuntime {
  public readonly handle: StatfertHandle
  private readonly commands = new Map<string, number>()
  private readonly graphs: StatfertGraph[] = []
  private isPosting = false
  private interval: ReturnType<typeof setInterval> | null = null
  private startGeneration = 0

  constructor(
    public readonly client: BaseClient,
    public readonly apiKey: string
  ) {
    if (apiKey.length === 0) throw new Error('The API key cannot be empty!')

    this.handle = {
      createCustomGraph: graph => {
        this.graphs.push(graph)
        return this.handle
      },
      sendStats: async postables => {
        await this.sendStats(postables)
      },
    }
  }

  public get isRunning() {
    return this.interval !== null
  }

  public recordCommand(name: string) {
    this.commands.set(name, (this.commands.get(name) ?? 0) + 1)
  }

  public async start(
    onError: (error: unknown) => void,
    postables: readonly StatfertPostable[] = [StatfertPostable.GuildCount],
    timeBetweenRequests = 60
  ) {
    if (postables.length === 0)
      throw new Error('The postables array cannot be empty!')
    const actualIntervalTime = timeBetweenRequests * 1000
    if (
      !Number.isFinite(timeBetweenRequests) ||
      timeBetweenRequests < 60 ||
      actualIntervalTime > MAX_TIMER_DELAY
    )
      throw new Error(
        `The time between requests must be between 60 and ${MAX_TIMER_DELAY / 1000} seconds!`
      )

    if (this.interval !== null)
      throw new Error('Statfert is already autoposting!')

    const generation = ++this.startGeneration
    this.interval = setInterval(async () => {
      try {
        await this.sendAutopost(postables, generation)
      } catch (error: unknown) {
        onError(error)
      }
    }, actualIntervalTime)

    try {
      await this.sendAutopost(postables, generation)
    } catch (error: unknown) {
      if (generation !== this.startGeneration || this.interval === null)
        return null

      try {
        onError(error)
      } catch (handlerError: unknown) {
        this.stop()
        throw handlerError
      }
    }

    if (
      this.interval === null ||
      generation !== this.startGeneration
    ) return null

    return this.interval
  }

  public stop() {
    this.startGeneration++
    if (this.interval === null) return

    clearInterval(this.interval)
    this.interval = null
  }

  public async sendStats(
    postables: readonly StatfertPostable[] = [StatfertPostable.GuildCount]
  ) {
    await this.postStats(
      this.client.botId,
      await this.getStatsBody(postables)
    )
  }

  protected async postStats(botId: string, body: Record<string, any>) {
    if (this.isPosting) return

    this.isPosting = true

    try {
      const response = await request(this.basePostingUrl(botId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.apiKey,
        },
        body: JSON.stringify(body),
      })

      if (response.statusCode !== 200)
        throw new Error(
          `Request not successful. [${response.statusCode}] (${response.statusText})`
        )
    } finally {
      this.isPosting = false
    }
  }

  private async sendAutopost(
    postables: readonly StatfertPostable[],
    generation: number
  ) {
    const body = await this.getStatsBody(postables)
    if (generation !== this.startGeneration || this.interval === null) return

    await this.postStats(this.client.botId, body)
  }

  private async getStatsBody(postables: readonly StatfertPostable[]) {
    let body = await this.getBaseBody(postables)

    if (postables.includes(StatfertPostable.ShardCount))
      body = {
        ...body,
        shardCount: this.getShardCount(),
      }

    return body
  }

  private async getBaseBody(postables: readonly StatfertPostable[]) {
    const isWorker = 'workerData' in this.client
    const effectivePostables = isWorker
      ? postables.filter(postable => postable !== StatfertPostable.UserCount)
      : postables
    let body = {}

    for (const postable of effectivePostables) {
      switch (postable) {
        case StatfertPostable.CpuUsage: {
          body = { ...body, cpuUsage: getCpuUsage() }
          break
        }

        case StatfertPostable.GuildCount: {
          const guildCount = await Promise.resolve(
            this.getGuildCache().count()
          )
          body = { ...body, guildCount }
          break
        }

        case StatfertPostable.ShardCount: {
          break
        }

        case StatfertPostable.MemInformation: {
          body = { ...body, ...getRamInformation() }
          break
        }

        case StatfertPostable.Members: {
          let memberCount = 0
          const guilds = await Promise.resolve(
            this.getGuildCache().valuesRaw()
          )

          for (const guild of guilds) {
            if (guild.member_count) memberCount += guild.member_count
          }

          body = { ...body, members: memberCount }
          break
        }

        case StatfertPostable.UserCount: {
          const userCount = await Promise.resolve(
            this.client.cache.users?.count()
          )
          if (userCount) body = { ...body, userCount }
          break
        }
      }
    }

    if (this.graphs.length > 0)
      body = {
        ...body,
        customCharts: this.graphs.map(graph => ({
          id: graph.id,
          data: graph.data,
        })),
      }

    if (!isWorker && this.commands.size > 0)
      body = {
        ...body,
        topCommands: [...this.commands.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      }

    return body
  }

  private getGuildCache() {
    const { guilds } = this.client.cache
    if (!guilds)
      throw new Error('The guild cache must be enabled to collect guild statistics!')
    return guilds
  }

  private getShardCount() {
    const client = this.client as typeof this.client & {
      gateway?: {totalShards: number}
      workerData?: {totalShards: number}
    }
    const totalShards = client.workerData?.totalShards ??
      client.gateway?.totalShards

    if (!Number.isFinite(totalShards))
      throw new Error('The shard count is not available before the client is ready!')

    return totalShards
  }

  private basePostingUrl(botId: string) {
    return `https://statcord.com/api/bots/${botId}/stats`
  }
}
