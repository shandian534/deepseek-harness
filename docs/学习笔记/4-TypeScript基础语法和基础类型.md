# TypeScript 基础语法和基础类型

> 学习笔记系列的 TS 入门篇，零基础起步。进阶内容见 [1-TypeScript前置知识清单](1-TypeScript前置知识清单.md) 与 [3-本项目难懂TS语法清单](3-本项目难懂TS语法清单.md)。
> 例子优先取自本仓库源码；本文件为个人学习笔记，未纳入 doc-sync 门禁。

## 一、基础类型（原生类型）

### 1.1 原始类型

```ts
const name: string = 'dsh'
const port: number = 3080
const ok: boolean = true
const nothing: null = null
const absent: undefined = undefined
const big: bigint = 9007199254740993n
const sym: symbol = Symbol('id')
```

两个易混点：

- **`null` 与 `undefined` 语义不同**：`undefined` 是「还没赋值」，`null` 是「显式置空」。本项目 API 里 `get(id): Session | undefined`（查不到）几乎不用 `null`——这是 TS 社区的主流约定
- **没有单独的 int/float**：`number` 统一涵盖

### 1.2 数组与元组

```ts
const ids: string[] = []
const events: SessionEvent[] = []

// 元组：定长、每位类型固定
const pair: [string, number] = ['turn', 3]
```

本项目事件流的分块就靠元组表达「类型 + 数据」的固定对。另见 `readonly T[]`（只读数组，传参防止被改）。

### 1.3 对象类型（结构化）

```ts
// 直接写形状
function open(config: { host: string; port: number }) { ... }

// interface：可命名、可复用、可合并（本仓库主流写法）
interface Session {
  readonly id: string        // readonly：编译期禁止改写
  events: readonly SessionEvent[]
  title?: string             // ?：可选属性，类型实为 string | undefined
}

// type 别名：也能描述对象，还能描述联合/交叉等任意类型
type Port = number
```

`interface` vs `type` 的实用区分：**对象形状用 interface**（支持声明合并——Cordis 插件体系依赖这个特性）；**联合、条件、映射等类型运算只能用 type**。

### 1.4 函数类型

```ts
// 参数和返回值标注；返回 void 表示「调用方不许用返回值」
function append(event: SessionEvent): void { ... }

// 箭头函数类型标注
const dispose: () => void = () => fiber.off()

// 可选参数与默认值
function greet(name: string, prefix = ''): string { ... }

// 函数本身也是一种类型（回调签名）
type Listener = (event: SessionEvent) => void
```

**返回类型 `void`** 在本仓库大量出现——它表达「这个函数是命令式的，只为副作用而调用」。

### 1.5 联合与交叉

```ts
// 联合 |：「或」，值是其中一种
type TurnEndReason = 'success' | 'rejection' | 'cancelled' | 'failure'

// 字面量本身可以是类型：值即类型
let mode: 'emit' | 'parallel' | 'serial' = 'emit'

// 交叉 &：「与」，同时满足两个形状（合并字段）
type ScopedSession = Session & { agent: Agent }
```

联合是判别联合（discriminated union）的地基，见 1.8。

### 1.6 any / unknown / never（三大特殊类型）

```ts
let a: any      // 完全放弃检查——本仓库规范禁止随意使用
let u: unknown  // 「不知道是什么」，任何值可赋入，但用之前必须收窄
let n: never    // 「不可能的值」，函数永不正常返回时作返回类型
function fail(msg: string): never { throw new Error(msg) }
```

三者关系（重要）：

| 类型 | 能否直接调用/访问属性 | 定位 |
|---|---|---|
| `any` | 能（放弃治疗） | 逃生舱，慎用 |
| `unknown` | **不能**，必须先收窄 | 类型安全版 any，边界数据第一站 |
| `never` | —（无值） | 穷尽检查、不可能分支 |

本仓库的数据边界处理范式：`JSON.parse` 的结果先当 `unknown` / `Record<string, unknown>`，用类型谓词/断言谓词收窄后才当具体类型用（详见 3 号清单第 6 条）。

### 1.7 枚举（enum）与常量联合的对比

