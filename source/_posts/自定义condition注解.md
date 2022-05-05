---
title: 自定义condition注解
author: 王登武
date: 2022-05-05 10:24:50
categories:
  - Java
tags:
  - Spring Boot
---
Spring Boot有很多自定义Condition注解，比较常用的有@ConditionalOnProperty，@ConditionalOnBean，@ConditionalOnClass等,
比如@ConditionalOnProperty就是依赖配置项来初始化一些信息，但是@ConditionalOnProperty使用起来，有一些缺陷，必须要指定到最终配置属性上。
比如我有配置属性a.b.c=1,@ConditionalOnProperty要求必须到a.b.c，但是我只想依赖配置了a.b即可，@ConditionalOnProperty是做不到的，
比如a.b其实是个map，对于a.b下的任意key都可以接受，key的名字是不固定的，可以是任意字符，所以需要判断只要有a.b的前缀即可初始化。
#### 自定义注解

``` java
import org.springframework.context.annotation.Conditional;

import java.lang.annotation.*;

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Conditional(OnPropertiesExistCondition.class)
public @interface ConditionalOnPropertiesExist {
    String[] value() default {};

    String[] name() default {};

    String prefix() default "";
}
```
自定义注解类，然后再引入实现类

``` java
import org.springframework.boot.autoconfigure.condition.ConditionMessage;
import org.springframework.boot.autoconfigure.condition.ConditionOutcome;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.SpringBootCondition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.AnnotationAttributes;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.AbstractEnvironment;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.Assert;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Order(Ordered.HIGHEST_PRECEDENCE + 50)
public class OnPropertiesExistCondition extends SpringBootCondition {

    @Override
    public ConditionOutcome getMatchOutcome(ConditionContext context, AnnotatedTypeMetadata metadata) {
        List<AnnotationAttributes> allAnnotationAttributes = annotationAttributesFromMultiValueMap(
                metadata.getAllAnnotationAttributes(ConditionalOnPropertiesExist.class.getName()));
        List<ConditionMessage> noMatch = new ArrayList<>();
        List<ConditionMessage> match = new ArrayList<>();
        for (AnnotationAttributes annotationAttributes : allAnnotationAttributes) {
            ConditionOutcome outcome = determineOutcome(annotationAttributes, (AbstractEnvironment) context.getEnvironment());
            (outcome.isMatch() ? match : noMatch).add(outcome.getConditionMessage());
        }
        if (!noMatch.isEmpty()) {
            return ConditionOutcome.noMatch(ConditionMessage.of(noMatch));
        }
        return ConditionOutcome.match(ConditionMessage.of(match));
    }

    private List<AnnotationAttributes> annotationAttributesFromMultiValueMap(
            MultiValueMap<String, Object> multiValueMap) {
        List<Map<String, Object>> maps = new ArrayList<>();
        multiValueMap.forEach((key, value) -> {
            for (int i = 0; i < value.size(); i++) {
                Map<String, Object> map;
                if (i < maps.size()) {
                    map = maps.get(i);
                } else {
                    map = new HashMap<>();
                    maps.add(map);
                }
                map.put(key, value.get(i));
            }
        });
        List<AnnotationAttributes> annotationAttributes = new ArrayList<>(maps.size());
        for (Map<String, Object> map : maps) {
            annotationAttributes.add(AnnotationAttributes.fromMap(map));
        }
        return annotationAttributes;
    }

    private ConditionOutcome determineOutcome(AnnotationAttributes annotationAttributes, AbstractEnvironment abstractEnvironment) {
        Spec spec = new Spec(annotationAttributes);
        List<String> nonMatchingProperties = new ArrayList<>();
        spec.collectProperties(abstractEnvironment, nonMatchingProperties);
        if (nonMatchingProperties.isEmpty()) {
            return ConditionOutcome.noMatch(ConditionMessage.forCondition(ConditionalOnProperty.class, spec)
                    .found("different value in property", "different value in properties")
                    .items(ConditionMessage.Style.QUOTE, nonMatchingProperties));
        }
        return ConditionOutcome
                .match(ConditionMessage.forCondition(ConditionalOnProperty.class, spec).because("matched"));
    }

    private static class Spec {

        private final String prefix;

        private final String[] names;

        Spec(AnnotationAttributes annotationAttributes) {
            String prefix = annotationAttributes.getString("prefix").trim();
            if (StringUtils.hasText(prefix) && !prefix.endsWith(".")) {
                prefix = prefix + ".";
            }
            this.prefix = prefix;
            this.names = getNames(annotationAttributes);
        }

        private String[] getNames(Map<String, Object> annotationAttributes) {
            String[] value = (String[]) annotationAttributes.get("value");
            String[] name = (String[]) annotationAttributes.get("name");
            Assert.state(value.length > 0 || name.length > 0,
                    "The name or value attribute of @ConditionalOnProperty must be specified");
            Assert.state(value.length == 0 || name.length == 0,
                    "The name and value attributes of @ConditionalOnProperty are exclusive");
            return (value.length > 0) ? value : name;
        }

        private void collectProperties(AbstractEnvironment abstractEnvironment, List<String> nonMatching) {
            for (String name : this.names) {
                String key = this.prefix + name;
                if (abstractEnvironment.containsProperty(key)) {
                    nonMatching.add(name);
                } else {
                    MutablePropertySources propertySources = abstractEnvironment.getPropertySources();
                    propertySources.stream().forEach(propertySource -> {
                        Object source = propertySource.getSource();
                        if (source instanceof Map) {
                            Map<String, Object> property = (Map) source;
                            property.keySet().forEach(p -> {
                                if (p.startsWith(key)) {
                                    nonMatching.add(name);
                                }
                            });
                        }
                    });
                }
            }
        }

        @Override
        public String toString() {
            StringBuilder result = new StringBuilder();
            result.append("(");
            result.append(this.prefix);
            if (this.names.length == 1) {
                result.append(this.names[0]);
            } else {
                result.append("[");
                result.append(StringUtils.arrayToCommaDelimitedString(this.names));
                result.append("]");
            }
            result.append(")");
            return result.toString();
        }

    }
}
```
核心逻辑在于，通过ConditionContext拿到AbstractEnvironment对象，这个对象里的getPropertySources就是配置文件的集合，
然后通过startWith来做判断，是否有以a.b开头即可。
虽然实现起来比较简单，但是这应该也是常用需求吧，不知道为什么spring boot没有内置这样功能的注解。