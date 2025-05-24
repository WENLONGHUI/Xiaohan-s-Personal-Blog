---
title: shardingsphere分库分表
description: 《使用shardingsphere进行分库分表》
mathjax: true
tags:
  - shardingsphere
categories:
  - 大麦项目
abbrlink: 2013458d
sticky: 10
swiper_index: 1
date: 2025-05-15 11:44:47
---

# 1.背景

## **为什么分表**

数据量不大的时候以及用上索引问题都不是很大，但一旦表中的数据量很大的话，假如是一亿数据量，就算用上索引效率也不是很高，原因是 `InnoDB` 存储引擎，聚簇索引结构的 B+树的层级变高，磁盘 IO 变多查询性能变慢。

# 2.垂直拆分

## 垂直分库

在开始规模比较小的单体项目来说，所有的业务都是放在同一个数据库中，比如产品、订单、用户、支付都是在同一个库中，但随着项目越来越庞大，数据量也越来越大，就需要按照不同的业务来拆分成多个库。

![](/vika-proxy/space/2025/05/15/73ea7d5b341f4b6bba18ffc48967085a)

## 垂直分表

垂直分表适用于字段非常多的表，对于很多的查询来说，其实不需要一次将所有的字段全都查询出来，这样很浪费性能，影响效率，那么就将经常查询的字段单独拆分出一个表，将另外的字段单独拆分成另一个表，拆分后的表通过某个字段关联起来，这样既可以减少表的容量大小，又可以提升查询效率。

![](/vika-proxy/space/2025/05/15/f5b83ce981a2472c89fdcf85aabc65f5)

# 3.水平拆分

垂直拆分其实还是根据业务进行模块话拆分的，当单表的容量越来越大的时候，还是不能解决单表的读写、存储的性能瓶颈，这是就需要水平拆分了。

## 水平分库

水平分库是把同一个表按一定规则拆分到不同的数据库中，每个库可以位于不同的服务器上，每个数据库的库和表结构都是相同的，只有表中的数据不同。可以实现水平扩展，有效缓解单裤的性能瓶颈。

![](/vika-proxy/space/2025/05/15/d01e45ee127b4cc18dc3196d7ef8833b)

## 水平分表

水平分表是在同一个数据库内，对大表进行水平拆分，分割成多个表结构相同的表。

![](/vika-proxy/space/2025/05/15/6d04755aae514d1b909cb43c36c21d09)

# 4.shardingsphere核心概念

![](/vika-proxy/space/2025/05/15/207724edba014305867ce3271528f2ed)



## 表

表是透明化数据分片的关键概念。 Apache ShardingSphere 通过提供多样化的表类型，适配不同场景下的数据分片需求。

### 逻辑表

相同结构的水平拆分数据库（表）的逻辑名称，是 SQL 中表的逻辑标识。 例：订单数据根据主键尾数拆分为 10 张表，分别是 `Course_0` 到 `Course_9`，他们的逻辑表名为 `Course`。

### 真实表

在水平拆分的数据库中真实存在的物理表。 即上个示例中的 `Course_0` 到 `Course_9`。

### 绑定表

指分片规则一致的一组分片表。 使用绑定表进行多表关联查询时，必须使用分片键进行关联，否则会出现笛卡尔积关联或跨库关联，从而影响查询效率。 例如：`t_order` 表和 `t_order_item` 表，均按照 `order_id` 分片，并且使用 `order_id` 进行关联，则此两张表互为绑定表关系。 绑定表之间的多表关联查询不会出现笛卡尔积关联，关联查询效率将大大提升。 举例说明，如果 SQL 为：

```sql
SELECT i.* FROM t_order o JOIN t_order_item i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);
```

在不配置绑定表关系时，假设分片键 order_id 将数值 10 路由至第 0 片，将数值 11 路由至第 1 片，那么路由后的 SQL 应该为 4 条，它们呈现为笛卡尔积：

```sql
SELECT i.* FROM t_order_0 o JOIN t_order_item_0 i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);

SELECT i.* FROM t_order_0 o JOIN t_order_item_1 i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);

SELECT i.* FROM t_order_1 o JOIN t_order_item_0 i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);

SELECT i.* FROM t_order_1 o JOIN t_order_item_1 i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);

```

在配置绑定表关系，并且使用 `order_id` 进行关联后，路由的 SQL 应该为 2 条：

