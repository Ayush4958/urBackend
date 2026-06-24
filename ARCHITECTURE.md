# System Architecture & Technical Design Document: urBackend

## 1. Executive Summary & Design Philosophy

### Core Vision
**urBackend** is an open-source, headless Backend-as-a-Service (BaaS) meticulously engineered for the MongoDB/MERN ecosystem. It empowers developers to rapidly deploy and scale full-stack applications by providing a managed backend overlay that handles authentication, row-level security (RLS), and database interactions, all without sacrificing direct control over the underlying data persistence layer.

### Architectural Philosophy
Unlike traditional BaaS platforms that lock users into proprietary data silos or rely on resource-heavy container isolation (e.g., spawning dedicated Docker containers per project), urBackend adopts a **Bring Your Own Database (BYODB)** model. It operates as a highly optimized, shared-runtime execution layer. By utilizing stateless multi-tenancy, connection multiplexing, and application-layer security separation, urBackend achieves a drastically lower infrastructure footprint. This resource-efficient model maximizes compute density, allowing a single cluster to securely handle thousands of concurrent projects with predictable performance and zero state fragmentation.

---

## 2. High-Level System Architecture & Execution Topology

### System Blueprint

```text
                          ┌────────────────────────┐
                          │   web-dashboard (React)│
                          └───────────┬────────────┘
                                      │ (HTTPS)
                                      ▼
┌──────────────────┐      ┌────────────────────────┐      ┌──────────────────┐
│ public-api (Node)│◄────►│  dashboard-api (Node)  │◄────►│python-service    │
└────────┬─────────┘      └───────────┬────────────┘      │(FastAPI / LLMs)  │
         │                            │                   └──────────────────┘
         │ (HTTP / gRPC)              │ (Push Jobs)
         ▼                            ▼
┌──────────────────┐      ┌────────────────────────┐
│ Connection Manager│      │   Redis (BullMQ)       │
│ & Registry Map   │      └───────────┬────────────┘
└────────┬─────────┘                  │
         │                            ▼
         │ (TCP Sockets)  ┌────────────────────────┐
         └───────────────►│    consumer (Node)     │
                          └────────────────────────┘
```

### Microservices Component Matrix

| Service | Runtime / Language | Primary Responsibility | Network Exposure |
| :--- | :--- | :--- | :--- |
| **`public-api`** | Node.js / Express | Core gateway for external client SDKs. Handles data routing, user auth, and RLS enforcement. | Public (Internet-Facing) |
| **`dashboard-api`** | Node.js / Express | Admin control plane for managing projects, configuring schema, and managing API keys. | Public (Internet-Facing) |
| **`web-dashboard`** | React / Vite | Visual frontend control panel (Dashboard UI) for developers to interact with `dashboard-api`. | Public (Static CDN) |
| **`consumer`** | Node.js | Asynchronous background worker for processing heavy, long-running jobs (e.g., data exports, bulk emails). | Internal (Private Network) |
| **`python-service`** | Python / FastAPI | AI/LLM processing engine handling compute-heavy machine learning and inference tasks. | Internal (Private Network) |
| **`Redis`** | Redis | Message broker (BullMQ), session storage, and high-speed distributed cache. | Internal (Private Network) |

---

## 3. Deep-Dive: Core Technical Mechanics

### 3.1 Multi-Tenant Database Router & Connection Lifecycle

#### The Routing Engine
The heart of urBackend's BYODB model lies in its dynamic database router. When an external client makes a request, it provides an API key (`pk_live` or `sk_live`). The gateway resolves this key to a specific project. The `packages/common/src/utils/connection.manager.js` script dynamically decrypts the project's securely vaulted MongoDB URI and establishes a direct connection to the tenant's external cluster, effectively multiplexing thousands of external databases through a single API gateway.

#### In-Memory Connection Registry
To prevent severe latency penalties associated with establishing fresh TCP/TLS handshakes for every request, established MongoDB connections are cached in an isolated, constant-time lookup Map (`packages/common/src/utils/registry.js`).
Subsequent requests from the same project instantly retrieve the hot connection using the `projectId` as the registry key.

