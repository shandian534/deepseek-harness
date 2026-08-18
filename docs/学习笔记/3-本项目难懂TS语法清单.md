# 本项目难懂 TS 语法清单（附真实出处）

> 全部例子摘自本仓库源码，标注文件路径，可直接跳转对照。
> 循「看不懂什么查什么」使用；配合 [1-TypeScript前置知识清单](1-TypeScript前置知识清单.md)。
> 本文件为个人学习笔记，未纳入 doc-sync 门禁。

## 1. `declare module` 模块扩充

**难度 ★★★★★ | 出现频率：每个包**

```ts
// packages/core/session/src/index.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }
  interface Events {
    'session/created'(this: Scoped<Session>, session: Session): void
  }
}
```

**难在哪**：一个包居然能往别的包的接口里「加字段」。这是 interface 的声明合并（declaration merging）：同名 interface 自动合并成员，`declare module` 指定合并进哪个模块的作用域。

**读码要点**：看到 `ctx.sessions`、`ctx.tools`，它们的类型不是在 cordis 里定义的，而是各业务包合并进去的；运行时的值则是插件 `apply` 时注册的服务。**类型和运行时是两条独立的线**。

## 2. 映射类型 + 索引分发 `{[K in T]: ...}[T]`

**难度 ★★★★★ | 核心：session、agent**

```ts
// packages/core/session/src/types.ts:404
export type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    data: SessionEventMap[K]
  }
}[T]
```

**难在哪**：两步组合拳。`{[K in ...]: ...}` 先造一张「key → 变体」的映射表，末尾 `[T]` 再按 key 取值。当 `T = 'turn/start'` 时结果就是 `{ type: 'turn/start'; data: {...} }`；不传 T 时 = 所有变体的联合。这就是「判别联合」的类型级生成器。

**读码要点**：`SessionEvent` 不带泛型参数时就是联合类型；`SessionEvent<'turn/start'>` 是其中一个变体。

## 3. 条件类型 + `infer`（类型级模式匹配）

**难度 ★★★★★ | cordis 基础设施**

```ts
// vendor/cordis/src/events.ts:22
export type Parameters<F> = F extends (...args: infer P) => any ? P : never
export type ReturnType<F> = F extends (...args: any) => infer R ? R : never
export type ThisType<F> = F extends (this: infer T, ...args: any) => any ? T : never
```

**难在哪**：`extends ? :` 是类型层面的 if；`infer P` 在匹配位置「声明一个待推断的类型变量」。`F extends 函数 ? 推出参数类型 : 不是函数给 never`。

**读码要点**：这是类型体操的核心原语，后面所有复杂类型都由它组合。cordis 没用内置的 `Parameters`/`ReturnType` 而是自己定义（带 `this` 推断），因为事件监听器依赖 `this` 类型。

## 4. 三层嵌套的条件 + 映射（agent 事件过滤）

**难度 ★★★★★ | packages/core/agent/src/dispatch.ts**

```ts
[K in keyof Events]: Events[K] extends (this: Scoped<Agent>, ...args: infer P) => unknown
  ? P extends [infer Payload, ...unknown[]]
    ? Payload extends { agent: Agent } ? K : never
    : never
  : never
```

**难在哪**：映射类型里套两层条件类型。逐层读：对每个事件名 K，先检查它的监听器签名是否 `(this: Scoped<Agent>, ...)`，再推断首个参数 Payload，最后只保留「payload 里带 `agent: Agent` 字段」的事件名。整个类型计算出「哪些事件携带 agent」这个集合。

**读码要点**：遇到这种长类型**从最外层往里剥**，每一层问「这层过滤/变换了什么」。`never` 在映射里表示「丢弃这个 key」。

## 5. 品牌类型（branded/nominal type）

**难度 ★★★★ | 全仓 104 个文件**