```sql
SELECT i.* FROM t_order_0 o JOIN t_order_item_0 i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);

SELECT i.* FROM t_order_1 o JOIN t_order_item_1 i ON o.order_id=i.order_id WHERE o.order_id in (10, 11);

```

其中 `t_order` 表由于指定了分片条件，ShardingSphere 将会以它作为整个绑定表的主表。 所有路由计算将会只使用主表的策略，那么 `t_order_item` 表的分片计算将会使用 `t_order` 的条件。

### 广播表

指所有的分片数据源中都存在的表，表结构及其数据在每个数据库中均完全一致。 适用于数据量不大且需要与海量数据的表进行关联查询的场景，例如：字典表。（每个真实库都有）

### 单表

指所有的分片数据源中仅唯一存在的表。 适用于数据量不大且无需分片的表。（只有一个真实库有）

## 分片

### 分片键

用于将数据库（表）水平拆分的数据库字段。 例：将订单表中的订单主键的尾数取模分片，则订单主键为分片字段。 SQL 中如果无分片字段，将执行全路由，性能较差。 除了对单分片字段的支持，Apache ShardingSphere 也支持根据多个字段进行分片。

### 分片算法

用于将数据分片的算法，支持 `=`、`>=`、`<=`、`>`、`<`、`BETWEEN` 和 `IN` 进行分片。 分片算法可由开发者自行实现，也可使用 Apache ShardingSphere 内置的分片算法语法糖，灵活度非常高。

### [自动化分片算法](https://shardingsphere.apache.org/document/5.3.2/cn/dev-manual/sharding/)

分片算法语法糖，用于便捷的托管所有数据节点，使用者无需关注真实表的物理分布。 包括取模、哈希、范围、时间等常用分片算法的实现。

### 自定义分片算法

提供接口让应用开发者自行实现与业务实现紧密相关的分片算法，并允许使用者自行管理真实表的物理分布。 自定义分片算法又分为：

- 标准分片算法

用于处理使用单一键作为分片键的 `=`、`IN`、`BETWEEN AND`、`>`、`<`、`>=`、`<=` 进行分片的场景。

- 复合分片算法

用于处理使用多键作为分片键进行分片的场景，包含多个分片键的逻辑较复杂，需要应用开发者自行处理其中的复杂度。

- Hint 分片算法

用于处理使用 `Hint` 行分片的场景

# 5.用户分库分表策略

## 配置

### 引入 ShardingSphere 的相关依赖

```xml
<properties>
	<shardingsphere.version>5.3.2</shardingsphere.version>
</properties>
<dependency>
    <groupId>org.apache.shardingsphere</groupId>
    <artifactId>shardingsphere-jdbc-core</artifactId>
    <version>${shardingsphere.version}</version>
    <exclusions>
        <exclusion>
            <artifactId>logback-classic</artifactId>
            <groupId>ch.qos.logback</groupId>
        </exclusion>
    </exclusions>
</dependency>
```

用户配置文件（yml）配置：

```yml
spring:
  datasource:
    driver-class-name: org.apache.shardingsphere.driver.ShardingSphereDriver
    url: jdbc:shardingsphere:classpath:shardingsphere-user.yaml
```

### shardingsphere-user.yaml配置：

