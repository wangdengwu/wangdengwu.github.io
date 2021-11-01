---
title: Docker简介
author: 王登武
date: 2021-11-01 14:52:31
categories: docker
tags:
  - docker
---
## docker简介
docker是一种虚拟化技术，但是和虚拟机又不一样，比较轻量级，最大的好处就是隔离底层硬件和软件的区别，然后让软件跑在统一的环境下，而减少因为底层软硬件环境的问题，导致的软件出错和不一致性。

docker使用容器这一概念来实现，在一台机器上可以运行多个隔离的容器，每个容器内包含运行所需的所有内容，包括操作系统和底层依赖，例如：容器包括centos7的操作系统，并且含有jdk1.8的底层依赖，然后就可以分享容器，其他人只需要获取到容器，就可以直接运行你的代码，而且所有人的环境都是一样的。

我们可以用docker来快速分享开发环境，也可以用于生产环境快速扩容，因为环境都是一致的，并且docker获取和运行容器非常快速。而我主要使用docker来隔离本地环境，不想因为尝试某种技术，而污染本地的开发环境，又可以快速分享这种演示环境。后续如果可以使用docker来分发开发环境，我将使用docker，除非是docker无法支持的环境，如Mac特有的xcode打包等，不过目前看这种极特殊的情况很少发生。

## docker架构
![](https://docs.docker.com/engine/images/architecture.svg)
docker采用的是client-server架构，client（docker）和daemon（dockerd）通讯，client和daemon可以是在同一台机器上，也可以远程访问另外一台机器的daemon，其通讯采用的是rest-api方式。
daemon主要负责监听API请求，并管理镜像，容器，网络，存储等。
client则比较轻量一点，主要负责发送命令，比如docker run等
另外镜像还可以被注册和分享，通过Docker Hub可以找到很多公共镜像，从而达到快速构建容器的目的。

## 镜像
镜像是创建容器所需的指令模板，只读，通常一个镜像可能基于另外一个镜像，做一些自己的增强，比如基于Ubuntu的系统镜像，做一些安装和配置Nginx的指令。我们可以使用Dockerfile来定义这些步骤命令，通过这个文件就可以build出镜像文件，并且分享。
## 容器
容器就是运行镜像的实例，你可以create，start，stop，move，delete镜像，你可以远程链接到该镜像，给它分配存储，甚至创建一个新的镜像基于容器当前的状态。容器彼此之间都是隔离的。

``` bash
docker run -i -t ubuntu /bin/bash
```
当你在命令行敲了上面的代码，执行过程如下：
1. 如果你本地没有Ubuntu的镜像，则向注册中心请求该镜像文件，就像你手动执行了`docker pull ubuntu`一样。
2. 创建新的容器，就像你手动执行`docker container create`一样。
3. 分配可读写文件给容器，作为它的最后一层，这样允许容器被可控的修改，阻止了对于镜像其它可能的修改，即安全又便捷。
4. 创建默认的网络接口，如果你没有自定义的话，将分配本地IP给容器，并且默认具有通过本地机器访问外部网络的能力。
5. 容器启动，并且执行`/bin/bash`,可以和容器进行交互，因为使用了-i和-t的选项。
6. 当你使用exit退出时，容器将停止，但是没有被删除，你还可以start或者remove。

## docker安装
我们安装docker桌面版，因为有图形化界面，可以更直观
安装地址为[docker桌面版](https://docs.docker.com/desktop/),选择自己对应的操作系统，比如Windows还是Mac
具体安装步骤就不详细说明了，Windows需要注意开启主板的虚拟设置，Mac需要选择Intel芯片还是M1芯片的安装文件。
安装完界面如下：![](https://cdn.jsdelivr.net/gh/wangdengwu/imagehosting/20211101164658.png)

后续一些需要分享开发环境的，都将采用docker的镜像分享，以方便快速统一环境。
