/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable no-unused-vars */
import {
  Client,
  type CommandContext,
  definePlugins,
} from 'seyfert'
import { type StatfertHandle, statfert } from '../src/index.js'

const plugins = definePlugins(statfert({ apiKey: 'api-key' }))

declare module 'seyfert' {
  interface SeyfertRegistry {
    plugins: typeof plugins
  }
}

const client = new Client({ plugins })
const clientService: StatfertHandle = client.statfert

declare const context: CommandContext
const contextService: StatfertHandle = context.statfert

void clientService
void contextService