```yaml
dataSources:
  # 第一个用户库
  ds_0:
    dataSourceClassName: com.zaxxer.hikari.HikariDataSource
    driverClassName: com.mysql.cj.jdbc.Driver
    jdbcUrl: jdbc:mysql://127.0.0.1:3306/damai_user_0?useUnicode=true&characterEncoding=UTF-8&rewriteBatchedStatements=true&allowMultiQueries=true&serverTimezone=Asia/Shanghai
    username: xxx
    password: xxx
  # 第二个用户库
  ds_1:
    dataSourceClassName: com.zaxxer.hikari.HikariDataSource
    driverClassName: com.mysql.cj.jdbc.Driver
    jdbcUrl: jdbc:mysql://127.0.0.1:3306/damai_user_1?useUnicode=true&characterEncoding=UTF-8&rewriteBatchedStatements=true&allowMultiQueries=true&serverTimezone=Asia/Shanghai
    username: xxx
    password: xxx

rules:
  # 分库分表规则
  - !SHARDING
    tables:
      # 对d_user_mobile表进行分库分表
      d_user_mobile:
        # 库为damai_user_0 damai_user_1 表为d_user_mobile_0 至 d_user_mobile_1
        actualDataNodes: ds_${0..1}.d_user_mobile_${0..1}
        # 分库策略
        databaseStrategy:
          standard:
            # 使用mobile作为分片键
            shardingColumn: mobile
            # 用user_mobile列使用hash取模作为分库算法
            shardingAlgorithmName: databaseUserMobileHashModModel
        # 分表策略      
        tableStrategy:
          standard:
            # 使用mobile作为分片键
            shardingColumn: mobile
            # 用user_mobile列使用hash取模作为分表算法
            shardingAlgorithmName: tableUserMobileHashMod
      # 对d_user_email表进行分库分表
      d_user_email:
        # 库为damai_user_0 damai_user_1 表为d_user_email_0 至 d_user_email_1
        actualDataNodes: ds_${0..1}.d_user_email_${0..1}
        # 分库策略
        databaseStrategy:
          standard:
            # 使用email作为分片键
            shardingColumn: email
            # 用user_mobile列使用hash取模作为分库算法
            shardingAlgorithmName: databaseUserEmailHashModModel
        # 分表策略      
        tableStrategy:
          standard:
            # 使用email作为分片键
            shardingColumn: email
            # 用user_mobile列使用hash取模作为分表算法
            shardingAlgorithmName: tableUserEmailHashMod
      # 对d_user表进行分库分表
      d_user:
        # 库为damai_user_0 damai_user_1 表为d_user_0 至 d_user_1
        actualDataNodes: ds_${0..1}.d_user_${0..1}
        # 分库策略
        databaseStrategy:
          standard:
            # 使用id作为分片键
            shardingColumn: id
            # 用user_mobile列使用hash取模作为分库算法
            shardingAlgorithmName: databaseUserModModel
        # 分表策略      
        tableStrategy:
          standard:
            # 使用id作为分片键
            shardingColumn: id
            # 用user_mobile列使用hash取模作为分表算法
            shardingAlgorithmName: tableUserModModel
      # 对d_ticket_user表进行分库分表
      d_ticket_user:
        # 库为damai_user_0 damai_user_1 表为d_ticket_user_0 至 d_ticket_user_1
        actualDataNodes: ds_${0..1}.d_ticket_user_${0..1}
        # 分库策略
        databaseStrategy:
          standard:
            # 使用user_id作为分片键
            shardingColumn: user_id
            # 用user_id列使用hash取模作为分库算法
            shardingAlgorithmName: databaseTicketUserModModel
        # 分表策略      
        tableStrategy:
          standard:
            # 使用user_id作为分片键
            shardingColumn: user_id
            # 用user_id列使用hash取模作为分表算法
            shardingAlgorithmName: tableTicketUserModModel
    # 具体的算法        
    shardingAlgorithms:
      # d_user_mobile表分库算法
      databaseUserMobileHashModModel:
        type: HASH_MOD
        props:
          # 分库数量
          sharding-count: 2
      # d_user_mobile表分表算法
      tableUserMobileHashMod:
        type: HASH_MOD
        props:
          # 分表数量
          sharding-count: 2
      # d_user_email表分库算法
      databaseUserEmailHashModModel:
        type: HASH_MOD
        props:
          # 分库数量
          sharding-count: 2
      # d_user_email表分表算法
      tableUserEmailHashMod:
        type: HASH_MOD
        props:
          # 分表数量
          sharding-count: 2
      # d_user表分库算法
      databaseUserModModel:
        type: MOD
        props:
          # 分库数量
          sharding-count: 2
      # d_user表分表算法
      tableUserModModel:
        type: MOD
        props:
          # 分表数量
          sharding-count: 2
      # d_ticket_user表分库算法
      databaseTicketUserModModel:
        type: MOD
        props:
          # 分库数量
          sharding-count: 2
      # d_ticket_user表分表算法
      tableTicketUserModModel:
        type: MOD
        props:
          # 分表数量
          sharding-count: 2    
  # 加密规则
  - !ENCRYPT
    tables:
      # d_user表
      d_user:
        columns:
          # 对mobile列进行加密
          mobile:
            # 密文列mobile
            cipherColumn: mobile
            # 自定义的加密算法
            encryptorName: user_encryption_algorithm
          # 对password列进行加密
          password:
            # 密文列password
            cipherColumn: password
            # 自定义的加密算法
            encryptorName: user_encryption_algorithm
          # 对id_number列进行加密
          id_number:
            # 密文列id_number
            cipherColumn: id_number
            # 自定义的加密算法
            encryptorName: user_encryption_algorithm
      # d_user_mobile表
      d_user_mobile:
        columns:
          # 对mobile列进行加密
          mobile:
            # 密文列id_number
            cipherColumn: mobile
            # 自定义的加密算法
            encryptorName: user_encryption_algorithm
props:
  # 打印真实sql
  sql-show: true
```

