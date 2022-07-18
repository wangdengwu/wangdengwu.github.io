---
title: Java ThreadLocal探秘
author: 王登武
date: 2022-03-10 14:03:53
categories:
 - Java
tags:
 - ThreadLocal
---
### 一个ThreadLocal的问题
昨天面试，有被问到ThreadLocal如何跨线程传递数据，被问到知识盲区了，很是尴尬，自己确实没仔细看过ThreadLocal的代码，回来后赶紧抱起源码读了起来，读完之后，对ThreadLocal是即爱又怕，爱它能传递数据，并避免多线程安全问题，怕的是内存泄漏。
### ThreadLocal例子1
这个例子主要是演示，子线程内是获取不到主线程里设置的数据，代码如下：

``` java
@Test
public void testThreadLocal() {
    ThreadLocal<String> threadLocal = new ThreadLocal<>();
    threadLocal.set("Parent");
    new Thread(() -> {
        String s = threadLocal.get();
        assertNull("get from ThreadLocal in child thread should be null", s);
    }).start();
}   
```
这个单元测试很简单，就是测一下主线程里设置一个值，子线程里取肯定是null，也就是取不到。这反而是TheadLocal的主要作用，就是隔离线程。
### TheadLocal例子2
这个例子就是演示如何跨线程获取数据，也就是我被问到的那个问题如何实现

``` java
@Test
public void testInheritableThreadLocal() {
	ThreadLocal<String> threadLocal = new InheritableThreadLocal<>();
	threadLocal.set("Parent");
	new Thread(() -> {
	    String s = threadLocal.get();
	    Assert.assertEquals("get from InheritableThreadLocal in child thread should be equals", "Parent", s);
	}).start();
}
```
代码一样很简单，只需要使用InheritableThreadLocal的实现类即可。
那原理是什么呢？那就要深入浅出源码了。
### 源码解读
先看下ThreadLocal的set方法

``` java
public void set(T value) {
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);
    if (map != null)
        map.set(this, value);
    else
        createMap(t, value);
}
ThreadLocalMap getMap(Thread t) {
        return t.threadLocals;
}
void createMap(Thread t, T firstValue) {
        t.threadLocals = new ThreadLocalMap(this, firstValue);
}
private static final int INITIAL_CAPACITY = 16;
ThreadLocalMap(ThreadLocal<?> firstKey, Object firstValue) {
    table = new Entry[INITIAL_CAPACITY];
    int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
    table[i] = new Entry(firstKey, firstValue);
    size = 1;
    setThreshold(INITIAL_CAPACITY);
}
private final int threadLocalHashCode = nextHashCode();
private static final int HASH_INCREMENT = 0x61c88647;
private static AtomicInteger nextHashCode =
        new AtomicInteger();
private static int nextHashCode() {
    return nextHashCode.getAndAdd(HASH_INCREMENT);
}
```
有2个关键信息

1. 第一次set的时候是直接new ThreadLocalMap初始化放进去的
2. 我们的value是放到ThreadLocalMap里的，而ThreadLocalMap是当前线程的一个属性threadLocals
那关键点就在ThreadLocalMap类上了，看下它的set方法，注意`map.set(this, value);`,这个this是ThreadLocal

``` java
private void set(ThreadLocal<?> key, Object value) {
    Entry[] tab = table;
    int len = tab.length;
    int i = key.threadLocalHashCode & (len-1);

    for (Entry e = tab[i];
         e != null;
         e = tab[i = nextIndex(i, len)]) {
        ThreadLocal<?> k = e.get();

        if (k == key) {
            e.value = value;
            return;
        }

        if (k == null) {
            replaceStaleEntry(key, value, i);
            return;
        }
    }

    tab[i] = new Entry(key, value);
    int sz = ++size;
    if (!cleanSomeSlots(i, sz) && sz >= threshold)
        rehash();
}
```
我去掉了注释，代码略微有点复杂了，但是我们现在只关注主线，就是value到底存到哪了？
首先和table属性有关，它是一个Entry数组，默认初始化的时候是16大小，然后遍历这个数组,找到Entry的key和当前ThreadLocal一致的元素，然后把value放进去，如果没找到就直接new一个放到table数组的i位置。
而i的取值又和ThreadLocal的threadLocalHashCode有关，并且每实例化一个ThreadLocal都会递增。
注意Entry是一个弱引用类型

``` java
static class Entry extends WeakReference<ThreadLocal<?>> {
    /** The value associated with this ThreadLocal. */
    Object value;

    Entry(ThreadLocal<?> k, Object v) {
        super(k);
        value = v;
    }
}
```
这也就解释了普通TheadLocal为什么跨线程获取不到数据，因为数据是在每个线程实例里的，而key又和每个ThreadLocal有关，因为我们可能使用多个ThreadLocal保存多个对象。
###  如何实现父子之间传递
我们看下Thread的init方法

``` java
private void init(ThreadGroup g, Runnable target, String name, long stackSize) {
  init(g, target, name, stackSize, null, true);
}
```
不得不吐槽Java不支持参数命名这个机制，kotlin就很好的支持了这个特性，在调用的时候很清楚的表达了传递的参数是什么含义。
看下例子

