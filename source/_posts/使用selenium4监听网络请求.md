---
title: 使用selenium4监听网络请求
date: 2021-10-26 18:17:22
author: 王登武
categories: 测试
tags:
  - selenium
  - UI自动化
---
### selenium4支持devTools
以往selenium更多的是用来作为UI自动化工具，因为其可以编程获取页面元素，并交互，而爬取数据往往因为页面元素的展示，和实际网络请求并不一致导致只是通过页面无法获取到精确数据。
现在selenium4则提供了devTools交互，Chrome等浏览器自身携带了devTools，以方便开发者调试页面，比较常用的就是查看页面元素，以及查看对应的网络请求数据。
浏览器自带的devTools如下所示

![](https://img.dengwu.wang/blog/16352486276926.jpg)

### selenium环境搭建
我们以Chrome为例搭建selenium环境
首先需要确定我们的Chrome浏览器的版本，如果你没有安装，则需要先安装Chrome浏览器，比如现在最新的Chrome浏览器版本为94.0.4606.81
另外下载对应版本的chromedriver,[下载地址(taobao镜像)](http://npm.taobao.org/mirrors/chromedriver/) 选择和Chrome版本一致的文件夹，并下载和自己操作系统一致的文件。
下载完成后，需要把chromedriver放到系统可执行路径下，比如Linux或Mac可以放到/usr/local/bin/ 
然后通过命令行启动Chrome，对于Windows可以在桌面Chrome应用的快捷方式添加启动参数。启动命令如下

``` bash
./Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/Users/xxxx/chrome2"
```
其中最主要的2个参数是--remote-debugging-port和--user-data-dir
### 程序调用
当我们启动好Chrome之后，就可以通过代码的方式来进行交互了。
这里我使用Java语言来展示关键代码，对应pom里需要使用最新的selenium依赖

``` java
<dependency>
    <groupId>org.seleniumhq.selenium</groupId>
    <artifactId>selenium-java</artifactId>
    <version>4.0.0</version>
</dependency>
```

#### 配置启动参数

``` java
ChromeOptions chromeOptions = new ChromeOptions();
chromeOptions.setExperimentalOption("debuggerAddress", "127.0.0.1:9222");
WebDriver driver = new ChromeDriver(chromeOptions);
driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(5));
this.driver = driver;
this.devTools = ((ChromeDriver) driver).getDevTools();
devTools.createSession();
devTools.send(Network.enable(Optional.empty(), Optional.empty(), Optional.empty()));
```
这里初始化driver的时候，参数里的port一定要和启动Chrome时配置的port对应上。
而devTools则可以通过ChromeDriver直接获取到，devTools有很多api，而我们只演示监听网络数据的功能。

``` java
 devTools.addListener(Network.responseReceived(),responseReceived -> {
            RequestId requestId = responseReceived.getRequestId();
            Network.GetResponseBodyResponse response = devTools.send(Network.getResponseBody(requestId));
            String body = response.getBody();
 });
```
devTools是通过事件监听来获取网络数据的，具体监听事件有很多，比如responseReceived，requestWillBeSent，dataReceived等等。
需要注意的有几点：
1. 获取response的时候，记得try catch，以防止有的请求并没有body导致的异常。
2. responseReceived事件触发时，这个时候获取response未必能取到，因为只是响应返回了，但是body可能比较大，数据可能还没有接收完。
3. dataReceived事件触发时，大概率是可以获取到返回的body的，但是保险起见，可以sleep500毫秒。
4. 如果有一些请求，请求的URL都一样，只是参数不同，而我们只关心特定参数的request返回的response，则可以订阅requestWillBeSent事件，确认该请求是需要的，则把RequestId扔到队列里，在dataReceived的时候从队列里取出RequestId来获取返回数据。
5. requestWillBeSent的RequestId和dataReceived的RequestId内容是一样的。

除了通过devTools监听数据外，还可以做很多其它的事情，比如修改请求HEAD，修改Cookie，具体API可以去[官网](https://www.selenium.dev/documentation/webdriver/bidi_apis/)查询。

当然有了driver一样可以像以前一样，访问URL，获取页面元素，交互。比如如下代码

``` java
driver.get(login);
driver.findElement(By.xpath("//*[@id=\"root\"]/div/section/header/div[1]/div/div/div/div[2]/span")).click();
driver.findElement(By.className("semi-button-content")).click();
```
有了devTools监听网络数据，更方便爬取一些数据，尤其是需要授权登录的情况，我们可以事先登录或者远程登录的方式，来获取一些我们想要的数据。
以上就是对selenium4新功能devTools的介绍。