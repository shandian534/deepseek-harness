# TypeScript 前置知识清单（为本项目定制）

> 基于对本代码库的真实特性扫描排序，非通用 TS 大纲。配合 [0-源码阅读指南](0-源码阅读指南.md) 使用。
> 本文件为个人学习笔记，未纳入 doc-sync 门禁。

## 第一梯队：不懂就读不懂行（本项目的命脉特性）

### 1. `declare module` 模块扩充（declaration merging）

整个插件体系的地基。每个包都往 Cordis 的全局 `Context`/`Events` 接口里「合并」自己的成员：

```ts
// packages/core/session/src/index.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore        // 合并出 ctx.sessions 服务访问器
  }
  interface Events {
    'session/created'(session: Session): void  // 合并出类型安全的事件
  }
}
```

几乎每个包的 `src/index.ts` 开头都有这段。不懂这个，会以为 `ctx.sessions` 是魔法。

**重点学：** interface 声明合并规则、模块扩充与全局扩充的区别。

### 2. 映射类型 + `keyof` + 泛型约束

事件系统的类型安全全靠它：

```ts
// packages/core/session/src/types.ts:404
export type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    data: SessionEventMap[K]   // type 判别后 data 类型随之锁定
  }
}[T]
```

**重点学：** `{[K in T]: ...}[T]` 这个分发技巧、`keyof`、泛型默认值。

### 3. 判别联合（discriminated union）+ `switch`/`assertNever`

仓库规范强制所有闭联合用 tag 收尾：

```ts
if (mode.kind === 'profile') { ... }
// 每个闭联合分支末尾:
default: return assertNever(mode)  // 漏分支 = 编译错误
```

**重点学：** 判别字段、可收窄性（narrowing）、`never` 类型的作用。

### 4. 异步模型：`Promise` 组合 + `async` 迭代器

流式 LLM 响应全是 `AsyncGenerator`（`packages/llm/llm/src/index.ts`、`sse.ts`）；生命周期靠 `await Promise.allSettled` 驱动。

**重点学：** `AsyncIterator`/`AsyncGenerator` 协议、`for await...of`、`allSettled` vs `all`、事件循环对 async 的调度顺序。

## 第二梯队：频繁出现，边读边补

| 特性 | 在哪见到 | 学什么 |
|---|---|---|
| **工具类型** `Omit`/`Pick`/`Partial`/`Readonly` | 核心包高频（`tools/src/index.ts` 一文件 7 处） | 各自语义 + 手写一遍实现 |
| **`satisfies`** | 全仓 114 个文件 | 保留推断的同时校验字面量——本项目配置对象的标准写法 |
| **交叉类型 `&`** | `Branded<B>`（`packages/util/brand`）：`string & {readonly [BRAND]: B}` | 名义化类型、为什么防 string 混用 |
| **条件类型 `extends ? :` + `infer`** | cordis 自己的 `Parameters`/`ReturnType`（`vendor/cordis/src/events.ts:22`） | 类型级模式匹配 |
| **`this` 类型** | 事件监听器 `'session/created'(this: Scoped<Session>, ...)` | `ThisType` 与监听器上下文 |
| **抽象类 + 继承** | `EntryTree`（`vendor/loader/src/config/tree.ts`） | abstract 成员、模板方法 |
| **`as const`** | 配置/字面量表 | 冻结字面量推断 |

## 第三梯队：读 vendor 时才需要

- **装饰器**（`@Inject` 等，`vendor/cordis/src/registry.ts`）——只在 vendored Cordis 里用，业务包不用；ES 装饰器 vs experimental 的区别扫一眼即可
- `declare module` 的运行时副作用：`Reflect.defineMetadata` 之类不用深究

## 学习路径建议

1. **先花 2–3 小时过 TS Handbook 的这几章**：Generics、Narrowing、Keyof Types → Mapped Types、Declaration Merging、Modules 的 augmentation 段——只读这些，别从头读全本
2. **拿本项目当习题集验证**：读懂 `packages/core/session/src/types.ts`（`SessionEventMap` → `SessionEvent` 映射分发）+ `packages/util/brand/src/index.ts`（20 行的 branded type），这两个文件覆盖第一梯队的全部特性
3. **类型报错就是教程**：调试时故意改错一个事件名/删一个 switch 分支，看编译器怎么用 `assertNever`/映射类型报错，比读文档直观
4. React/TSX（`packages/client/ui-*`，249 个文件）只在看 web 前端时才需要，可以最后补 React hooks 基础