```ts
// TS 传统 enum（有运行时产物：编译成一个对象）
enum FiberState { ACTIVE, UNLOADING, DISPOSED }
// vendored cordis 用了它，业务代码基本不用

// 现代替代：const 对象 + as const + typeof keyof 提取
const FIBER_STATES = ['active', 'unloading', 'disposed'] as const
type FiberState = typeof FIBER_STATES[number]   // 'active' | 'unloading' | 'disposed'
```

本仓库新代码一律用后者（无运行时开销、字面量类型更精确）。看到 `enum` 基本在 `vendor/` 里。

### 1.8 判别联合（discriminated union）★ 本仓库命脉

```ts
// 多个对象形状共享一个字面量字段 type/kind
type StepEvent =
  | { type: 'step/start'; step: number }
  | { type: 'step/end'; step: number; reason: string }
  | { type: 'chunk/delta'; text: string }

// switch 这个字段，每个分支内自动收窄
switch (event.type) {
  case 'step/start': event.step   // ✅ 可访问
    break
  case 'step/end': event.reason   // ✅ 只有这个变体有 reason
    break
  case 'chunk/delta': event.text
    break
  default:
    event satisfies never         // 漏分支 = 编译错误
}
```

本仓库所有闭集合（事件类型、调用模式、指令形态）都是这个结构，规范要求 `switch` + `assertNever`/`satisfies never` 收尾。

## 二、基础语法

### 2.1 类型标注的三个位置

```ts
const x: string = 'a'                  // 变量
function f(a: number): string          // 函数
interface S { id: string }             // 类型声明
```

多数场景**可省略靠推断**：`const x = 'a'` 自动是 `string`（字面量场景是 `'a'`）。本仓库规范：**能推断就不写**，公共 API 显式标注。

### 2.2 类型收窄（narrowing）

TS 编译器跟踪代码路径，逐步缩小类型：

```ts
function handle(id: string | undefined) {
  if (id === undefined) return
  id.length            // 此处已是 string

  // instanceof / typeof / in / 自定义谓词 都能收窄
  if (error instanceof CordisError) { error.code }
  if ('agent' in payload) { payload.agent }
}
```

`strict: true`（本仓库强制）下，可空类型不收窄就使用会直接编译报错——这是日常写 TS 最高频的交互。

### 2.3 类型断言 `as` 与类型守卫 `is`

```ts
const e = raw as SessionEvent     // 「信我」：编译器不检查，运行时不转换
                                   // 用错不报编译错，但运行时可能 undefined.foo

// 更安全的守卫：函数返回 true 则收窄
function isSessionEvent(v: unknown): v is SessionEvent {
  return typeof v === 'object' && v !== null && 'seq' in v
}
```

`as` 是双刃剑——本仓库只在确定边界（解析后的 JSON 已被校验）使用，优先走守卫。

### 2.4 泛型（类型的参数）

```ts
// Array<T> 就是最常见的泛型
const list: Array<Session> = []

// 自定义泛型函数：T 由调用处推断
function first<T>(items: readonly T[]): T | undefined {
  return items[0]
}
first(events)        // T 推断为 SessionEvent

// 泛型约束：T 必须满足形状
function log<K extends string>(key: K): K { ... }

// 泛型接口/类（服务容器的标准形态）
interface Store<T> {
  get(id: string): T | undefined
  create(value: T): T
}
```

一句话：泛型让「容器/算法」与「元素类型」解耦。进阶（条件类型、infer）见 3 号清单。

### 2.5 类（class）

```ts
class SessionStore {
  private sessions = new Map<string, Session>()   // 私有字段
  readonly capacity: number                        // 只读
  constructor(capacity: number) {
    this.capacity = capacity
  }
  get(id: string): Session | undefined {          // 方法
    return this.sessions.get(id)
  }
}
```

TS 给 class 加了 `private`/`protected`/`readonly` 修饰符和参数属性（`constructor(public code: string)`，vendored cordis 在用）。本仓库模式：**服务大多是 class + `apply(ctx)` 挂到 Context**，见 1 号清单。

### 2.6 模块（import/export）

