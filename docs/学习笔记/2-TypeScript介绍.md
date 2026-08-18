# TypeScript 介绍：与 JavaScript 的区别和联系

> 学习笔记系列的 TS 入门第一篇。读完再看 [1-TypeScript前置知识清单](1-TypeScript前置知识清单.md) 进入本项目实战。
> 本文件为个人学习笔记，未纳入 doc-sync 门禁。

## 一句话定位

**TypeScript = JavaScript + 静态类型系统（编译期）**。TS 是 JS 的超集：任何合法 JS 代码都是合法 TS 代码，TS 在此之上增加了类型标注和面向编译器的语言特性。

## 联系：TS 是怎么变成 JS 跑起来的

TS **不能直接运行**（浏览器、Node 只认 JS）。它必须经过「擦除」——编译器（`tsc`，或 esbuild/swc 等更快的工具）把类型标注全部删掉，输出纯 JS：

```ts
// 你写的 TS
function greet(name: string): string {
  return `hello, ${name}`
}
```

```js
// 编译产物（类型全没了，只剩 JS）
function greet(name) {
  return `hello, ${name}`
}
```

这揭示了 TS 最重要的真相：**类型只存在于编译期，运行时没有类型**。

- 编译器用类型检查代码，报错就拒绝编译
- 编译产物是普通 JS，跑起来和手写 JS 无异
- 所以 TS 的价值是「开发期纠错 + 编辑器智能提示」，**不提供任何运行时保护**

## 联系：本项目是怎么跑 TS 的

这个仓库正好是两种模式的活教材：

| 模式 | 命令 | 机制 |
|---|---|---|
| **转译即运行**（开发调试） | `node --import tsx/esm apps/cli/src/bin.ts` | tsx 在 Node 加载模块的瞬间用 esbuild 转译——快，但**跳过类型检查** |
| **先编译后运行**（构建产物） | `pnpm run build` → `lib/*.js` | `tsc` 全量类型检查 + 产出声明文件，运行时加载 `lib/` |

这解释了你调试时遇到的现象：改错类型，Debug 照样能启动（tsx 只转译不检查），但 `pnpm run typecheck` 会红。**类型检查是独立的一道质量门禁**（本仓库 CI 强制 `strict: true` 全绿），不是运行的前提。

## 区别：TS 在 JS 之上加了什么

### 1. 类型标注（最核心）

```ts
// JS：参数是什么、返回什么，全靠注释和猜
function add(a, b) { return a + b }
add(1, '2')  // '12'，静默的字符串拼接，埋雷到生产

// TS：契约写在签名上
function add(a: number, b: number): number { return a + b }
add(1, '2')  // 编译错误：Argument of type 'string' is not assignable to parameter of type 'number'
```

类型从哪来：**基础类型**（`string`/`number`/`boolean`）、**结构化对象类型**（`{ name: string; age: number }`）、**联合**（`string | null`）、**数组/泛型**（`Array<Session>`，泛型即「类型的参数」）。TS 的类型系统是**结构化**的：只看形状像不像，不看叫什么名字（duck typing 的静态版）——两个独立定义但字段相同的 interface 互相兼容。

### 2. 面向接口编程的语法

```ts
interface SessionStore {
  get(id: string): Session | undefined
  create(): Session
}

type EventName = 'session/created' | 'session/ended'  // 字面量联合：值即类型
```

`interface` 与 `type` 都能描述对象形状；关键差异是 **interface 可被重复声明自动合并（declaration merging）**——这正是 Cordis 插件体系的地基（见清单第一梯队第 1 条）。

### 3. 编译期独有的语言特性

部分 TS 特性纯为类型服务，擦除后不留痕迹：

- `interface` / `type` 声明
- 泛型 `<T>`
- 类型断言 `value as string`（告诉编译器「信我」，不转换运行时值）
- `enum`、namespace（有运行时产物， vendored Cordis 用到，现代代码基本不用）

而另一些是 **JS 标准语法**（class、箭头函数、可选链 `?.`、空值合并 `??`、装饰器提案）——这些不是 TS 专属，TS 只是先支持了它们。

### 4. 严格模式的「未定义纪律」

JS 的默认行为对未定义值极其宽容（`undefined.foo` 运行时才炸）。TS 的 `strict: true`（本仓库强制开启）把这些全部前置到编译期：

- `null`/`undefined` 必须显式声明（`string | null` 才可为空）
- 使用前必须收窄（narrowing）：`if (x !== null) { ... }` 之后才允许 `x.foo`
- 这是你在本项目源码里看到大量 `if (!entry) throw` / 判别联合 `switch` 的根本原因

## 区别与联系速查表

| 维度 | JavaScript | TypeScript |
|---|---|---|
| 执行 | 浏览器/Node 直接跑 | 必须先擦除类型转成 JS |
| 类型检查 | 无，运行时才暴露 | 编译期，`strict` 模式全量检查 |
| 类型存在期 | —（运行时只有 `typeof` 的粗糙分类） | 仅编译期，运行时完全消失 |
| 生态 | — | 依赖 JS 生态，`.d.ts` 声明文件为 JS 库补类型 |
| 学习曲线 | 入门快，坑在隐式转换和 undefined | 概念多（泛型/条件类型），但报错即教程 |
| 关系 | TS 的运行时语义**完全等于** JS | JS ⊂ TS，任何 JS 都是合法 TS |

## 对读本项目源码的三条落点

1. **看到 `ctx.sessions` 不要找它的「注册处」**——那是 `declare module` 合并出来的类型 + Cordis 运行时注册的效果，类型和运行时是两条线
2. **运行时边界要自己防**：正因类型编译后消失，本仓库规范才要求在「parser/config、model/tool JSON、durable/file、worker、process、wire」等边界做运行时校验——类型管不了的地方恰好就是这些边界（见根 AGENTS.md「Trust TypeScript at typed same-process boundaries」）
3. **调试器里看不到类型**：断点停在 `.ts` 文件是 sourcemap 的功劳，变量面板里只有运行时值——这再次印证「类型是编译期概念」

## 延伸阅读

- [TS Handbook（官方）](https://www.typescriptlang.org/docs/handbook/intro.html)——配合清单里的选读章节
- [TypeScript 官网 Playground](https://www.typescriptlang.org/play)——左侧写 TS 右侧看擦除后的 JS，直观看懂「类型擦除」