```ts
// packages/util/brand/src/index.ts:27
export type Branded<B extends string> = string & { readonly [BRAND]: B }

// packages/core/scope/src/index.ts:27
export type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

**难在哪**：TS 是结构化类型——两个形状相同的类型天然兼容。交叉一个带唯一 symbol 键的「幽灵字段」后，结构上就不再相同，从而造出「名义类型」。运行时这个字段不存在（类型擦除），纯编译期防混用。

**读码要点**：`SessionId`、`TurnId` 这类 id 全是 `Branded<'...'>`——防止你把 turn 序号传给要 session id 的函数。报错信息里看到 `Brand<...>` 字样就是这个。

## 6. `asserts x is T` 断言谓词

**难度 ★★★★ | 边界校验**

```ts
// packages/core/session/src/index.ts
function assertSessionEventEnvelope(
  value: Record<string, unknown>, index: number,
): asserts value is SessionEvent {
  if (/* 校验失败 */) throw new Error(...)
}
```

**难在哪**：普通类型谓词 `x is T`（返回 boolean 才收窄）的加强版——函数**不抛错即证明**收窄成立。调用后，编译器把 `value` 当作 `SessionEvent`，不用再 `if (assert(...))`。

**读码要点**：所有「从磁盘/JSON 读数据」的边界都靠它：先 `JSON.parse` 成 `Record<string, unknown>`（不信任），断言通过后才获得具体类型。这是「类型管编译期、边界靠运行时」原则的落地形态。相关的还有返回布尔值的普通谓词，形态是 `function isX(v: unknown): v is X`。

## 7. 函数重载（overloads）

**难度 ★★★★ | cordis Fiber/事件**

```ts
// vendor/cordis/src/fiber.ts:415
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
/** Same as above for async effects; the disposer is also awaitable. */
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
effect(execute: () => Effect, label = 'anonymous'): any {   // 实现签名，对外不可见
  ...
}
```

**难在哪**：同名函数写多行签名再写一个实现。调用方看到的只有前两行（按参数类型分流返回类型），最后的实现签名 `any` 不对外。

**读码要点**：`ctx.effect()` 同步效应拿到 `Disposable`、异步效应拿到 `AsyncDisposable`，就是这两个重载分的流。看 IDE 智能提示出现多个候选签名时就是重载。

## 8. 泛型事件监听 `on<K extends keyof Events>`

**难度 ★★★★ | 事件系统入口**

```ts
// vendor/cordis/src/events.ts:97
on<K extends keyof Events>(name: K, listener: Events[K], options?: ...): () => boolean
```

**难在哪**：`K` 被约束为「Events 的所有 key」，于是 `name` 和 `listener` **联动**——传 `'session/created'` 时 listener 必须匹配 `Events['session/created']` 的签名（包括 `this` 类型）。

**读码要点**：这就是事件名打错、payload 形状不对会被编译器抓住的机制；`keyof` + 索引访问 `Events[K]` 的组合在泛型里到处都是。

## 9. 模板字面量类型

**难度 ★★★ | 环境变量、插件 id**

```ts
// packages/subprocess/subprocess/src/types.ts
export const DSH_ENV_PREFIX = 'DSH_' as const
export type DshEnvironmentKey = `${typeof DSH_ENV_PREFIX}${string}`
```

**难在哪**：类型层面拼接字符串。`typeof DSH_ENV_PREFIX` 借 `as const` 拿到字面量 `'DSH_'`，与 `${string}`（任意字符串的通配）拼出「必须以 DSH_ 开头的字符串」。

**读码要点**：见到 `` type X = `...${...}` `` 就读作「有格式的字符串」。运行时就是普通 string，格式约束只在编译期。

## 10. 生成类型体操（typert 产物）

**难度 ★★★ | 看懂即可，不用会写**

```ts
// packages/extensions/cordis-client-runner/src/client/api-catalog.ts（生成声明）
export type BakedActions<T, A extends ActionsDecl<T>> = {
  [K in keyof A]: A[K] extends (draft: T, ...params: infer P) => void ? (...params: P) => void : never;
};
export type BoundActions<H> = H extends StoreHandle<infer T, infer A> ? BakedActions<T, A> : never;
```

**难在哪**：把「剥离首参 draft 的方法表」写成类型级代码——对每个方法 `infer` 出剩余参数 `P`，重新组装成 `(...params: P) => void`。

**读码要点**：这些 `declaration: '...'` 字符串是 **typert 生成器拼出来、供客户端 `declare` 的源码文本**，不是手写的。读不懂可以跳过，知道它是「服务端方法的客户端绑定类型」即可。

## 11. `satisfies` 与 `satisfies never`

**难度 ★★ | 全仓 114 文件 / bin.ts 收尾**

```ts
// apps/cli/src/bin.ts:51
default:
  invocation satisfies never
  throw new Error(...)
```

**难在哪**：`satisfies` 校验值匹配类型但**保留字面量推断**（不像 `: T` 标注会拓宽）。极端用法 `x satisfies never`：若 `x` 的类型不是 `never` 就报错——switch 走到 default 意味着漏了分支，此时 `invocation` 仍是某个具体类型，编译器立刻报红。

**读码要点**：这是 `assertNever` 的内联形态（仓库也有独立的 `assertNever` 函数，`packages/llm/llm/src/never.ts`，运行时抛错 + 编译期 `never` 参数）。所有闭联合的 switch 都必须以二者之一收尾。

## 12. 杂项高频小语法

| 语法 | 例子出处 | 一句话解释 |
|---|---|---|
| `Simplify<T> = { [K in keyof T]: T[K] } & {}` | `packages/core/tools/src/schema.ts` | 同构映射把交叉类型「摊平」成一个对象字面量，IDE 悬停更可读 |
| `Record<string, unknown>` | session 边界校验 | 「任意字符串键、值未知」——不信任数据的第一站 |
| `let task!: void \| Promise<void>` | `vendor/cordis/src/fiber.ts:430` | 明确赋值断言：承诺使用前必被赋值，绕过严格检查 |
| `constructor(public code: ...)` | `vendor/cordis/src/fiber.ts:162` | 参数属性：构造参数直接成为实例字段（vendored 大量使用，Node 原生 strip 模式不支持的语法之一） |
| `readonly` 修饰符 / `readonly T[]` | `SessionEventMap` 各事件 | 编译期只读，防止事件对象被改 |
| `as const` | `DSH_ENV_PREFIX` | 把变量类型钉死为字面量（`'DSH_'` 而非 `string`） |
| `this: Scoped<Agent>` 参数 | 各事件签名 | 声明监听器内 `this` 的类型（伪参数，运行时不存在） |
| 可辨识可选字段 `interrupted?: true` | `AssistantMessageNode` | 只能是 `true` 或缺省——「标记位」的精确写法 |

## 阅读方法论（比语法本身更重要）

1. **长类型从外往里剥**：先看最外层是映射（`{[K in ...]}`）、条件（`extends ? :`）还是交叉（`&`），每层问「过滤还是变换」
2. **善用 IDE 悬停**：WebStorm 里把鼠标放在类型别名上，展开计算后的最终形态——比脑内展开可靠
3. **`never` 出现即「丢弃/不可能」**：映射里丢 key、条件不匹配的兜底、switch 收尾的穷尽检查，三种语义
4. **类型报错是教程**：删一个 switch 分支、传错一个事件名，看编译器怎么指认——本仓库 `strict: true` 全开，反馈极快
5. **区分「类型线」和「运行时线」**：凡是编译后消失的（interface/类型别名/infer/品牌字段），调试器里都不存在；断点看到的是纯 JS
