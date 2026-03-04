# piBloom Architecture Diagrams

## 1. System Overview

The big picture: OS image → containers → bridges → agent → user.

```mermaid
graph TB
    subgraph OS["Fedora bootc 42 (immutable OS)"]
        direction TB
        subgraph Systemd["systemd + Podman Quadlet"]
            HB["pibloom-heartbeat<br/>.container"]

            subgraph SigPod["pibloom-signal.pod<br/>(shared localhost)"]
                SigBridge["pibloom-signal-bridge<br/>.container"]
                SigCli["signal-cli<br/>.container"]
            end

            WaBridge["pibloom-whatsapp-bridge<br/>.container"]
            WebBridge["pibloom-web-bridge<br/>.container"]
        end

        subgraph Data["/var/lib/pibloom/"]
            Objects["objects/<br/>Flat-file PARA store"]
            Sessions["sessions/<br/>Per-contact history"]
            Config["/etc/pibloom/<br/>pibloom.yaml"]
        end

        subgraph Persona["/usr/local/share/pibloom/"]
            Soul["persona/SOUL.md"]
            Body["persona/BODY.md"]
            Faculty["persona/FACULTY.md"]
            Skill["persona/SKILL.md"]
            Skills["skills/*/SKILL.md"]
            Manifests["manifests/*.yaml"]
        end
    end

    User["👤 User"] -->|Signal| SigBridge
    User -->|WhatsApp| WaBridge
    User -->|Browser| WebBridge

    SigBridge -->|JSON-RPC| SigCli
    SigCli -->|Signal Protocol| Internet["Signal Servers"]

    WaBridge -->|Puppeteer| WaServers["WhatsApp Servers"]

    SigBridge --> Objects
    WaBridge --> Objects
    WebBridge --> Objects

    SigBridge --> Sessions
    WaBridge --> Sessions
    WebBridge --> Sessions

    HB -->|health check| SigBridge
    HB -->|health check| WaBridge

    style OS fill:#1a1a2e,stroke:#e94560,color:#eee
    style Systemd fill:#16213e,stroke:#0f3460,color:#eee
    style Data fill:#0f3460,stroke:#533483,color:#eee
    style Persona fill:#0f3460,stroke:#533483,color:#eee
    style SigPod fill:#1a1a40,stroke:#e94560,color:#eee,stroke-dasharray: 5 5
```

## 2. Monorepo & Package Structure

How the npm workspaces and TypeScript project references connect.

```mermaid
graph LR
    subgraph Root["Root package.json"]
        direction TB
        RootScripts["tsc --build<br/>biome check<br/>npm test --workspaces"]
    end

    subgraph Core["@pibloom/core"]
        direction TB
        CorePkg["core/package.json<br/>bin: pibloom-core"]
        CoreTS["core/tsconfig.json<br/>composite: true"]
        CoreSrc["core/src/"]
    end

    subgraph WA["bridges/whatsapp"]
        direction TB
        WaPkg["package.json"]
        WaTS["tsconfig.json<br/>references: [core]"]
        WaSrc["src/index.ts"]
    end

    Root -->|"workspace: core"| Core
    Root -->|"workspace: bridges/*"| WA
    WA -->|"imports @pibloom/core"| Core
    WaTS -->|"project reference"| CoreTS

    style Root fill:#2d3436,stroke:#636e72,color:#dfe6e9
    style Core fill:#0984e3,stroke:#74b9ff,color:#fff
    style WA fill:#6c5ce7,stroke:#a29bfe,color:#fff
```

## 3. Hexagonal Architecture — Ports & Adapters

Ports (interfaces) define boundaries. Adapters (capabilities) implement them.