### 小结

- `d_user_mobile`表的分库分表都是用的`mobile`作为分片键，算法为`HASH_MOD`，hash取模
- `d_user_email`表的分库分表都是用的`email`作为分片键，算法为`HASH_MOD`，hash取模
- `d_user`表的分库分表都是用的`id`作为分片键，算法为`MOD`，取模

## 问题

### 疑问

在用户登录时，是可以用手机号和邮箱登录的，也就是需要用手机号和邮箱来查询用户信息，而在订单业务中也需要查询用户信息，使用的是用户id来查询。而我们是使用的用户id作为分片键，使用手机号 和 邮箱 就会造成 全路由 的问题。

**所谓的全路由**，就是查询或者操作数据时，没有分片键的条件，ShardingSphere  无法定位数据具体到在哪个库，哪个表。就只能去所有的分片库，分片表上查询，这种情况的执行效率是非常慢的，会有数据库连接超时、接口超时 各种的问题。

### 解决

为了解决 手机号和邮箱登录 而且不造成 全路由 的问题。采取附属表的方案，设置了 用户手机表 和 用户邮箱表 ，通过手机号 和 邮箱 查询到 用户id，然后使用用户id查询用户表，这样就解决了问题。

![](/vika-proxy/space/2025/05/15/2f0c152121a8415bbc16879c4e3abc08)

如果以后登录业务修改的话，比如再增加使用用户名登录，那么再增加一个 用户名 表 即可解决。但使用这种附属表就没有任何问题了吗？显示不是不可能，任何的解决方案都是有相应代价的。

### 缺点

- 还是 用户登录 业务，使用手机号登录，需要先用手机号去用户手机表查询到用户id，再使用 用户id去用户表查询用户信息，这样多了一步查询的过程，额外产生了性能的消耗
- 额外多了用户手机表和用户邮箱表，随着数据量的越来越大，表容量的占用也越来越大，需要额外的维护

目前来说 这种使用 附属表路由的方案 是互联网公司比较通用的方案，那么像这种多字段查询的业务都必须使用附属表的方案吗？答案是 **不一定** 

比如 订单业务，订单可以根据订单编号查询，也可以根据用户id查询，这种业务可以用另一种方案，并不需要额外的表来维护，叫分片基因算法。此方案在订单服务的分库分表中得到了应用，小伙伴们可跳转到相应的文档查看

# 6.订单分库分表

## shardingsphere-order.yaml配置：