``` kotlin
class NameParam {
    fun namedParams(name: String, sex: String, age: Int = 0) {//可以有默认值

    }
}

fun main() {
    NameParam().namedParams("我", "男")//不使用命名参数，按顺序赋值，默认年龄0，可以不传值
    NameParam().namedParams(sex = "male", name = "me", age = 18);//使用命名参数，清晰明了
}
```
嗯，kotlin就是那种，一旦你使用过，就爱上的那种。毕竟是我jetbrains出品,被Google认作亲儿子的语言
好了，回到Java。。。。。。。，我得上图
![](https://img.dengwu.wang/blog/202203101617305.png)
重点代码我都标了，也就是如果想父子线程传递，就需要使用inheritableThreadLocals而不是threadLocals
那我们再看下InheritableThreadLocal类的代码

``` java
public class InheritableThreadLocal<T> extends ThreadLocal<T> {
    protected T childValue(T parentValue) {
        return parentValue;
    }
    
    ThreadLocalMap getMap(Thread t) {
       return t.inheritableThreadLocals;
    }

    void createMap(Thread t, T firstValue) {
        t.inheritableThreadLocals = new ThreadLocalMap(this, firstValue);
    }
}
```
嗯，重写了关键方法createMap和getMap，这下串起来了吧，所以使用InheritableThreadLocal就使用了inheritableThreadLocals，而线程初始化的时候，又会根据inheritableThreadLocals判断是否复制当前线程的inheritableThreadLocals
### 可能的内存泄漏
我们直接上代码

``` java
public class MemoryLeakBean {
    private int index;

    public MemoryLeakBean(int index) {
        this.index = index;
    }

    @Override
    public String toString() {
        return "MemoryLeakBean" + index;
    }
}

public static final String THREAD = "Thread";

@Test
@Ignore
public void testMemoryLeakWithThreadLocal() throws InterruptedException {
    WeakReference<ThreadLocal> threadLocal = new WeakReference<>(new ThreadLocal<MemoryLeakBean>());
    ExecutorService executorService = Executors.newFixedThreadPool(16);
    // now we start 16 thread without remove thread local
    for (int i = 0; i < 16; i++) {
        final int index = i;
        executorService.execute(() -> {
            Thread.currentThread().setName(THREAD + index);
            if (threadLocal.get() != null) {
                threadLocal.get().set(new MemoryLeakBean(index));
            }
            while (true) {
                reflect(threadLocal);
            }
        });
    }
    Executors.newSingleThreadScheduledExecutor().schedule(() -> {
        Runtime.getRuntime().gc();
    }, 5, TimeUnit.SECONDS);
    executorService.awaitTermination(10, TimeUnit.MINUTES);
}

private void reflect(WeakReference<ThreadLocal> threadLocal) {
    Field threadLocalsField = null;
    try {
        threadLocalsField = Thread.class.getDeclaredField("threadLocals");
        threadLocalsField.setAccessible(true);
        Object threadLocals = threadLocalsField.get(Thread.currentThread());
        if (threadLocals == null) {
            return;
        }
        Field table = threadLocals.getClass().getDeclaredField("table");
        table.setAccessible(true);
        Object[] entries = (Object[]) table.get(threadLocals);
        StringBuilder stringBuilder = new StringBuilder();
        for (Object entry : entries) {
            if (entry == null) {
                continue;
            }
            Field value = entry.getClass().getDeclaredField("value");
            value.setAccessible(true);
            stringBuilder.append(value.get(entry));
        }
        System.out.println(Thread.currentThread().getName() + "'s entries values is " + stringBuilder.toString());
        Thread.sleep(new Random().nextInt(10) * 1000);
        if (threadLocal.get() == null) {
            //我们只需要挑一个线程打印一次就行
            if ((THREAD + 1).equals(Thread.currentThread().getName())) {
                System.out.println("after gc threadLocal is null");
            }
        }
    } catch (NoSuchFieldException | InterruptedException | IllegalAccessException e) {
        e.printStackTrace();
    }
}
```
解释一下，首先使用弱引用创建ThreadLocal，然后使用线程池启动16个线程，分别设置MemoryLeakBean，使用自定义的MemoryLeakBean是因为我们需要看下jvm内存的对象个数，而使用String,Long不容易看清楚。
等待5秒开始gc，这样弱引用就会被释放，也就是ThreadLocal对象就没有了，然后我们线程里循环反射获取MemoryLeakBean对象。这个时候如果线程不释放，则MemoryLeakBean对象就一直存在，而线程池是一直存在的。我们看下执行结果

![](https://img.dengwu.wang/blog/202203101643315.png)
可以看到ThreadLocal已经没有了，但是还是能获取到MemoryLeakBean
我们使用jmap看下
![](https://img.dengwu.wang/blog/202203101645895.png)
可以看到确实是有16个MemoryLeakBean对象还在。
### 总结
ThreadLocal虽好，可不要贪杯哦。最后还是要安利一下kotlin