```mermaid
graph TB
    subgraph Ports["ports/ — Interface Contracts"]
        direction TB
        IConfig["IConfigReader<br/><i>read pibloom.yaml</i>"]
        IFront["IFrontmatterParser<br/><i>YAML ↔ Markdown</i>"]
        IObj["IObjectStore<br/><i>flat-file CRUD</i>"]
        ISys["ISystemExecutor<br/><i>run shell commands</i>"]
        IPersona["IPersonaLoader<br/><i>load agent identity</i>"]
        IEvolve["IEvolveManager<br/><i>deploy/rollback containers</i>"]
        IAgent["IAgentBridge<br/><i>process messages via AI</i>"]
        MsgChan["MessageChannel<br/><i>send/receive messages</i>"]
        IHealth["IHealthReporter<br/><i>container health checks</i>"]
        IMedia["IMediaTranscriber<br/><i>audio → text</i>"]
    end

    subgraph Adapters["capabilities/ — Implementations"]
        direction TB
        YamlReader["YamlConfigReader<br/><i>js-yaml</i>"]
        JsYaml["JsYamlFrontmatterParser<br/><i>js-yaml</i>"]
        MdStore["MarkdownFileStore<br/><i>fs read/write</i>"]
        NodeExec["NodeSystemExecutor<br/><i>child_process</i>"]
        FsPersona["FsPersonaLoader<br/><i>fs.readFile</i>"]
        EvolveM["EvolveManager<br/><i>systemctl + podman</i>"]
        AgentB["AgentBridge<br/><i>Pi SDK sessions</i>"]
        HealthF["HealthFileReporter<br/><i>fs.writeFile timer</i>"]
    end

    subgraph Bridges["Bridge Channels"]
        direction TB
        WaChan["WhatsAppBotChannel<br/><i>whatsapp-web.js</i>"]
        SigChan["SignalChannel<br/><i>signal-cli JSON-RPC</i>"]
        WebChan["WebChannel<br/><i>htmx + SSE</i>"]
    end

    IConfig -.->|implements| YamlReader
    IFront -.->|implements| JsYaml
    IObj -.->|implements| MdStore
    ISys -.->|implements| NodeExec
    IPersona -.->|implements| FsPersona
    IEvolve -.->|implements| EvolveM
    IAgent -.->|implements| AgentB
    IHealth -.->|implements| HealthF
    MsgChan -.->|implements| WaChan
    MsgChan -.->|implements| SigChan
    MsgChan -.->|implements| WebChan

    style Ports fill:#00b894,stroke:#00cec9,color:#fff
    style Adapters fill:#0984e3,stroke:#74b9ff,color:#fff
    style Bridges fill:#6c5ce7,stroke:#a29bfe,color:#fff
```

## 4. Capability System — 3-Phase Bootstrap

How `createInitializedRegistry()` wires everything together.

```mermaid
sequenceDiagram
    participant Caller as Caller (bridge or CLI)
    participant Defaults as defaults.ts
    participant Registry as CapabilityRegistry
    participant P1 as Phase 1 Capabilities
    participant P2 as Phase 2 Capabilities
    participant P3 as Phase 3 Capabilities

    Caller->>Defaults: createInitializedRegistry(pibloomConfig)
    Defaults->>Registry: new CapabilityRegistry()

    Note over Defaults,Registry: Register all 10 capabilities

    rect rgb(40, 80, 40)
        Note over P1: Phase 1 — Leaf (no deps)
        Defaults->>Registry: initCapability("frontmatter", {services: {}})
        Defaults->>Registry: initCapability("config", {services: {}})
        Defaults->>Registry: initCapability("system-executor", {services: {}})
        Defaults->>Registry: initCapability("persona", {services: {}})
        Defaults->>Registry: initCapability("affordances", {services: {}})
        Defaults->>Registry: initCapability("setup", {services: {}})
    end

    Note over Defaults: Extract services via typed getters:<br/>frontmatter.getParser()<br/>configCap.getReader()<br/>sysExec.getExecutor()<br/>persona.getLoader()

    rect rgb(40, 40, 80)
        Note over P2: Phase 2 — Needs LeafServices
        Defaults->>Registry: initCapability("object-store", {services: leafServices})
        Defaults->>Registry: initCapability("discovery", {services: leafServices})
    end

    Note over Defaults: Add objectStore.getStore() to services

    rect rgb(80, 40, 40)
        Note over P3: Phase 3 — Needs CoreServices
        Defaults->>Registry: initCapability("evolution", {services: fullServices})
        Note over Defaults: agentSession.setRegistry(registry)
        Defaults->>Registry: initCapability("agent-session", {services: fullServices})
    end

    Defaults-->>Caller: registry (fully initialized)
```

## 5. Capability Registry — Internal Structure

What the registry holds and how capabilities contribute.