```yaml
dataSources: 
  # 第一个订单库
  ds_0:
    dataSourceClassName: com.zaxxer.hikari.HikariDataSource
    driverClassName: com.mysql.cj.jdbc.Driver
    jdbcUrl: jdbc:mysql://127.0.0.1:3306/damai_order_0?useUnicode=true&characterEncoding=UTF-8&rewriteBatchedStatements=true&allowMultiQueries=true&serverTimezone=Asia/Shanghai&autoReconnect=true
    username: root
    password: root
  # 第二个订单库
  ds_1:
    dataSourceClassName: com.zaxxer.hikari.HikariDataSource
    driverClassName: com.mysql.cj.jdbc.Driver
    jdbcUrl: jdbc:mysql://127.0.0.1:3306/damai_order_1?useUnicode=true&characterEncoding=UTF-8&rewriteBatchedStatements=true&allowMultiQueries=true&serverTimezone=Asia/Shanghai&autoReconnect=true
    username: root
    password: root
    
rules:
  - !SHARDING
    tables:
      # 对d_order表进行分库分表
      d_order:
        # 库为damai_order_0 damai_order_1 表为d_order_0 至 d_order_3
        actualDataNodes: ds_${0..1}.d_order_${0..3}
        # 分库策略
        databaseStrategy:
          complex:
            # 使用order_number,user_id作为分片键
            shardingColumns: order_number,user_id
            # 使用order_number,user_id分库算法
            shardingAlgorithmName: databaseOrderComplexGeneArithmetic
        # 分表策略
        tableStrategy:
          complex:
            # 使用order_number,user_id作为分片键
            shardingColumns: order_number,user_id
            # 使用order_number,user_id分表算法
            shardingAlgorithmName: tableOrderComplexGeneArithmetic
      # 对d_order_ticket_user表进行分库分表
      d_order_ticket_user:
        # 库为damai_order_0 damai_order_1 表为d_order_ticket_user_0 至 d_order_ticket_user_3
        actualDataNodes: ds_${0..1}.d_order_ticket_user_${0..3}
        # 分库策略
        databaseStrategy:
          complex:
            # 使用order_number,user_id作为分片键
            shardingColumns: order_number,user_id
            # 使用order_number,user_id分库算法
            shardingAlgorithmName: databaseOrderTicketUserComplexGeneArithmetic
        # 分表策略
        tableStrategy:
          complex:
            # 使用order_number,user_id作为分片键
            shardingColumns: order_number,user_id
            # 使用order_number,user_id分表算法
            shardingAlgorithmName: tableOrderTicketUserComplexGeneArithmetic
    # 绑定表        
    bindingTables:
      - d_order,d_order_ticket_user
    # 具体的算法
    shardingAlgorithms:
      # d_order表分库算法
      databaseOrderComplexGeneArithmetic:
        # 通过自定义实现类实现分库算法
        type: CLASS_BASED
        props:
          # 分库数量
          sharding-count: 2
          # 分表数量
          table-sharding-count: 4
          # 分库策略，复合多分片
          strategy: complex
          # 具体的分库逻辑在此自定义类中
          algorithmClassName: com.damai.shardingsphere.DatabaseOrderComplexGeneArithmetic
      # d_order表分表算法
      tableOrderComplexGeneArithmetic:
        # 通过自定义实现类实现分表算法
        type: CLASS_BASED
        props:
          # 分表数量
          sharding-count: 4
          # 分表策略，复合多分片
          strategy: complex
          # 具体的分表逻辑在此自定义类中
          algorithmClassName: com.damai.shardingsphere.TableOrderComplexGeneArithmetic
      # d_order_ticket_user表分库算法
      databaseOrderTicketUserComplexGeneArithmetic:
        # 通过自定义实现类实现分库算法
        type: CLASS_BASED
        props:
          # 分库数量
          sharding-count: 2
          # 分表数量
          table-sharding-count: 4
          # 分库策略，复合多分片
          strategy: complex
          # 具体的分库逻辑在此自定义类中
          algorithmClassName: com.damai.shardingsphere.DatabaseOrderComplexGeneArithmetic
      # d_order_ticket_user表分表算法
      tableOrderTicketUserComplexGeneArithmetic:
        # 通过自定义实现类实现分表算法
        type: CLASS_BASED
        props:
          # 分表数量
          sharding-count: 4
          # 分表策略，复合多分片
          strategy: complex
          # 具体的分表逻辑在此自定义类中
          algorithmClassName: com.damai.shardingsphere.TableOrderComplexGeneArithmetic    
props:
  # 打印真实sql
  sql-show: true
```

### 总结

- `d_order`表的分库分表都使用了`order_number,user_id`这两个字段一起作为分片键，并自定义了复合多分片类型的分库算法、分表算法
- `d_order_ticket_user`表的分库分表都使用了`order_number,user_id`这两个字段一起作为分片键，并自定义了复合多分片类型的分库算法、分表算法
- `d_order`和`d_order_ticket_user`指定了绑定表的关系
- `d_order`和`d_order_ticket_user`的自定义分库算法的实现类是`com.damai.shardingsphere.DatabaseOrderComplexGeneArithmetic`
- `d_order`和`d_order_ticket_user`的自定义分表算法的实现类是`com.damai.shardingsphere.TableOrderComplexGeneArithmetic`

在订单服务中，没有使用附属表路由的方式，而是使用了分片基因法来进行分库分表，无需额外的数据表路由，保证了执行的高效，建议小伙伴先学习分片基因法，再回来继续学习本文。

## 基因法解读

### 背景

在分库分表时，经常会遇到查询的条件不含有分片键的情况，比如说用户表，生成的订单中是依靠userId来关联用户信息，而用户在登录时又可以使用手机号和邮箱来登录，这样只有userId一个分片键就搞不定了。

大麦网中的解决方案是在设计出 用户手机表 用手机号当做分片键 。以及用户邮箱表 用邮箱当做分片键。 当用户用手机或者邮箱登录后，分别从相应的用户手机表和用户邮箱表查询出userId，然后用userId去用户表查询信息。

