---
title: 深入浅出HikariCP数据库连接池
author: 王登武
date: 2021-12-01 15:16:08
categories: Java
tags: 
 - HikariCP
 - 数据库连接池
---


### HikariCP简介
HikariCP数据库连接池是spring boot的默认数据库连接池，看名字我以为是日本人写的，后来才知道是一个常年居住在东京的美国人写的，spring默认把hikari作为数据库连接池的原因也很简单，因为它足够快，代码量少，稳定，虽然功能不及Druid，但是对于监控也有一定的扩展性，简单，快速，稳定是其胜出的原因。目前支持JDK8的最新版本是4.0.3，在GitHub开源，[项目地址](https://github.com/brettwooldridge/HikariCP)

### 不使用数据库连接池
现在由于spring的普及，以及spring boot的集成便利性，无论是使用JPA还是MyBatis，底层ORM已经非常成熟，即便是基于学习也很少有人手动建立数据库连接，并执行SQL了，如果不使用数据库连接池，完全手动连接数据库，并执行SQL应该怎么做呢，让我们回到刀耕火种的时代，再怀旧一下。

``` kotlin
spring.datasource.driverClassName=com.mysql.cj.jdbc.Driver
spring.datasource.url=jdbc:mysql://localhost:3306/mysql
spring.datasource.username=root
spring.datasource.password=123456

interface HikariDao {
    fun useHikari(): String
    fun useJdbc(): String
}
package data.source.hikari.demo.dao

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.ResultSetExtractor
import org.springframework.stereotype.Service
import java.sql.DriverManager

@Service
class HikariDaoImpl(
    @Autowired private val jdbcTemplate: JdbcTemplate,
    @Value("\${spring.datasource.url}") private val jdbcUrl: String,
    @Value("\${spring.datasource.username}") private val userName: String,
    @Value("\${spring.datasource.password}") private val password: String,
) : HikariDao {

    companion object {
        private const val ALIAS = "time"
        private const val SQL = "select now() as $ALIAS"
    }

    override fun useHikari(): String {
        return jdbcTemplate.query(SQL, ResultSetExtractor {
            it.next();
            return@ResultSetExtractor it.getString(ALIAS)
        })!!
    }

    override fun useJdbc(): String {
        val connection = DriverManager.getConnection(jdbcUrl, userName, password)
        connection.use {
            val statement = connection.createStatement()
            statement.use {
                val result = statement.executeQuery(SQL)
                result.use {
                    it.next()
                    return result.getString(ALIAS)
                }
            }
        }
    }
}
```
直接操作jdbc，需要通过DriverManager获取数据库连接，然后通过Statement执行SQL，拿到ResultSet，手动getXXX获取数据并组装成对象，这里使用了kotlin的use来自动close，通过示例可以看到如果手动操作，非常繁琐，需要关心很多和业务无关的操作，而spring jdbc以及ORM框架则把这些繁琐的操作都封装了起来，使我们只需要关注具体的SQL和对象。
这里还有一个小知识点，就是SPI，在JDBC4.0之前，需要使用`Class.forName(driverClassName)`来加载驱动，而JDBC4.0之后只需要厂商在驱动包里配置一下即可
![](https://img.dengwu.wang/blog/20211201182322.png)
原理是通过`val loader = ServiceLoader.load(Driver::class.java)`即可加载到实现。

### 为什么需要数据库连接池
数据库连接是TCP连接，需要经过TCP的三次握手，如果每次访问数据库都需要建立连接，则会导致每次获取数据都需要等待连接，将会大大降低数据获取的响应时间，而数据库连接池则是将数据库连接缓存起来，保持TCP连接不断，在需要的时候，直接从连接池里获取，不需要等待即可执行SQL获取到数据
除了降低响应时间之外，数据库连接池还可以设定数据库连接数量，因为数据库连接是宝贵资源，当某一个服务并发比较高，并且SQL执行比较慢的时候，会导致建立大量的数据库连接，这往往会对数据库造成致命的影响，导致数据库连接占满而不可用，其它正常的服务也将不可用。
另外TCP连接频繁建立断开，由于TCP断开的4次握手，会导致大量的TIME_WAIT状态问题，这也将会影响数据库的性能。
### 数据库连接池原理
在系统初始化的时候，在内存中开辟一片空间，将一定数量的数据库连接作为对象存储在对象池里，并对外提供数据库连接的获取和归还方法。用户访问数据库时，并不是建立一个新的连接，而是从数据库连接池中取出一个已有的空闲连接对象；使用完毕归还后的连接也不会马上被关闭，而是由数据库连接池统一管理回收，为下一次借用做好准备。如果由于高并发请求导致数据库连接池中的连接被借用完毕，其他线程就会等待，直到有连接被归还。整个过程中，连接并不会被关闭，而是源源不断地循环使用，有借有还。数据库连接池还可以通过设置其参数来控制连接池中的初始连接数、连接的上下限数，以及每个连接的最大使用次数、最大空闲时间等，也可以通过其自身的管理机制来监视数据库连接的数量、使用情况等。
### 数据库连接池组成
![](https://img.dengwu.wang/blog/数据库连接池.jpg)
### 配置项
由于spring boot 2.x开始数据库连接池已经默认是HikariCP了，所以我们只需要进行配置即可，那都有哪些配置项需要配置呢，又有哪些需要注意的地方呢？
#### 默认是怎么生效的
我们先来看下，spring boot 2.6.1是怎么默认使用HikariCP为数据库连接池的。

``` xml
<dependency>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-starter-jdbc</artifactId>
</dependency>
```
只要在pom.xml引入starter-jdbc，则默认就引入了HikariCP数据库连接池，我们看下spring-boot-starter-jdbc的pom.xml

``` xml
<dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter</artifactId>
      <version>2.6.1</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>com.zaxxer</groupId>
      <artifactId>HikariCP</artifactId>
      <version>4.0.3</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-jdbc</artifactId>
      <version>5.3.13</version>
      <scope>compile</scope>
    </dependency>
</dependencies>
```	
可以看到jdbc依赖了HikariCP，并且版本是4.0.3最新版本。了解spring boot starter机制的应该知道，除了pom依赖，还需要有autoconfig
![](https://img.dengwu.wang/blog/20211202154126.png)

``` java
@Configuration(proxyBeanMethods = false)
	@ConditionalOnClass(HikariDataSource.class)
	@ConditionalOnMissingBean(DataSource.class)
	@ConditionalOnProperty(name = "spring.datasource.type", havingValue = "com.zaxxer.hikari.HikariDataSource",
			matchIfMissing = true)
	static class Hikari {

		@Bean
		@ConfigurationProperties(prefix = "spring.datasource.hikari")
		HikariDataSource dataSource(DataSourceProperties properties) {
			HikariDataSource dataSource = createDataSource(properties, HikariDataSource.class);
			if (StringUtils.hasText(properties.getName())) {
				dataSource.setPoolName(properties.getName());
			}
			return dataSource;
		}
}
```
这样就默认初始化了HikariDataSource。
让我们再接着看下配置项。除了配置数据库必填的4个之外，常用配置还有另外几个。

```
spring.datasource.driverClassName=com.mysql.cj.jdbc.Driver
spring.datasource.url=jdbc:mysql://localhost:3306/mysql
spring.datasource.username=root
spring.datasource.password=123456
#默认true
spring.datasource.hikari.autoCommit=true
#等待超时时间，默认30秒
spring.datasource.hikari.connectionTimeOut=30000
#最长多久空闲即释放，默认10分钟
spring.datasource.hikari.idleTimeout=600000
#连接最长存活时间毫秒，默认30分钟
spring.datasource.hikari.maxLifetime=1800000
#最大连接池数量，默认10
spring.datasource.hikari.maximumPoolSize=10
#默认和max相同
spring.datasource.hikari.minimumIdle=10
#连接池名称，如果多个微服务，建议配置不同名字
spring.datasource.hikari.poolName=hikari
#开启JMX
spring.datasource.hikari.registerMbeans=true

#监控相关
#spring.datasource.hikari.metricRegistry=
#健康信息
#spring.datasource.hikari.healthCheckRegistry=
```
#### 配置项注意点
大部分应用使用默认值即可很好的工作，需要注意的是连接池数量不是越多越好，而是如何尽量少越好。
我们先验证一下超时时间是否生效，为了方便测试，我们打开JMX以及将minimumIdle和maximumPoolSize改为1，然后执行慢查询，占用唯一的链接，再执行正常查询，等待，看看是否30秒会超时。

``` kotlin
@RestController
class HikariController(@Autowired private val hikariDao: HikariDao) {

    @GetMapping("/hikari")
    public fun hikari(): String {
        return hikariDao.useHikari()
    }

    @GetMapping("/slow")
    public fun slow(): Int {
        return hikariDao.slowSql()
    }
}

interface HikariDao {
    fun useHikari(): String
    fun useJdbc(): String
    fun slowSql(): Int
}

@Service
class HikariDaoImpl(
    @Autowired private val jdbcTemplate: JdbcTemplate,
    @Value("\${spring.datasource.url}") private val jdbcUrl: String,
    @Value("\${spring.datasource.username}") private val userName: String,
    @Value("\${spring.datasource.password}") private val password: String,
) : HikariDao {

    companion object {
        private const val TIME = "time"
        private const val COUNT = "personCount"
        private const val SQL = "select now() as $TIME"
        private const val SLOW_SQL = "select count(id) as $COUNT from hikari_person"
    }

    override fun useHikari(): String {
        return jdbcTemplate.query(SQL, ResultSetExtractor {
            it.next();
            return@ResultSetExtractor it.getString(TIME)
        })!!
    }

    override fun useJdbc(): String {
        val connection = DriverManager.getConnection(jdbcUrl, userName, password)
        connection.use {
            val statement = connection.createStatement()
            statement.use {
                val result = statement.executeQuery(SQL)
                result.use {
                    it.next()
                    return result.getString(TIME)
                }
            }
        }
    }

    override fun slowSql(): Int {
        return jdbcTemplate.query(SLOW_SQL, ResultSetExtractor {
            it.next();
            return@ResultSetExtractor it.getInt(COUNT)
        })!!
    }
}
```
因为连接池是懒加载的，我们先访问一下/slow,验证一下不加表锁的情况下可以正常执行并初始化连接池。
再通过jconsole看下连接池的情况。
![](https://img.dengwu.wang/blog/20211206151609.png)
可以看到空闲连接1个，现在，我们把hikari_person表加上写锁，来模拟慢查询。
`LOCK TABLES hikari_person WRITE;`  再访问/slow,直接卡住没有返回。
![](https://img.dengwu.wang/blog/20211206152032.png)
可以看到活跃连接1个，已经没有空闲的了，这个时候我们访问/hikari
![](https://img.dengwu.wang/blog/20211206152151.png)
变成了1个活跃，1个等待，并且30秒报了超时异常。
![](https://img.dengwu.wang/blog/20211206152344.png)
可以看到，确实配置可以生效，当连接池已满，再有请求就会被阻塞等待，然后超时。
记得执行`UNLOCK TABLES;`释放表锁。释放完后，原来等待返回的/slow直接返回了结果0。
### 数据源的初始化
之前已经看到spring boot启动的时候，会初始化HikariDataSource，关键代码

``` java
@Bean
@ConfigurationProperties(prefix = "spring.datasource.hikari")
HikariDataSource dataSource(DataSourceProperties properties) {
	HikariDataSource dataSource = createDataSource(properties, HikariDataSource.class);
	if (StringUtils.hasText(properties.getName())) {
		dataSource.setPoolName(properties.getName());
	}
	return dataSource;
}
```
再看一下HikariDataSource的类图
![](https://img.dengwu.wang/blog/20211206165729.png)

由于HikariDataSource继承自HikariConfig，并且`@ConfigurationProperties(prefix = "spring.datasource.hikari")`所以我们在application.properties里配置的属性，就初始化到了DataSource里。
### HikariDataSource的获取连接
``` java
@Override
public Connection getConnection() throws SQLException
{
  if (isClosed()) {
     throw new SQLException("HikariDataSource " + this + " has been closed.");
  }

  if (fastPathPool != null) {
     return fastPathPool.getConnection();
  }

  // See http://en.wikipedia.org/wiki/Double-checked_locking#Usage_in_Java
  HikariPool result = pool;
  if (result == null) {
     synchronized (this) {
        result = pool;
        if (result == null) {
           validate();
           LOGGER.info("{} - Starting...", getPoolName());
           try {
              pool = result = new HikariPool(this);
              this.seal();
           }
           catch (PoolInitializationException pie) {
              if (pie.getCause() instanceof SQLException) {
                 throw (SQLException) pie.getCause();
              }
              else {
                 throw pie;
              }
           }
           LOGGER.info("{} - Start completed.", getPoolName());
        }
     }
  }
  return result.getConnection();
}
```
HikariDataSource的getConnection方法，有个额外知识点，就是单例模式，HikariPool是单例的，使用了双重检测锁来完成单例操作。
获取连接之前，需要先进行连接池的初始化new HikariPool(this)。
### 连接池的初始化
![](https://img.dengwu.wang/blog/初始化连接池.jpg)

connectionBag是连接池的并发数据结构，做了并发优化，后面再详细说明。
houseKeeper是保持连接池数量的线程池，核心数量为1，使用了ScheduledThreadPoolExecutor，默认30秒运行一次。
监控后面再单独介绍。
启用JMX之后，HikariConfigMXBean和HikariPoolMXBean将会展示到Mbean。
创建物理Connection使用了addConnectionExecutor，使用LinkedBlockingQueue，队列数量为配置的最大连接数，核心和最大线程都为1，使用了抛弃旧线程的策略。
关闭物理Connection使用了closeConnectionExecutor，使用LinkedBlockingQueue，队列数量为配置的最大连接数，核心和最大也为1，使用了直接在主线程运行的策略。
leakTaskFactory用于检测是否有连接泄漏，getConnection之后要及时close掉，如果没有及时close则会有泄漏。通过getConnection时延迟执行ProxyLeakTask，延迟最小值2秒，低于此值则默认不进行连接泄漏检测，如果在该时间内没有及时close，则该延迟任务将会执行，而在close方法里，对该任务进行了cancel，及时close就不会触发ProxyLeakTask。默认是0不执行连接泄漏检测，可以通过spring.datasource.hikari.leakDetectionThreshold=3000设置来启用。
到此连接池就初始化完了。
### 获取连接
![](https://img.dengwu.wang/blog/获取连接.jpg)
核心代码

``` java
public Connection getConnection(final long hardTimeout) throws SQLException
   {
      suspendResumeLock.acquire();
      final long startTime = currentTime();

      try {
         long timeout = hardTimeout;
         do {
            PoolEntry poolEntry = connectionBag.borrow(timeout, MILLISECONDS);
            if (poolEntry == null) {
               break; // We timed out... break and throw exception
            }

            final long now = currentTime();
            if (poolEntry.isMarkedEvicted() || (elapsedMillis(poolEntry.lastAccessed, now) > aliveBypassWindowMs && !isConnectionAlive(poolEntry.connection))) {
               closeConnection(poolEntry, poolEntry.isMarkedEvicted() ? EVICTED_CONNECTION_MESSAGE : DEAD_CONNECTION_MESSAGE);
               timeout = hardTimeout - elapsedMillis(startTime);
            }
            else {
               metricsTracker.recordBorrowStats(poolEntry, startTime);
               return poolEntry.createProxyConnection(leakTaskFactory.schedule(poolEntry), now);
            }
         } while (timeout > 0L);

         metricsTracker.recordBorrowTimeoutStats(startTime);
         throw createTimeoutException(startTime);
      }
      catch (InterruptedException e) {
         Thread.currentThread().interrupt();
         throw new SQLException(poolName + " - Interrupted during connection acquisition", e);
      }
      finally {
         suspendResumeLock.release();
      }
}
```
外部spring等访问的getConnection最终是访问了HikariPool的getConnection。
代码核心就是使用了并发数据结构ConnectionBag,ConnectionBag作用就是类似对象池，存储了数据库连接。
使用borrow方法，如果有可用的链接，即可获取到包装对象PoolEntry。
这里还有一个逻辑就是如果获取到的链接已经标记为关闭，或者存活时间超时，或者已经不可用，则

``` java
void closeConnection(final PoolEntry poolEntry, final String closureReason)
   {
      if (connectionBag.remove(poolEntry)) {
         final Connection connection = poolEntry.close();
         closeConnectionExecutor.execute(() -> {
            quietlyCloseConnection(connection, closureReason);
            if (poolState == POOL_NORMAL) {
               fillPool();
            }
         });
     }
}
```
从ConnectionBag移除，使用closeConnectionExecutor关闭链接，并补充数量。
所以getConnection里使用了do while来borrow获取一个链接。
`return poolEntry.createProxyConnection(leakTaskFactory.schedule(poolEntry), now);`
这块代码就是创建leakTask检测链接泄漏的同时，创建ProxyConnection返回。
### 归还连接
![](https://img.dengwu.wang/blog/202112081615450.jpg)
由于之前获取的连接并不是真正JDBC的Connect驱动实现，而是代理实现，所以调用对应的close方法只是归还连接，而不是真正关闭物理连接，这样就实现了借用连接池的链接，在close的时候归还连接，以便后续使用。
我们通过打断点，也可以看到对应的对象都是代理过的对象。
![](https://img.dengwu.wang/blog/20211208154917.png)
### 静态代理
由于需要对原生JDBC对象进行增强，所以HikariCP采用了代理技术，但是考虑性能问题，其没有使用JDK的动态代理，而是使用了字节码增强的伪动态代理，因为其字节码增强是在编译的时候增强的，使用了javassist来做字节码增强。
涉及到的类有，ProxyFactory，JavassistProxyFactory以及抽象类：ProxyCallableStatement，ProxyConnection，ProxyDatabaseMetaData，ProxyPreparedStatement，ProxyResultSet，ProxyStatement。
在JavassistProxyFactory里使用javassist字节码增强实现了HikariProxyConnection，HikariProxyPreparedStatement等具体类，其继承自上述抽象类，对于没有实现的方法，采用了代理调用方式自动生成方法实现。
既然ProxyConnection等抽象类都已经有具体代理实现方法了，为什么还要字节码增强来生成非抽象子类呢？何况你还是静态生成？
原因是因为，ProxyConnection等抽象类之所以设计成抽象类，就是因为不想实现自己不关心的接口，举个栗子，光Connection接口就几十个方法，需要代理的也就十几个方法，如果不以抽象类的方式，则需要全部实现这几十个方法，并且自己不关心的实现都只是简单调用驱动实现类的方法，可读性和维护性不高。如果是动态运行时字节码增强，无可厚非，但是编译期增强的话，根本原因，其实还是作者懒，宁愿字节码自动生成也不愿意代码实现，不过javassist本身也不支持动态运行时字节码替换。javassist类库本身很简单，封装了字节码的操作，很容易就上手，感兴趣的可以自己试试写个例子就会用了。
### 动态代理
我们来写个动态代理的例子，实现对sql的日志打印，实现动态代理的方法很多，我们今天使用bytekit来实现。bytekit是arthas的底层字节码增强类库，通过注解的方式，很方便进行字节码增强，不止用来实现代理，还可以用于APM，功能很强大。
我们对Hikari的ProxyStatement的executeQuery方法进行字节码增强，来实现控制台打印其参数SQL的功能。
ProxyStatement的executeQuery实现如下：

``` java
@Override
public ResultSet executeQuery(String sql) throws SQLException
{
  connection.markCommitStateDirty();
  ResultSet resultSet = delegate.executeQuery(sql);
  return ProxyFactory.getProxyResultSet(connection, this, resultSet);
}
```
我们首先引入bytekit的pom依赖

``` xml
<dependency>
	<groupId>com.alibaba</groupId>
	<artifactId>bytekit-core</artifactId>
	<version>0.0.7</version>
</dependency>
<dependency>
	<groupId>net.bytebuddy</groupId>
	<artifactId>byte-buddy-agent</artifactId>
	<version>1.12.3</version>
</dependency>
<dependency>
	<groupId>org.benf</groupId>
	<artifactId>cfr</artifactId>
	<version>0.151</version>
</dependency>
```
写一个辅助类

``` kotlin
class ProxyUtil {
    companion object {

        public fun enhanceClass(
            targetClass: KClass<ProxyStatement>,
            targetMethodName: String,
            proxyClass: KClass<SqlLogInterceptor>
        ) {
            AgentUtils.install()
            val interceptorClassParser = DefaultInterceptorClassParser()
            val parseList = interceptorClassParser.parse(proxyClass.java)
            val loadClass = AsmUtils.loadClass(targetClass.java)
            loadClass.methods.filter {
                return@filter it.name.equals(targetMethodName)
            }.onEach { methodNode ->
                val methodProcessor = MethodProcessor(loadClass, methodNode)
                parseList.onEach { parse ->
                    parse.process(methodProcessor)
                }
            }
            val bytes = AsmUtils.toBytes(loadClass)
            println("decompile:${Decompiler.decompile(bytes)}")
            AgentUtils.reTransform(targetClass.java, bytes)
        }
    }
}
```
编写实际增强代码

``` java
public class SqlLogInterceptor {
    @AtEnter(inline = true)
    public static void atEnter(@Binding.Args Object[] args, @Binding.Field(name = "isClosed") boolean isClosed) {
        System.out.println("isClosed = " + isClosed);
        System.out.println("sql = " + args[0]);
    }
}
```
ProxyStatement有一个私有属性isClosed，我们都可以拿到并使用。inline代表混入到源字节码里。我们看看反编译后的样子。

``` java
@Override
public ResultSet executeQuery(String string) throws SQLException {
    void sql;
    boolean bl = this.isClosed;
    Object[] objectArray = new Object[]{string};
    System.out.println("isClosed = " + bl);
    System.out.println("sql = " + objectArray[0]);
    this.connection.markCommitStateDirty();
    ResultSet resultSet = this.delegate.executeQuery((String)sql);
    return ProxyFactory.getProxyResultSet(this.connection, this, resultSet);
}
```
反编译后虽然不太正常，但是真实增强代码确实已经添加进去了，我们执行一下看看。
![](https://img.dengwu.wang/blog/202112091150526.png)
确实打印了出来。
### Hikari为什么这么快
因为Hikari代码比较精简，并且在细节上下了很大功夫，除了使用静态字节码增强来优化性能之前，其在并发性能上也下了功夫，具体就是对并发数据结构的创建和使用。
#### ConnectionBag
ConnectionBag可以说是hikari的核心，所有连接的创建，获取，归还，释放等等都和其息息相关，先来看下类结构。
![](https://img.dengwu.wang/blog/202112091846818.png)
最核心的几个方法是add,borrow,requite,remove。ConnectionBag内部使用了ThreadLocal和SynchronousQueue，CopyOnWriteArrayList以及waiters:AtomicInteger来保证并发安全以及快速获取连接。
#### borrow

``` java
public T borrow(long timeout, final TimeUnit timeUnit) throws InterruptedException
{
   // Try the thread-local list first
   final List<Object> list = threadList.get();
   for (int i = list.size() - 1; i >= 0; i--) {
      final Object entry = list.remove(i);
      @SuppressWarnings("unchecked")
      final T bagEntry = weakThreadLocals ? ((WeakReference<T>) entry).get() : (T) entry;
      if (bagEntry != null && bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
         return bagEntry;
      }
   }

   // Otherwise, scan the shared list ... then poll the handoff queue
   final int waiting = waiters.incrementAndGet();
   try {
      for (T bagEntry : sharedList) {
         if (bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
            // If we may have stolen another waiter's connection, request another bag add.
            if (waiting > 1) {
               listener.addBagItem(waiting - 1);
            }
            return bagEntry;
         }
      }

      listener.addBagItem(waiting);

      timeout = timeUnit.toNanos(timeout);
      do {
         final long start = currentTime();
         final T bagEntry = handoffQueue.poll(timeout, NANOSECONDS);
         if (bagEntry == null || bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
            return bagEntry;
         }

         timeout -= elapsedNanos(start);
      } while (timeout > 10_000);

      return null;
   }
   finally {
      waiters.decrementAndGet();
   }
}
```
先看下borrow方法，首先在ThreadLocal里获取可用连接，如果没有，则在sharedList里获取，sharedList是CopyOnWriteArrayList并发集合类，如果还没有，就触发添加连接的请求，然后阻塞到handoffQueue: SynchronousQueue上，直到超时。
ThreadLocal默认是一个简化过的List，FastList，其实现去掉了越界检查，只实现了自己用到的方法，并且remove(Object object)方法是倒序查找。
#### requite

``` java
public void requite(final T bagEntry)
{
  bagEntry.setState(STATE_NOT_IN_USE);

  for (int i = 0; waiters.get() > 0; i++) {
     if (bagEntry.getState() != STATE_NOT_IN_USE || handoffQueue.offer(bagEntry)) {
        return;
     }
     else if ((i & 0xff) == 0xff) {
        parkNanos(MICROSECONDS.toNanos(10));
     }
     else {
        Thread.yield();
     }
  }

  final List<Object> threadLocalList = threadList.get();
  if (threadLocalList.size() < 50) {
     threadLocalList.add(weakThreadLocals ? new WeakReference<>(bagEntry) : bagEntry);
  }
}
```
归还方法比较简单，如果有线程等待，则直接归还到handoffQueue上，快速转让，并寄存到threadLocal里，方便下次获取。
#### add

``` java
public void add(final T bagEntry)
{
  if (closed) {
     LOGGER.info("ConcurrentBag has been closed, ignoring add()");
     throw new IllegalStateException("ConcurrentBag has been closed, ignoring add()");
  }

  sharedList.add(bagEntry);

  // spin until a thread takes it or none are waiting
  while (waiters.get() > 0 && bagEntry.getState() == STATE_NOT_IN_USE && !handoffQueue.offer(bagEntry)) {
     Thread.yield();
  }
}
```
add方法不对外暴露，在checkFailFast和fillPool被调用。
#### remove

``` java
public boolean remove(final T bagEntry)
{
  if (!bagEntry.compareAndSet(STATE_IN_USE, STATE_REMOVED) && !bagEntry.compareAndSet(STATE_RESERVED, STATE_REMOVED) && !closed) {
     LOGGER.warn("Attempt to remove an object from the bag that was not borrowed or reserved: {}", bagEntry);
     return false;
  }

  final boolean removed = sharedList.remove(bagEntry);
  if (!removed && !closed) {
     LOGGER.warn("Attempt to remove an object from the bag that does not exist: {}", bagEntry);
  }

  threadList.get().remove(bagEntry);

  return removed;
}
```
另外一个比较重要的类就是PoolEntry，封装了Connection以及Connection对应的Statement和对应的使用状态等，这里存储Statement也是使用的FastList。ConcurrentBag里存储的就是PoolEntry对象。
### 监控
说实话，hikari的监控做的不是很好，比如说对数据库查询异常日志的记录，对慢查询SQL的记录等等都没有，这也恰恰是其之所以比较快的原因，做好数据库连接池的功能，不把乱七八糟的东西引进来，但是并不是其一点监控数据都没有，可以借助spring的actuator功能，监控一些连接池自身的数据。
只需要在pom里添加对应的依赖

``` xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
 <dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
    <version>1.8.1</version>
</dependency>
```
启动项目，通过http://localhost:8080/actuator/ 访问
![](https://img.dengwu.wang/blog/202112091918834.png)
![](https://img.dengwu.wang/blog/202112091918768.png)
通过集成Prometheus以及Grafana则可以收集并图形化展示监控数据，这里就不做过多介绍了。
### 总结
hikari虽然代码比较少，但是麻雀虽小五脏俱全，涉及到很多知识点
1. 单例模式
2. JMX
3. 字节码增强，代理模式
4. 并发数据结构
5. 监控集成

希望大家能从本文能收获一些东西，再见。