```mermaid
graph TB
    subgraph Registry["CapabilityRegistry"]
        direction TB
        CapMap["capabilities: Map&lt;string, Capability&gt;<br/><i>all registered</i>"]
        RegMap["registrations: Map&lt;string, CapabilityRegistration&gt;<br/><i>init results</i>"]
    end

    subgraph Cap["Capability (interface)"]
        Name["name: string"]
        Desc["description: string"]
        Init["init(config) → CapabilityRegistration"]
        Dispose["dispose?() → void"]
    end

    subgraph Reg["CapabilityRegistration"]
        ExtFact["extensionFactory?<br/><i>hooks into Pi agent lifecycle</i>"]
        SkillP["skillPaths?<br/><i>SKILL.md dirs for agent prompts</i>"]
        ValConf["validateConfig?<br/><i>check pibloom.yaml section</i>"]
    end

    subgraph Config["CapabilityConfig"]
        PiConf["pibloom: PibloomConfig"]
        Svc["services: Partial&lt;CoreServices&gt;"]
    end

    subgraph Services["Service Tiers"]
        Leaf["LeafServices<br/>frontmatterParser<br/>configReader<br/>systemExecutor<br/>personaLoader"]
        Core["CoreServices extends Leaf<br/>+ objectStore"]
    end

    Config -->|passed to| Init
    Init -->|returns| Reg
    Registry -->|stores| Cap
    Registry -->|stores| Reg
    Services -->|available in| Svc

    Leaf -->|Phase 1 produces| Core
    Core -->|Phase 2+ receives| Svc

    style Registry fill:#2d3436,stroke:#636e72,color:#dfe6e9
    style Cap fill:#00b894,stroke:#55efc4,color:#fff
    style Reg fill:#0984e3,stroke:#74b9ff,color:#fff
    style Config fill:#fdcb6e,stroke:#f39c12,color:#2d3436
    style Services fill:#e17055,stroke:#d63031,color:#fff
```

## 6. Message Flow — Bridge to Agent and Back

What happens when a user sends a message through any bridge.

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Chan as MessageChannel<br/>(WhatsApp/Signal/Web)
    participant Queue as MessageQueue<br/>(backpressure)
    participant Bridge as AgentBridge
    participant Pi as Pi Agent Session<br/>(LLM)
    participant Store as ObjectStore<br/>(flat files)
    participant HATEOAS as HATEOAS Parser
    participant Renderer as TextRenderer

    User->>Chan: sends message
    Chan->>Chan: validate contact (isAllowed)
    Chan->>Queue: enqueue(processMessage)

    Note over Queue: Serial execution —<br/>one message at a time.<br/>Drops if queue full (100).

    Queue->>Bridge: processMessage(text, from, attachments)
    Bridge->>Bridge: getOrCreateSession(from)

    Note over Bridge: One Pi session per phone number.<br/>Persistent conversation history.

    Bridge->>Pi: session.prompt(text + attachments)

    Note over Pi: Agent has SOUL, BODY, FACULTY,<br/>SKILL context + extensions.<br/>Can use tools: object CRUD,<br/>shell commands, etc.

    Pi->>Store: create/read/update objects
    Store-->>Pi: ObjectData (frontmatter + markdown)

    Pi-->>Bridge: streamed response text

    Bridge->>HATEOAS: parseAgentOutput(rawText)
    HATEOAS-->>Bridge: ParsedAgentOutput {text, links[], media[]}

    Bridge->>Bridge: toHateoasResponse(parsed, channelName)

    alt has media files
        Bridge->>Chan: sendMedia(from, file)
        Chan->>User: 📎 media attachment
    end

    Bridge->>Renderer: render(hateoasResponse)
    Renderer-->>Bridge: formatted text string
    Bridge-->>Chan: response text
    Chan->>User: 💬 text reply