#### Resource Guardrails & Optimization
To run this multi-tenant router at enterprise scale without TCP connection exhaustion or OOM (Out-of-Memory) crashes, urBackend implements strict resource guardrails:
- **Driver-Level Pooling Options**: Connections are instantiated with tailored parameters:
  - `maxPoolSize`: Capped dynamically (e.g., 15 for free tiers, 50 for premium) to prevent unmanaged pool bloat.
  - `minPoolSize`: Maintained at 2 warm sockets to guarantee zero cold-start latency for background operations.
  - `maxIdleTimeMS`: Set to 15,000ms, offloading idle socket pruning directly to the MongoDB driver.
  - `connectTimeoutMS`: Configured to fail fast on dead strings, preventing stalled API threads.
- **Passive Eviction & Cache Management**: A background garbage collection worker (`packages/common/src/utils/GC.js`) periodically sweeps the registry. It implements a passive eviction strategy, automatically closing and purging connections that have surpassed an idle threshold (e.g., 20 minutes) to cap V8 heap RAM usage.
- **Hybrid Metadata Caching**: To eliminate the latency of querying the main metadata database and performing decryption on a cache miss, urBackend utilizes Redis to temporarily cache the decrypted MongoDB URI. This ensures that even across distinct horizontal API nodes, cold-start latency is entirely bypassed.

### 3.2 Application-Layer Row-Level Security (RLS) Engine

#### JWT Authorization Pipeline
Rather than relying on database-level roles which are difficult to manage in a heavily multiplexed BYODB environment, urBackend enforces an application-layer RLS model. The `resolvePublicAuthContext.js` middleware acts as the primary gatekeeper. It intercepts incoming requests, identifies the target project, and symmetrically verifies the JWT using the project's unique cryptographic secret, subsequently binding the verified identity to `req.authUser`.

#### Payload Interception & Payload Binding
Security enforcement is absolute and happens before the database driver is invoked. The `authorizeReadOperation.js` and `authorizeWriteOperation.js` middlewares intercept incoming payloads.
- For **Reads**, dynamic filters (e.g., `req.rlsFilter = { userId: authUserId }`) are forcibly appended to the Mongoose query payload.
- For **Writes/Updates**, the middleware deeply inspects the request body, strictly enforces document ownership matching, and rejects any unauthorized attempts to mutate protected owner fields. This guarantees that a tenant's end-users are cryptographically isolated from one another.

### 3.3 Asynchronous Task Offloading Engine

#### Queueing Middleware
urBackend leverages Redis combined with BullMQ to construct a robust asynchronous queueing middleware. Any operation with high computational overhead or unpredictable latency—such as bulk JSON/CSV exports, mass email dispatching, or webhook execution—is instantly serialized into a job and pushed to the queue, immediately releasing the HTTP response back to the client.

#### Worker Scalability
By completely decoupling the `consumer` background worker from the core APIs, the system achieves maximum horizontal efficiency. The `public-api` and `dashboard-api` event loops remain completely unblocked, guaranteeing highly predictable, sub-millisecond route execution speeds regardless of the background processing load. Furthermore, consumer worker instances can be scaled independently up or down based on queue depth.

---

## 4. Operational Deployment & Infrastructure Blueprint

### Monorepo Compilation & Scaling
urBackend is orchestrated using an infrastructure-as-code pattern via `render.yaml`. The deployment topology specifies that the underlying microservices compile into **long-running, persistent Node.js processes**. This structural decision is critical—unlike ephemeral serverless functions, persistent processes allow the in-memory `Map` connection registry and `setInterval` background garbage collectors to function precisely as designed, sustaining high-throughput connection multiplexing without state loss.

### Horizontal Scaling Playbook
The architecture guarantees true statelessness at the API layer. To scale urBackend from 10 to 10,000+ active client applications:
1. **API Scaling**: Additional instances of `public-api` and `dashboard-api` can be spun up seamlessly behind a standard Round-Robin or Least-Connections Load Balancer. Since state (session tokens, queue data, and connection metadata) is centralized in Redis, API instances remain interchangeable.
2. **Worker Scaling**: As project data operations grow, `consumer` worker nodes can be scaled horizontally. They independently pull jobs from the unified Redis cluster without risking duplicate executions.
3. **Database Segregation**: Because of the BYODB model, database traffic scales naturally. urBackend's core database is solely responsible for metadata, while the heavy I/O operations of end-user applications are distributed outward across thousands of distinct, external MongoDB clusters provided by the tenants.
