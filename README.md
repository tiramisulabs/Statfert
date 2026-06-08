# Discontinued

I've stopped using Seyfert for [reasons](http://gist.github.com/lunaradev1/6bb5120dad4767c31cb7dcfabfeb1469), so this project is no longer updated. Sorry guys.

---

# Statfert

An implementation of the [Statcord](https://statcord.com) API for [Seyfert](https://seyfert.dev)

## Installation

### npm

```bash
npm install statfert
```

### bun

```bash
bun install statfert
```

## Basic Usage

Usage of this package will involve deciding whether you want to use shards or not. If your `seyfert.config.mjs` (or similar) exports `config.bot`, you probably want
`ShardedStatfert`, otherwise you want `Statfert`.

**This example will use `ShardedStatfert`. It's the most likely option for Seyfert users.**

```typescript
import { Client } from 'seyfert'
import { ShardedStatfert, StatfertPostable } from 'statfert'

const client = new Client()
const statfert = new ShardedStatfert(client, '[YOUR STATCORD API KEY]')

client.start().then(async () => {
    await statfert.start() // Automatically sends guild count once every minute.

    // You can also send whatever you want.
    // await statfert.start([StatfertPostable.CpuUsage, StatfertPostable.GuildCount]) // Automatically sends CPU usage and guild count once every minute.

    // And also change the interval.
    // await statfert.start([StatfertPostable.GuildCount], 180) // Automatically sends guild count once every 3 minutes.
})
```

## Still to come

- Custom graphs (gotta work on making those work)
- Top commands (using the actual commands on the client)
