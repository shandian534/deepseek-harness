// 可运行的示例工具插件。
// 启动方式（在仓库根目录执行）：
//   pnpm dsh web --patch ./scratch-plugin/cordis.yml
// 打开 http://127.0.0.1:3080，让模型调用工具即可看到效果。
// 想加自己的工具：照着下面继续 ctx.tools.register(defineTool({ ... })) 即可。

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 加载成功时在启动终端打印，便于确认插件已挂载。
  console.log('[my-tool-plugin] plugin loaded!')

  // 工具 1：greet —— 文档示例，开箱可用。
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // 工具 2：get_current_time —— 无参数工具示例。
  ctx.tools.register(defineTool({
    name: 'get_current_time',
    description: 'Get the current local date and time.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return new Date().toISOString()
    },
  }))
}