```

## 7. Bridge Manifest & Container Deployment

How bridge manifests become running containers.

```mermaid
graph TB
    subgraph Manifest["manifest.yaml (BridgeManifest)"]
        direction TB
        Meta["metadata:<br/>name, version, channel"]
        Containers["containers:<br/>- name, image, volumes, env,<br/>  pod, ports, security"]
        Pods["pods?:<br/>- name, description"]
        Timers["timers?:<br/>- name, onCalendar, unit"]
        Schema["configSchema?:<br/>- field, type, required"]
    end

    subgraph Config["pibloom.yaml"]
        BridgeConf["bridges:<br/>  signal:<br/>    phone_number: '+49...'<br/>    allowed_contacts: [...]"]
    end

    subgraph Pipeline["Install Pipeline"]
        Parse["parseBridgeManifest()<br/><i>YAML → typed object</i>"]
        Validate["validateBridgeManifest()<br/><i>check required fields</i>"]
        Template["resolveManifestTemplates()<br/><i>{{phone_number}} → +49...</i>"]
        GenPod["renderQuadletPod()<br/><i>→ .pod unit file</i>"]
        GenContainer["renderQuadletContainer()<br/><i>→ .container unit file</i>"]
        GenTimer["renderQuadletTimer()<br/><i>→ .timer unit file</i>"]
    end

    subgraph Output["/etc/containers/systemd/"]
        PodFile["pibloom-signal.pod"]
        ContFile1["pibloom-signal-bridge.container"]
        ContFile2["signal-cli.container"]
        TimerFile["pibloom-signal-compact.timer"]
    end

    subgraph Systemd["systemd"]
        Reload["systemctl daemon-reload"]
        Start["systemctl start pibloom-signal-bridge"]
        Health["health check → rollback on failure"]
    end

    Manifest --> Parse
    Config -->|template values| Template
    Parse --> Validate --> Template
    Template --> GenPod --> PodFile
    Template --> GenContainer --> ContFile1
    Template --> GenContainer --> ContFile2
    Template --> GenTimer --> TimerFile

    PodFile --> Reload
    ContFile1 --> Reload
    ContFile2 --> Reload
    TimerFile --> Reload
    Reload --> Start --> Health

    style Manifest fill:#00b894,stroke:#55efc4,color:#fff
    style Config fill:#fdcb6e,stroke:#f39c12,color:#2d3436
    style Pipeline fill:#0984e3,stroke:#74b9ff,color:#fff
    style Output fill:#6c5ce7,stroke:#a29bfe,color:#fff
    style Systemd fill:#e17055,stroke:#d63031,color:#fff
```

## 8. CLI Command Tree

The `pibloom-core` CLI entry points.

```mermaid
graph LR
    CLI["pibloom-core"]

    CLI --> Object["object"]
    Object --> ObjCreate["create &lt;type&gt; &lt;slug&gt;<br/>--field=value"]
    Object --> ObjRead["read &lt;type&gt; &lt;slug&gt;"]
    Object --> ObjList["list &lt;type&gt;<br/>--status --tag --all"]
    Object --> ObjUpdate["update &lt;type&gt; &lt;slug&gt;<br/>--field=value"]
    Object --> ObjSearch["search &lt;pattern&gt;"]
    Object --> ObjLink["link &lt;ref&gt; &lt;ref&gt;"]

    CLI --> Setup["setup<br/>--config --output-dir --dry-run"]
    Setup --> SetupOut["Reads pibloom.yaml<br/>→ generates Quadlet files<br/>→ writes to output dir"]

    CLI --> Evolve["evolve"]
    Evolve --> EvolveInstall["install &lt;slug&gt;"]
    Evolve --> EvolveRollback["rollback &lt;slug&gt;"]
    Evolve --> EvolveStatus["status [slug]"]

    CLI --> BridgeCmd["bridge"]
    BridgeCmd --> BridgeInstall["install &lt;manifest-path&gt;"]
    BridgeCmd --> BridgeList["list"]
    BridgeCmd --> BridgeRemove["remove &lt;name&gt;"]

    style CLI fill:#2d3436,stroke:#636e72,color:#dfe6e9
    style Object fill:#00b894,stroke:#55efc4,color:#fff
    style Setup fill:#0984e3,stroke:#74b9ff,color:#fff
    style Evolve fill:#6c5ce7,stroke:#a29bfe,color:#fff
    style BridgeCmd fill:#e17055,stroke:#d63031,color:#fff
