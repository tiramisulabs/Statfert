# Statfert

An implementation of the [Statcord](https://statcord.com) API for
[Seyfert](https://seyfert.dev).

## Installation

```bash
npm install statfert
```

Statfert requires Seyfert 5 or newer.

## Usage

Create the plugin once, register its tuple in `SeyfertRegistry`, and pass it to
the client. Gateway and worker clients send the first payload once they are
ready; other clients start during plugin setup. Statfert continues on the
configured interval and stops automatically when `client.close()` runs.

```typescript
import { Client, definePlugins } from 'seyfert'
import { statfert } from 'statfert'

export const plugins = definePlugins(
  statfert({ apiKey: process.env.STATCORD_API_KEY ?? '' })
)

declare module 'seyfert' {
  interface SeyfertRegistry {
    plugins: typeof plugins
  }
}

const client = new Client({ plugins })
await client.start()
```

The plugin exposes the same service as `client.statfert` and `ctx.statfert`.
Command usage is tracked automatically through Seyfert's command observer.

```typescript
await client.statfert.sendStats()
client.statfert.createCustomGraph({
  id: 'daily-growth',
  data: { users: 42 },
})
```

## Options

```typescript
import { StatfertPostable, statfert } from 'statfert'

statfert({
  apiKey: process.env.STATCORD_API_KEY ?? '',
  postables: [
    StatfertPostable.GuildCount,
    StatfertPostable.ShardCount,
    StatfertPostable.CpuUsage,
  ],
  timeBetweenRequests: 180,
})
```

- `apiKey` is required.
- `postables` defaults to guild count.
- `timeBetweenRequests` is measured in seconds, defaults to `60`, and cannot be
  lower than `60` or higher than `2147483.647`.

The plugin resolves shard count from gateway and worker clients without any
manual client setup.

`GuildCount` and `Members` require Seyfert's guild cache. Statfert reads the
configured cache adapter directly and never falls back to the Discord REST API.

Worker mode runs one autopost loop on the manager-selected worker. It omits
`UserCount` and automatic top-command data because those values are
process-local; guild and member totals follow the configured cache adapter.