```ts
// ESM（本仓库唯一模块体系，"type": "module"）
import { Context } from '@deepseek-ai/cordis'        // 具名
import type { SessionEvent } from './types.ts'       // 纯类型导入：编译后整行消失
export function append() { ... }                     // 具名导出
export default class SessionStore { ... }            // 默认导出（每包至多一个）
```

**`import type` 是关键细节**：类型导入不产生运行时依赖，循环引用和打包体积都靠它优化；本仓库规范倾向类型一律 `import type`。另一个细节：**相对导入带 `.ts` 后缀**（`'./types.ts'`）——这是本仓库 ESM + tsx 的约定，不是笔误。

### 2.7 异步语法

```ts
async function load(): Promise<Session[]> {          // async 函数返回 Promise
  const raw = await fetch(url)                        // await 解包
  return JSON.parse(await raw.text()) as Session[]
}

// 流式：AsyncGenerator（LLM 响应流的形态）
async function* stream(): AsyncGenerator<string> {
  yield 'chunk1'
  yield 'chunk2'
}
for await (const chunk of stream()) { ... }
```

`Promise<T>` 是「未来才有 T」；`async/await` 是语法糖。本仓库 `llm/llm` 的流式适配层全是 `AsyncGenerator`。

### 2.8 非空断言与可选链（日常高频）

```ts
entry!.id            // 非空断言：承诺非空（绕过检查，慎用）
config?.port         // 可选链：config 为 null/undefined 时短路得 undefined
value ?? 3080        // 空值合并：null/undefined 时取默认（0 和 '' 不触发）
```

`??` 与 `||` 的区别是经典陷阱：`0 || 3080` 得 3080，`0 ?? 3080` 得 0——端口号、序号场景必须用 `??`。

### 2.9 装饰器（认得即可）

```ts
// vendored cordis 里的形态
class Registry {
  @Inject('webStartup')
  declare webStartup: WebStartup
}
```

编译期给类成员注入元数据，框架据此做依赖注入。**只在 `vendor/` 出现**，业务包不用；读 vendor 时知道它是「自动注入服务」即可。

## 三、速查总结（每行附例子）

### 1. 描述对象形状 → `interface`

```ts
// 例子取自 packages/core/session 的形态
interface Session {
  readonly id: string
  readonly events: readonly SessionEvent[]
  title?: string
}

const s: Session = { id: 'a1', events: [] }
s.id = 'b'      // ❌ 编译错误：readonly 禁止改写
```

### 2. 描述「或」/「与」 → 联合 `|` / 交叉 `&`

```ts
// 联合：值是其中一种（cordis 的派发模式）
type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall'
let mode: DispatchMode = 'emit'
mode = 'fast'   // ❌ 不在集合内

// 交叉：同时满足两个形状（字段合并）
type TitledSession = Session & { title: string }
// 它现在要求 id、events，且 title 必填（不再是可选）
```

### 3. 值的有限集合 → 字面量联合（优于 enum）

```ts
// ❌ 旧写法：有运行时产物（编译出一个对象）
enum State { ACTIVE, DISPOSED }

// ✅ 本仓库写法：零运行时开销
const STATES = ['active', 'disposed'] as const
type State = typeof STATES[number]   // 'active' | 'disposed'

function check(state: State) { ... }
check('active')    // ✅
check('sleeping')  // ❌ 编译错误
```

### 4. 可能为空 → `| undefined` + 使用前收窄

```ts
function findSession(id: string): Session | undefined { ... }

const session = findSession('a1')
session.title        // ❌ 编译错误：可能是 undefined

if (session === undefined) return
session.title        // ✅ 收窄后通过；写成 if (!session) return 也一样
```

### 5. 不信任的数据 → `unknown` + 守卫收窄

```ts
// 从磁盘读 JSON：第一步永远是 unknown
const raw: unknown = JSON.parse(text)

// 守卫：返回 true 则编译器认定收窄
function isSessionEvent(v: unknown): v is SessionEvent {
  return typeof v === 'object' && v !== null && 'seq' in v && 'type' in v
}

raw.seq             // ❌ unknown 不许直接用
if (isSessionEvent(raw)) {
  raw.seq           // ✅ 已收窄为 SessionEvent
}
```

