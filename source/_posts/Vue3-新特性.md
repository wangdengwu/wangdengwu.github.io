---
title: Vue3 新特性
author: 王登武
date: 2021-11-02 14:23:28
categories: vue
tags:
	- vue3
	
---
## vue2的历史问题
为什么需要有Vue3？有人开玩笑式的抱怨
> 别再升级了，老子学不动了

框架升级一定是有原因的，是为了解决问题或者带来新特性，否则不会跨大版本不兼容升级。
为什么vue要有vue3呢，先来看看vue2框架结构和一些历史遗留问题。
vue2由几大块组成：组件，响应式，虚拟DOM，运行时，浏览器耦合模块。但是由于历史原因，其有以下几个缺点：
1. vue2是基于Flow.js来做类型校验的，但是现在Flow.js已经停止维护。
2. vue2的运行时耦合浏览器操作，这会带来如果需要适配小程序，则要改vue核心代码才行。
3. vue2的响应式，也不是真正意义上的proxy，而是为了兼容IE使用了Object.defineProperty()，有很大的性能问题。
4. 对应代码较多的组件，data,methods导致数据和方法隔离，当行数比较多时，需要来回查看，不利于维护。

## vue3的新特性
##### 响应式系统，使用了Proxy来实现，所以vue3不再兼容IE11以下浏览器。
##### 自定义渲染器，将浏览器相关渲染独立出来，这样只需要增加对小程序渲染的模块，就增加了对小程序的支持。
##### 使用TypeScript重构，增强了类型安全。
##### Composition API 组合语法，解决数据定义和方法分开导致的注意力打断，复杂逻辑的代码行数很多的情况下，便于维护。

###### vue2写法

``` javascript
let App = {
  data() {
    return {
      count: 1
    }
  },
  methods: {
    add() {
      this.count++
    }
  },
  computed: {
    double() {
      return this.count * 2
    }
  }
}
Vue.createApp(App).mount('#app')
```
###### vue3写法

``` javascript
const { reactive, computed } = Vue
let App = {
  setup() {
    const state = reactive({
      count: 1
    })
    function add() {
      state.count++
    }
    const double = computed(() => state.count * 2)
    return { state, add, double }
  }
}
Vue.createApp(App).mount('#app')
```

##### Vue 3 还内置了 Fragment、Teleport 和 Suspense 三个新组件 

*  Fragment: Vue 3 组件不再要求有一个唯一的根节点，清除了很多无用的占位 div。
*  Teleport: 允许组件渲染在别的元素内，主要开发弹窗组件的时候特别有用。
*  Suspense: 异步组件，更方便开发有异步请求的组件。
	
##### 新一代工程化工具 Vite
Webpack采用预编译的方式，往往由于工程文件很多，导致打包时间要到分钟级别，严重影响开发体验，而Vite采用按需加载，可以大大缩短启动时间，开发期间几乎秒启动，按需加载。
## vue2要不要升级vue3
![](https://img.dengwu.wang/blog/20211102164915.png)
## 总结
* 工程化工具 Vite 带来了更丝滑的调试体验。
* 对于产品的最终效果来看，Vue 3 性能更高，体积更小。
* 对于普通开发者来说，Composition API 组合语法带来了更好的组织代码的形式。
* 全新的响应式系统基于 Proxy，也可以独立使用。
* Vue 3 内置了新的 Fragment、Teleport 和 Suspense 等组件。
* 对于 Vue 的二次开发来说，自定义渲染器让我们开发跨端应用时更加得心应手。
* 对于 Vue 的源码维护者，全部的模块使用 TypeScript 重构，能够带来更好的可维护性。
![](https://img.dengwu.wang/blog/20211102163240.png)