```

## 9. Agent Identity — OpenPersona 4-Layer Model

How the AI agent's personality and capabilities are structured.

```mermaid
graph TB
    subgraph Persona["core/agent/persona/ — OpenPersona 4 Layers"]
        direction TB
        Soul["🌱 SOUL.md<br/><i>Identity, values, voice, boundaries</i><br/><i>'Who am I?'</i>"]
        Body["🌿 BODY.md<br/><i>Channel adaptation, presence</i><br/><i>'How do I show up?'</i>"]
        Faculty["🧠 FACULTY.md<br/><i>Reasoning patterns, PARA method</i><br/><i>'How do I think?'</i>"]
        SkillLayer["⚡ SKILL.md<br/><i>Current capabilities, tool prefs</i><br/><i>'What can I do?'</i>"]
    end

    subgraph Skills["core/agent/skills/ — Domain Skills"]
        direction TB
        BridgeMgmt["bridge-management/<br/><i>Install/manage bridges</i>"]
        BloomRT["bloom-runtime/<br/><i>Heartbeat, compaction</i>"]
        ObjEvo["object-evolution/<br/><i>Deploy containers</i>"]
        ObjStore["object-store/<br/><i>CRUD operations</i>"]
        ArtReview["artifact-reviewer/<br/><i>Review code/designs</i>"]
        TDD["tdd/<br/><i>Test-driven development</i>"]
    end

    subgraph Context["core/agent/context/ — System Prompts"]
        SysMd["SYSTEM.md<br/><i>Architecture, commands, rollback</i>"]
        AppendMd["APPEND_SYSTEM.md<br/><i>Per-bridge channel adaptation</i>"]
    end

    subgraph Session["Agent Session (runtime)"]
        PiAgent["Pi Agent<br/>(LLM session)"]
    end

    Soul --> PiAgent
    Body --> PiAgent
    Faculty --> PiAgent
    SkillLayer --> PiAgent
    Skills -->|"injected as SKILL.md"| PiAgent
    SysMd --> PiAgent
    AppendMd -->|"channel-specific section"| PiAgent

    style Persona fill:#00b894,stroke:#55efc4,color:#fff
    style Skills fill:#0984e3,stroke:#74b9ff,color:#fff
    style Context fill:#fdcb6e,stroke:#f39c12,color:#2d3436
    style Session fill:#e17055,stroke:#d63031,color:#fff
```

## 10. Object Store — Flat-File PARA Structure

How data is stored as Markdown files with YAML frontmatter.

```mermaid
graph TB
    subgraph Store["/var/lib/pibloom/objects/"]
        direction TB
        subgraph Projects["project/"]
            P1F["home-automation.md"]
            P2F["garden-planning.md"]
        end
        subgraph Areas["area/"]
            A1F["health.md"]
            A2F["finance.md"]
        end
        subgraph Resources["resource/"]
            R1F["typescript-patterns.md"]
        end
        subgraph Tasks["task/"]
            T1F["fix-signal-bridge.md"]
        end
        subgraph Evolutions["evolution/"]
            E1F["pibloom-signal-bridge.md"]
        end
    end

    subgraph FileFormat["Object File Structure"]
        direction TB
        Frontmatter["---<br/>type: task<br/>slug: fix-signal-bridge<br/>title: Fix Signal Bridge<br/>status: active<br/>priority: high<br/>project: home-automation<br/>tags: [bridge, signal]<br/>links: [project/home-automation]<br/>created: 2026-03-01T10:00:00Z<br/>modified: 2026-03-04T14:30:00Z<br/>---"]
        Content["## Description<br/>The signal bridge disconnects...<br/><br/>## Notes<br/>- Check JSON-RPC timeout..."]
    end

    subgraph API["IObjectStore Interface"]
        Create["create(type, slug, data)"]
        Read["read(type, slug) → ObjectData"]
        List["list(type, filters?) → ObjectRef[]"]
        Update["update(type, slug, data)"]
        Search["search(pattern) → ObjectRef[]"]
        Link["link(ref1, ref2)"]
    end

    API -->|"MarkdownFileStore<br/>(fs adapter)"| Store
    Frontmatter --> FileFormat
    Content --> FileFormat

    style Store fill:#0984e3,stroke:#74b9ff,color:#fff
    style FileFormat fill:#fdcb6e,stroke:#f39c12,color:#2d3436
    style API fill:#00b894,stroke:#55efc4,color:#fff
```
