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

## 可观测性快速入口

### 核心组件地址

| 组件 | 访问地址 | 说明 |
|------|----------|------|
| **Grafana** | http://localhost:4000 | 匿名登录（Editor 权限），预置 SLA 仪表盘 |
| **Prometheus** | http://localhost:3000 | SLO recording/alerting rules、Targets 状态 |
| **Jaeger UI** | http://localhost:5001 | 全链路追踪、Trace 详情、服务拓扑 |
| **Loki (LogQL API)** | http://localhost:3100 | 按 `trace_id` 查日志 |

### 预置仪表盘

- **SLA / SLO 监控** → http://localhost:4000/d/sla-slo-mall
  - 4 个黄金信号 Gauge：可用性、错误率、P95、P99
  - QPS 趋势、P95/P99 延迟趋势
  - 服务存活矩阵
  - RPC 错误率趋势
  - 错误预算燃烧率（5m/1h 窗口）
  - 错误预算消耗占比

### SLO 核心指标 (PromQL)

| 指标 | 含义 | 目标/SLO |
|------|------|----------|
| `job:slo:availability:ratio_5m` | 可用性 (5m 窗口) | > 99.9% |
| `job:slo:error_rate:ratio_5m` | 5xx 错误率 (5m) | < 0.1% |
| `job:slo:latency_p95:ms_5m` | P95 延迟 (5m) | < 200ms |
| `job:slo:latency_p99:ms_5m` | P99 延迟 (5m) | < 500ms |
| `job:slo:request_rate:sum_5m` | QPS (5m 速率) | - |
| `job:slo:rpc_error_rate:ratio_5m` | 下游 RPC 错误率 | < 1% |

### 告警规则 (Prometheus 已加载)

| 告警 | 级别 | 触发条件 |
|------|------|----------|
| `ServiceDown` | critical | 服务宕机 > 1m |
| `SLOAvailabilityLow` | warning | 可用性 < 99.9% 持续 5m |
| `ErrorRateHigh` | warning | 5xx 错误率 > 0.1% 持续 5m |
| `LatencyP95High` | warning | P95 > 200ms 持续 5m |
| `LatencyP99Critical` | critical | P99 > 500ms 持续 5m |
| `RPCErrorRateHigh` | warning | RPC 错误率 > 1% 持续 5m |

### 按 request-id (= trace-id) 查日志 + 全链路（三种方式）

#### 方式 1：Loki LogQL（命令行）
```bash
# 1) 触发一次业务请求
T=$(curl -s -X POST http://localhost:8000/api/user/login \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"13800000000","password":"***"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

curl -s -X POST http://localhost:8000/api/user/userinfo \
  -H "Authorization: Bearer $T"

# 2) 从 Loki 取 trace-id (最近 1 小时)
RID=$(curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="golang-services"} |~ "HTTP"' \
  --data-urlencode 'limit=1' \
  --data-urlencode "start=$(date -v-1H +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(s['stream']['trace']) for s in d['data']['result'] if 'trace' in s['stream']]")

echo "TraceID: $RID"

# 3) 用 trace-id 查该请求的所有日志
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode "query={job=\"golang-services\", trace=\"$RID\"}" \
  --data-urlencode 'limit=50' \
  --data-urlencode "start=$(date -v-1H +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000"
```

#### 方式 2：Jaeger UI（浏览器）
1. 打开 http://localhost:5001
2. Service 选 `user.api` → Find Traces
3. 点某条 trace → 查看 4 个 span：`/api/user/login` → `user.User/UserInfo` → redis ×2
4. 点 span 右侧 **"Logs for this trace"** → 自动跳转 Grafana Explore (Loki)，显示同一 trace_id 的所有日志

#### 方式 3：Grafana Explore 双向跳转（已配置）
- **Loki → Jaeger**：Explore 选 Loki 数据源 → 查 `{job="golang-services", trace="<trace-id>"}` → 点日志行的 `trace_id` 链接 → 跳转 Jaeger Trace 页
- **Jaeger → Loki**：Jaeger Trace 页 → 点 "Logs for this trace" → 跳转 Grafana Explore (Loki) 同一 trace_id 的日志

#### 方式 4：API 直查完整链路
```bash
curl -s "http://localhost:5001/api/traces/$RID" | python3 -m json.tool
# 返回完整 spans：HTTP 入口 → RPC 调用 → Redis 操作
```

---

### 本地开发（热加载）

代码挂载在 `code/` 目录，容器内路径 `/usr/src/code`。8 个业务微服务 + 1 个统一网关，各自独立 air 热加载。

```bash
# 进入 golang 容器
docker exec -it gonivinck_new-golang-1 bash

# 方式 A：一键启动（推荐，9 个 air + 进程守护）
cd /usr/src/code && make run

# 方式 B：分离模式
# 终端 1: make air       # 仅启动 9 个 air 文件监听
# 终端 2: make services  # 仅启动 9 个服务进程（由 air 编译后自动重启）

# 常用 make 命令
make build   # 仅编译 9 服务到 tmp/
make stop    # 停止所有 air + 服务进程
make clean   # 清理 tmp/ 编译产物
make help    # 显示帮助
```

**Makefile 关键特性**
- 9 个服务各自独立 `.air.*.toml` → 改哪个重哪个，互不干扰
- 统一网关 `service/gateway`：一个进程一个端口 (8888)，承载 HTTP→gRPC 透传 + login/userinfo/aggregate 聚合接口
- `start-services.sh` 串行重启：等进程退出 → 等端口释放 → 校验 ELF 合法 → debounce 去重
- 编译产物输出到 `tmp/`，不污染源码目录

---

### 故障排查清单

```bash
# 1. 8 微服务是否存活
docker exec gonivinck_new-golang-1 sh -c "ps aux | grep -E 'tmp/.*_(api|rpc)' | grep -v grep | wc -l"  # 应为 8

# 2. Prometheus 采集状态
curl -s http://localhost:3000/api/v1/targets | python3 -c "import json,sys; [print(t['labels']['app'], t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"

# 3. Loki 就绪
curl -s http://localhost:3100/ready  # 应返回 "ready"

# 4. Jaeger 服务列表
curl -s http://localhost:5001/api/services | python3 -c "import json,sys; print(json.load(sys.stdin)['data'])"

# 5. SLO 规则是否加载
curl -s http://localhost:3000/api/v1/rules | python3 -c "import json,sys; [print(r['name'], r['type']) for g in json.load(sys.stdin)['data']['groups'] for r in g['rules']]"

# 6. Grafana SLA 仪表盘
curl -s http://localhost:4000/api/dashboards/uid/sla-slo-mall | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dashboard']['title'], len(d['dashboard']['panels']), 'panels')"
```

---

## 注意事项

1. **首次启动较慢**：需要下载最新镜像，请耐心等待
2. **数据持久化**：所有数据保存在 data/ 目录，不会因容器重启丢失
3. **端口冲突**：如果默认端口被占用，请修改 .env 中的端口配置
4. **资源要求**：建议至少 8GB 内存，16GB 更佳
5. **代码修改后**：容器内 `make run` 会自动热重载，无需重启容器

## 后续升级计划

- [x] 添加网关服务（go-zero）
- [x] 添加服务注册/发现（etcd + Registry）
- [x] 添加链路追踪集成（Jaeger + OTLP）
- [x] 添加日志聚合（Loki + Promtail，trace_id 关联）
- [x] 添加 SLA 监控（SLO recording/alerting rules + Grafana 仪表盘自动 provisioning）
- [x] 热加载开发环境（per-service air + 串行重启守护）
- [ ] 支持多环境（sandbox/inner/prod）