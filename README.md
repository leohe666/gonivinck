# gonivinck_new

gonivinck 升级版，基于 gonivinck 框架更新所有基础镜像，修复老旧组件无法运行的问题。

## 与 gonivinck 的区别

| 组件 | gonivinck（旧） | gonivinck_new（新） |
|------|----------------|-------------------|
| **etcd** | bitnamilegacy/etcd（已废弃） | bitnami/etcd:3.5 |
| **Redis** | redis:5.0 | redis:7.2-alpine |
| **MySQL** | mysql:8.0 | mysql:8.4 |
| **phpMyAdmin** | phpmyadmin/phpmyadmin | phpmyadmin/phpmyadmin:latest |
| **Redis 管理** | erikdubbelboer/phpredisadmin（停止维护） | rediscommander/redis-commander:latest |
| **etcd 管理** | evildecay/etcdkeeper | marc1404/etcdkeeper:latest |
| **Prometheus** | bitnami/prometheus | bitnami/prometheus:latest |
| **Grafana** | grafana/grafana | grafana/grafana:latest |
| **Jaeger** | jaegertracing/all-in-one:1.28 | jaegertracing/all-in-one:latest |
| **DTM** | yedf/dtm | dtmhub/dtm:latest |
| **Golang** | golang:1.18 | golang:1.23-alpine |
| **健康检查** | ❌ | ✅ 所有服务添加健康检查 |
| **依赖启动** | ❌ | ✅ depends_on 条件启动 |
| **数据持久化** | 部分 | ✅ 所有服务数据持久化 |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-org/gonivinck_new.git
cd gonivinck_new
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 修改密码和端口
```

### 3. 启动所有服务

```bash
docker-compose up -d
```

### 4. 验证服务

```bash
# 检查所有容器状态
docker-compose ps

# 验证 etcd
curl http://localhost:2379/health

# 验证 MySQL
curl http://localhost:3306

# 验证 Redis
curl http://localhost:6379

# 验证 Prometheus
curl http://localhost:3000

# 验证 Grafana
curl http://localhost:4000

# 验证 Jaeger
curl http://localhost:5000

# 验证 DTM
curl http://localhost:36789
```

## 服务访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| **MySQL** | localhost:3306 | 默认账号 admin / *** |
| **Redis** | localhost:6379 | 无密码 |
| **etcd** | localhost:2379 | 无认证 |
| **phpMyAdmin** | http://localhost:1000 | MySQL 可视化管理 |
| **Redis Commander** | http://localhost:2000 | Redis 可视化管理 |
| **etcdkeeper** | http://localhost:7001 | etcd 可视化管理 |
| **Prometheus** | http://localhost:3000 | 监控采集 |
| **Grafana** | http://localhost:4000 | 监控面板 |
| **Jaeger** | http://localhost:5000 | 链路追踪 |
| **DTM HTTP** | localhost:36789 | 分布式事务 HTTP |
| **DTM gRPC** | localhost:36790 | 分布式事务 gRPC |

## 目录结构

```
gonivinck_new/
├── .env                          # 环境变量配置
├── docker-compose.yml            # 服务编排
├── golang/                       # 开发环境容器
│   └── Dockerfile
├── prometheus/
│   └── prometheus.yml            # Prometheus 配置
├── dtm/
│   └── config.yml                # DTM 配置
├── data/                         # 数据持久化目录
│   ├── mysql/
│   ├── redis/
│   ├── etcd/
│   ├── prometheus/
│   └── grafana/
├── code/                         # 代码挂载目录
└── README.md
```

## 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 停止并删除数据卷（谨慎操作）
docker-compose down -v

# 查看日志
docker-compose logs -f

# 重启某个服务
docker-compose restart etcd

# 进入容器
docker-compose exec mysql bash
```

## 注意事项

1. **首次启动较慢**：需要下载最新镜像，请耐心等待
2. **数据持久化**：所有数据保存在 data/ 目录，不会因容器重启丢失
3. **端口冲突**：如果默认端口被占用，请修改 .env 中的端口配置
4. **资源要求**：建议至少 8GB 内存，16GB 更佳

## 后续升级计划

- [ ] 添加网关服务（go-zero）
- [ ] 添加服务注册/发现（etcd + Registry）
- [ ] 添加链路追踪集成（Jaeger）
- [ ] 添加监控告警（Prometheus + Grafana）
- [ ] 支持多环境（sandbox/inner/prod）