### 6. 类型复用带参数 → 泛型 `<T>`

```ts
// Array<T> 就是泛型；自己写一个「取首个元素」：
function first<T>(items: readonly T[]): T | undefined {
  return items[0]
}

first([1, 2, 3])         // T 推断为 number，返回 number | undefined
first(['a', 'b'])        // T 推断为 string

// 本仓库实例：会话存储对 Session 泛化
interface Store<T> {
  get(id: string): T | undefined
  create(): T
}
```

### 7. 回调签名 → `(x: T) => void`

```ts
// 事件监听：整个签名本身就是类型
type Listener = (event: SessionEvent) => void

function subscribe(listener: Listener): () => void { ... }

subscribe(event => {
  console.log(event.seq)   // 参数类型自动推断为 SessionEvent
})
```

### 8. 空值兜底 → `??`（不是 `||`）

```ts
// 经典陷阱：端口为 0 时两者行为不同
const port = 0
port || 3080     // 3080 ❌：0 是 falsy，被兜底吞了
port ?? 3080     // 0    ✅：只兜 null/undefined，0 是合法值

// 本仓库对应约定：显式 > implicit，兜底只能是 resolve 这一步的显式行为
const url = config.baseUrl ?? 'https://api.deepseek.com'
```

### 9. 安全访问 → `?.`

```ts
// config 为 null/undefined 时整条短路得 undefined，不抛错
const port = config?.server?.port        // undefined 而不是 TypeError

// 也可安全调用函数
dispose?.()                              // dispose 存在才调用

// 与 ?? 组合成日常惯用法
const port = config?.server?.port ?? 3080
```

### 10. 类型仅编译期用 → `import type`

```ts
// 编译后整行消失：不产生运行时依赖
import type { SessionEvent } from './types.ts'

// 对比值导入（运行时真的加载这个模块）
import { KNOWN_SESSION_EVENT_TYPES } from './known-event-types.ts'
```

### 11. 穷尽检查 → switch + `assertNever` / `satisfies never`

```ts
type Invocation =
  | { mode: 'profile'; profile: string }
  | { mode: 'plugin'; args: string[] }
  | { mode: 'dump-config'; patches: string[] }

function run(invocation: Invocation) {
  switch (invocation.mode) {
    case 'profile':
      return boot(invocation.profile)   // ✅ 此分支内能访问 profile
    case 'plugin':
      return runPlugin(invocation.args)
    case 'dump-config':
      return dump(invocation.patches)
    default:
      invocation satisfies never   // ✅ 全部覆盖时：此处类型是 never，编译通过
  }
}

// 漏写 'dump-config' 分支会怎样？
// default 处 invocation 的类型是 { mode: 'dump-config'; ... } 而非 never
// satisfies never 直接编译报红 —— 漏分支在编译期暴露，不带进运行时
```

| 需求 | 语法 | 对应例子 |
|---|---|---|
| 描述对象形状 | `interface` | 例 1 |
| 描述「或」/「与」 | 联合 `\|` / 交叉 `&` | 例 2 |
| 值的有限集合 | 字面量联合（优于 enum） | 例 3 |
| 可能为空 | `\| undefined` + 使用前收窄 | 例 4 |
| 不信任的数据 | `unknown` + 守卫收窄 | 例 5 |
| 类型复用带参数 | 泛型 `<T>` | 例 6 |
| 回调签名 | `(x: T) => void` | 例 7 |
| 空值兜底 | `??`（不是 `\|\|`） | 例 8 |
| 安全访问 | `?.` | 例 9 |
| 类型仅编译期用 | `import type` | 例 10 |
| 穷尽检查 | switch + `assertNever` / `satisfies never` | 例 11 |

## 学习建议

1. 拿本文件当字典，**边读项目边回查**，不要试图先背熟再读码
2. 每个语法点在本仓库的「现身处」：`SessionEventMap`（判别联合/映射）、`packages/util/brand`（交叉类型）、`packages/core/session/src/index.ts`（unknown 收窄）——见 3 号清单的路径索引
3. 手改代码看编译器反应（改错事件名、删掉收窄），报错信息是最好的老师