但是这种方案需要额外维护表。而且对于订单这种量级很大的表来说，附属路由表的量级也会很大。所以最好有另一种方案，可以不用再设计出一张表去维护它，这种方案就是我们要介绍的 **基因法**。

### 特征：

```latex
191 % 32 = 31
```

- **191的二进制：** 10111111
- **32的二进制：**  100000  也就是2的5次方
- **31的二进制：**  11111

让我们观察下这个计算规律：

**31的二进制 和 191的二进制最后5位相等，都是11111。如果随便拿一个数转成二进制，然后把二进制的后5位替换成这个11111，然后将这个替换后的值对32进行取模，那么得到的余数也是31，这个5位长度就是靠32的二进制的长度也就是求log2n对数的值**。 

**比如说 159，二进制是 10011111 ，对 32 取模，结果还是31**

下面让我们把这个计算规律应用到订单号和用户id的业务中

```java
public class TestMain {
    
    public static void main(String[] args) {
        //分片数量
        int shardingCount = 32;
        //订单编号
        long orderNumber = 2654324532L;
        //用户id
        long userId = 45346343212L;
        //求shardingCount的log2N对数
        int sequenceShift = log2N(shardingCount);
        long newOrderNumber = replaceBinaryBits(orderNumber, sequenceShift, (userId % shardingCount));
        System.out.println("替换后订单号取模结果:" + (newOrderNumber % shardingCount));
        System.out.println("用户id取模结果:" + (userId % shardingCount));
    }
    /**
     * 求log2(N)
     * */
    public static int log2N(int count) {
        return (int)(Math.log(count)/ Math.log(2));
    }
    public static long replaceBinaryBits(long num1, int numBits, long num2) {
        // 将两个数转换成二进制字符串
        String binaryStr1 = Long.toBinaryString(num1);
        // 计算num2对应的二进制长度，确保它填充到指定的numBits位
        String binaryStr2 = Long.toBinaryString(num2 % (1L << numBits));
        
        // 如果binaryStr2长度小于numBits，则在前面补零
        while (binaryStr2.length() < numBits) {
            binaryStr2 = "0" + binaryStr2;
        }
        
        // 计算需要保留的前面部分的长度
        int keepLength = binaryStr1.length() - numBits;
        
        // 如果需要替换的位数超过了num1的长度，则直接使用num2的二进制字符串
        if(keepLength < 0) {
            System.out.println("替换位数超过了第一个参数的位数，直接使用第三个参数的二进制: " + binaryStr2);
            // 直接将num2的二进制字符串转换为十进制并打印
            return Long.parseLong(binaryStr2, 2);
        }
        
        
        // 保留num1前面的部分和num2的二进制拼接
        String resultBinaryStr = binaryStr1.substring(0, keepLength) + binaryStr2;
        
        
        System.out.println("要替换的二进制后位数" + numBits);
        // 打印原始的二进制字符串
        System.out.println("num1 替换前的二进制: " + binaryStr1);
        // 打印最终的二进制字符串
        System.out.println("num1 替换后的二进制: " + resultBinaryStr);
        
        System.out.println("num2 的十进制: " + num2);
        System.out.println("num2 的二进制: " + binaryStr2);
        // 将结果二进制字符串转换回十进制数值并打印
        long resultDecimal = Long.parseLong(resultBinaryStr, 2);
        System.out.println("num1 对应的十进制数为: " + resultDecimal);
        return resultDecimal;
    }
}
```

结果：

```latex
要替换的二进制后位数5
num1 替换前的二进制: 10011110001101011100011100110100
num1 替换后的二进制: 10011110001101011100011100101100
num2 的十进制: 12
num2 的二进制: 01100
num1 对应的十进制数为: 2654324524
替换后订单号取模结果:12
用户id取模结果:12
```

### 总结

- 假设 分片数量`shardingCount = 32`，订单号`orderNumber = 2654324532L`，用户id`userId = 45346343212L`，分片数量32的log2n对数`sequenceShift = 5`
- 将`orderNumber`转为二进制，为`10011110001101011100011100110100`
- 将`user % shardingCount`的余数 = 12 转为二进制`1100`
- 根据`sequenceShift`长度是5，把 `1100`补成`01100`
- 将`10011110001101011100011100110100`的后5位替换成`01100`,替换后为`10011110001101011100011100101100`
- 将替换后的`10011110001101011100011100101100`转为十进制为`2654324524`
- 计算`2654324524 % 32` = 12
