---
title: 死磕Redis之起手式
author: 王登武
date: 2022-03-11 17:09:53
categories:
- 死磕Redis
tags:
- redis
- 分布式缓存
---
### 死磕Redis系列
Redis作为集中式缓存（也支持分布式架构），不管是单体应用还是分布式微服务都离不开，所以对Redis进行深入了解则显得额外重要，所以打算做一个死磕Redis系列，从浅到深的系统介绍一下Redis，当然这也是很好的对知识的梳理和再学习的机会，因为最好的学习方式就是能清晰的讲给别人听。
我个人认为学习一项知识或者技术，大致分为三个阶段，

1. 熟练使用
2. 原理架构
3. 深入源码


首先需要先动手，先用起来，写写demo，做做项目，有一个大概的认知。
随着可以掌握大部分功能，就可以深入其原理和架构，了解其设计和思想是什么样的，这个时候就对其整体有了认知。
当有了全局和思想的掌握后，就可以深入细节，阅读源码则更能由表入里，完全掌握这项技术或中间件。
当然这三个部分是互相循环的，互为助推，随着熟练使用，就接触到一部分原理和架构，然后可能也会看一部分源码， 继而更有助于熟练使用，也能更理解原理和架构。就像下面这张图一样。
![](https://img.dengwu.wang/blog/202203111725715.jpg)
### 死磕Redis系列大纲
大概计划了一个大纲
![](https://img.dengwu.wang/blog/202203111728829.png)
如果能写完死磕Redis系列，效果还不错的话，可能还会有《死磕Netty》《死磕Kotlin》《死磕Java并发》等等系列吧。
### 死磕Redis之起手式
那么我们就正式进入死磕Redis系列的起手式。
不要小看起手式，陈氏太极拳里的起手式可以起到静气凝神，是为后续宜柔宜刚打下基础，也起了一个基调。
### 本地单机Redis
开始死磕Redis之前，我们首先需要有个Redis，那如何快速获取一个Redis呢？有2种方式，自己本地装一个，或者使用docker启动一个。
我推荐使用docker，因为简单方便，使用之后清理也方便，最重要的是不会污染你本地环境和端口。
首先我们先装一个[docker desktop](https://www.docker.com/get-started)，具体点击链接按照指引即可安装成功。
然后我们去DockerHub搜一下[Redis](https://hub.docker.com/_/redis?tab=tags)的镜像，点击链接即可跳转过去，Redis的版本很多，我们暂时选最新稳定版6.2.6。
启动Redis实例`docker run --name redis -p 127.0.0.1:6379:6379 -d redis:6.2.6`，运行`docker ps`就可以看到运行中的redis实例了。
如果本地没有安装redis，没有redis-cli工具，则可以使用`docker exec -it redis redis-cli`连到容器的redis，执行info命令就可以看到redis服务的信息了。
![](https://img.dengwu.wang/blog/202203112301578.png)
### spring boot连接Redis
我们首先可以使用https://start.spring.io/创建一个骨架程序
![](https://img.dengwu.wang/blog/202203112315606.png)
点击生成下载到本地后，使用IntelliJ打开
![](https://img.dengwu.wang/blog/202203112352611.png)
如果你按照上述步骤来动手实践的话，我希望你在demo文件夹下使用git init来初始化代码仓库，以方便对代码进行版本管理。
### HelloRedis
我们需要添加一些代码，设置Redis相关的配置，来执行HelloRedis的操作。
首先我们先在application.properties添加Redis连接信息

``` properties
spring.redis.host=127.0.0.1
spring.redis.port=6379
```
然后创建一个HelloRedisController来响应http，并对Redis进行操作

``` java
package learn.redis.demo.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author wangdengwu
 */
@RestController
@RequestMapping("/redis")
public class HelloRedisController {

    public static final String HELLO = "hello";
    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @GetMapping("/hello")
    public String helloRedis(@RequestParam(required = false) String name) {
        if (name == null || name.isEmpty()) {
            String result = stringRedisTemplate.opsForValue().get(HELLO);
            return HELLO + " " + result;
        } else {
            stringRedisTemplate.opsForValue().set(HELLO, name);
        }
        return HELLO + " " + name;
    }
}
```
使用mvn spring-boot:run或者在IDE里启动DemoApplication
然后在浏览器里输入http://127.0.0.1:8080/redis/hello?name=redis
这样就将redis字符串存到了redis里，再执行http://127.0.0.1:8080/redis/hello，就可以看到hello redis了
也可以使用命令`docker exec -it redis redis-cli`连接到redis，执行`keys *`以及`get hello`和`type hello`可以看到redis内存储的数据信息
![](https://img.dengwu.wang/blog/202203120044575.png)
### 结尾
虽然这个起手式真的很简单，但是它打通了我们连接redis的第一步，后续我们将持续增加功能来对redis进行操作