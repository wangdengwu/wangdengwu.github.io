---
title: 死磕Redis之数据类型
author: 王登武
date: 2022-03-15 11:36:56
categories:
- 死磕Redis
tags:
- redis
- 分布式缓存
---
### Redis数据类型
Redis之所以很流行，除了作为集中式缓存之外，还因为其提供了丰富的数据类型，我们看下都有哪些数据类型。
对外的API数据类型主要有以下几种：

* String
* List
* Hash
* Set
* Sorted Set

而对应的底层数据结构则有
![](https://img.dengwu.wang/blog/202203181617189.png)
### Redis的Key-Value存储结构
我们知道Redis是通过Key来操作Value的，那Key-Value的对应关系又是怎么样的呢，如何快速通过key找到对应的value呢
![图片来源-极客时间-Redis核心技术与实践](https://img.dengwu.wang/blog/202203151254812.png)
既然是使用哈希表的方式，当KEY比较多的时候，必然会出现哈希冲突的情况，那如果有哈希冲突，redis是如何处理的呢。
![图片来源-极客时间-Redis核心技术与实践](https://img.dengwu.wang/blog/202203151518362.png)
首先使用链式哈希解决哈希冲突，但是如果链式长度过长，也会导致性能下降，则Redis会进行一次渐进式rehash操作。
![图片来源-极客时间-Redis核心技术与实践](https://img.dengwu.wang/blog/202203181217176.png)
其实不止因为哈希冲突会扩充全局哈希表，随着Key的增多，容量不够时一样会进行扩充全局哈希表，我们来看下日志。
首先修改日志级别为verbose和设置日志文件

``` 
loglevel verbose
logfile "/usr/local/etc/redis/redis.log"
```
执行Set命令后可以看到日志如下：
```
1:C 17 Mar 2022 15:26:59.612 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo
1:C 17 Mar 2022 15:26:59.612 # Redis version=6.2.6, bits=64, commit=00000000, modified=0, pid=1, just started
1:C 17 Mar 2022 15:26:59.612 # Configuration loaded
1:M 17 Mar 2022 15:26:59.613 * monotonic clock: POSIX clock_gettime
1:M 17 Mar 2022 15:26:59.613 * Running mode=standalone, port=6379.
1:M 17 Mar 2022 15:26:59.613 # Server initialized
1:M 17 Mar 2022 15:26:59.613 * Ready to accept connections
1:M 17 Mar 2022 15:28:52.452 - Accepted 127.0.0.1:49086
1:M 17 Mar 2022 15:29:24.969 - DB 0: 1 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:29:29.980 - DB 0: 2 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:29:34.993 - DB 0: 2 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:29:40.005 - DB 0: 2 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:29:45.018 - DB 0: 2 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:29:50.030 - DB 0: 3 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:29:55.042 - DB 0: 3 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:30:00.053 - DB 0: 4 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:30:05.066 - DB 0: 4 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:30:10.079 - DB 0: 4 keys (0 volatile) in 4 slots HT.
1:M 17 Mar 2022 15:30:15.091 - DB 0: 5 keys (0 volatile) in 8 slots HT.
1:M 17 Mar 2022 15:30:20.104 - DB 0: 6 keys (0 volatile) in 8 slots HT.
1:M 17 Mar 2022 15:32:55.475 - DB 0: 7 keys (0 volatile) in 8 slots HT.
1:M 17 Mar 2022 15:33:00.488 - DB 0: 9 keys (0 volatile) in 16 slots HT.
1:M 17 Mar 2022 15:33:05.498 - DB 0: 10 keys (0 volatile) in 16 slots HT.
```
有些重复的日志我删掉了，可以看到初始化是4个slots，后续扩容都会翻倍。
### dictEntry
全局哈希表里存储的具体对象是dictEntry，具体结构是什么样的呢？
![](https://img.dengwu.wang/blog/202203181350496.png)
以Set hello world指令举例，属性key即设置的hello，指向sds（Simple Dynamic String）类型
属性val指向redisObject类型,而next即哈希冲突的拉链，指向下一个entry
### redisObject

Redis中的每个对象底层的数据结构都是redisObject结构体
* type	:记录redis的对象类型
* encoding:记录底层编码，即使用哪种数据结构保存数据
* lru:和缓存淘汰相关
* refcount:对象被引用的次数
* ptr:指向底层数据结构的指针
type记录值的类型，即string,list,set,hash,zset,包括后续新增的stream,geo,bitmap等新的类型

```
127.0.0.1:6379> SET hello world
OK
127.0.0.1:6379> type hello
string
127.0.0.1:6379> LPUSH list 1
(integer) 1
127.0.0.1:6379> type list
list
127.0.0.1:6379> SADD set 1
(integer) 1
127.0.0.1:6379> type set
set
127.0.0.1:6379> HSET hash hello world
(integer) 1
127.0.0.1:6379> type hash
hash
127.0.0.1:6379> ZADD zset 1 hello
(integer) 1
127.0.0.1:6379> type zset
zset
```
encoding即底层存储数据结构，可以使用object encoding key来确定encoding的类型

```
127.0.0.1:6379> object encoding hello
"embstr"
127.0.0.1:6379> object encoding 1
"int"
127.0.0.1:6379> object encoding list
"quicklist"
127.0.0.1:6379> object encoding set
"intset"
127.0.0.1:6379> object encoding hash
"ziplist"
127.0.0.1:6379> object encoding zset
"ziplist"
```
具体每个type对应的encoding如下：
![](https://img.dengwu.wang/blog/202203181516759.png)

### 字符串类型
Redis没有使用c语言的字符串，而是自己写了一个，并且做了优化，会根据字符串的长度的不同使用不同的类型以减小内存占用。
每个类型大体上都有以下属性：
* len:字符串长度
* alloc:分配的空间长度
* flags:标识类型
* buf[]:字符数组
![](https://img.dengwu.wang/blog/202203181424818.png)
在sdshdr5中将类型放到了flags的前3个字节中（3个字节能保存6种类型，所以3个字节足够了），后5个字节用来保存字符的长度。因为sdshdr5取消了alloc字段，因此也不会进行空间预分配
当存储的val为数字类型时，则直接使用整数来保存这个字符串，也就是redisObject里的属性val，直接存数字，这也是type是int的由来。
当字符串的长度小于等于44字节时，redisObject和sds一起分配内存。当字符串大于44字节时，才对redisObject分配一次内存，对sds分配一次内存
![](https://img.dengwu.wang/blog/202203181527532.png)

##### 为什么以44字节为界限？

redisObject：16个字节  
SDS：sdshdr8（3个字节）+ SDS 字符数组（N字节 + \0结束符 1个字节）
Redis规定嵌入式字符串最大以64字节存储，所以N=64-16-3-1=44 

##### 为什么嵌入式字符串最大以64字节存储？
因为在x86体系下，一般的缓存行大小是63字节，redis能一次加载完成

```
127.0.0.1:6379> SET hello world
OK
127.0.0.1:6379> object encoding hello
"embstr"
127.0.0.1:6379> SET hello 01234567890123456789012345678901234567890123
OK
127.0.0.1:6379> object encoding hello
"embstr"
127.0.0.1:6379> SET hello 012345678901234567890123456789012345678901234
OK
127.0.0.1:6379> object encoding hello
"raw"
```

### ziplist数据结构
由于ziplist数据结构几乎在所有集合都用到了，需要先介绍一下ziplist
压缩列表实际上类似于一个数组，数组中的每一个元素都对应保存一个数据。和数组不同的是，压缩列表在表头有三个字段 zlbytes、zltail 和 zllen，分别表示列表长度、列表尾的偏移量和列表中的 entry 个数；压缩列表在表尾还有一个 zlend，表示列表结束。
![](https://img.dengwu.wang/blog/202203181539390.png)

### List类型
list类型现在是直接使用quicklist实现的
quicklist是一个双向链表，链表中每个节点是一个ziplist
![](https://img.dengwu.wang/blog/202203181541836.png)

### Hash类型
元素比较少时用ziplist来存储，当元素比较多时用hash来存储
元素比较少时
![](https://img.dengwu.wang/blog/202203181545270.png)
元素比较多时
![](https://img.dengwu.wang/blog/202203181545806.png)

```
127.0.0.1:6379> HSET hash hello world
(integer) 0
127.0.0.1:6379> object encoding hash
"ziplist"
127.0.0.1:6379> HSET hash hello worldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworldworld
(integer) 0
127.0.0.1:6379> object encoding hash
"hashtable"
```
### Set类型
当元素不多，且元素都为整数时，set的底层实现为intset，否则为dict
intset
![](https://img.dengwu.wang/blog/202203181551344.png)
hashtable
![](https://img.dengwu.wang/blog/202203181552477.png)
```
127.0.0.1:6379> object encoding set
"intset"
127.0.0.1:6379> SADD set hello
(integer) 1
127.0.0.1:6379> object encoding set
"hashtable"
```
### zset类型
zset当元素较少时会使用ziplist来存储
![](https://img.dengwu.wang/blog/202203181557617.png)
zset当元素较多时使用dict+skiplist来存储
dict保存了数据到分数的映射关系，skiplist用来根据分数查询数据
![](https://img.dengwu.wang/blog/202203181559381.png)

### 总结

* Redis对存储整数友好，可以压缩内存使用且存取效率高
* String不超过44长度性能最优，否则会使用raw带来额外存取操作，使用数字类型效率最高。
* 设置maxmemory，防止rdb时子进程写快照时的内存暴涨，即便停用rdb，使用slave时也会有一次rdb同步，导致内存暴涨，建议一个master不要超过2个slave。
* 设置内存淘汰策略，防止内存不够导致的异常
* 避免大KEY，hashtable结构遍历很耗时，尽量使用scan获取大量数据，而不是getall
