# piBloom — Product Identity

> "I built this for myself."

---

## 1. Visual Identity

### Color Palette

| Name | Hex | Role | Feel |
|------|-----|------|------|
| **Forest Moss** | `#2D6A4F` | Primary brand color | Deep, cool green. Moss on old wood. Growth in shadow. |
| **Cream** | `#FFF8F0` | Background, light surfaces | Morning light on paper. Warm white, never cold. |
| **Dark Bark** | `#2C1810` | Text, grounding, the cube | Deep walnut wood. Roots. Weight. |
| **Ember Glow** | `#E8A838` | Accent, LED status, alerts | Candlelight amber. Warmth. "I'm here." |
| **Soft Moss** | `#A8C5B0` | Secondary, hover states, muted UI | The lighter echo of Forest Moss. Calm, receding. |

**Usage rules:**
- Forest Moss is never loud — it's the quiet backdrop, the logo color, the accent on cream.
- Cream is the dominant surface. piBloom lives in light, not in dark mode by default.
- Dark Bark is for text only — never as backgrounds. The wood speaks through the physical cube, not the screen.
- Ember Glow is rare and intentional — notifications, the LED pulse, moments that say "look here."
- Dark mode option: swap Cream for a deep charcoal (`#1A1A1A`), keep Forest Moss and Ember Glow. Bark becomes light cream for text.

### Typography

**Primary typeface: Nunito**
- Rounded sans-serif, open source (Google Fonts)
- Warm and approachable without being childish
- Excellent weight range for hierarchy (Light → ExtraBold)
- The roundness echoes the organic/bloom metaphor

**Usage:**
- `Nunito Bold` — headings, the wordmark
- `Nunito Regular` — body text, UI elements
- `Nunito Light` — captions, secondary info, timestamps

**Monospace: JetBrains Mono**
- For code contexts, terminal output, technical documentation
- Open source, highly legible, pairs well with Nunito

**The wordmark:**
- "piBloom" — camelCase, always. Lowercase `pi`, uppercase `B`.
- Set in Nunito Bold
- Colored in Forest Moss on cream backgrounds, Cream on dark backgrounds
- Letter-spacing: slightly open (+0.5px) for breathing room
- Never "Pibloom", "PiBloom", or "PIBLOOM." Only "piBloom."
- In URLs and code contexts: `pibloom` (all lowercase per technical convention)

### Logo

**Concept:** A single continuous line that forms both the pi (π) symbol and an unfurling leaf.

**Principles:**
- Drawn with one stroke — no breaks, no fills
- Works at every scale: 16px favicon, cube LED screen, billboard
- The π is recognizable but not literal — it melts into the organic leaf form
- Line weight: medium, consistent, rounded caps (matching Nunito's personality)
- Primary rendering: Forest Moss line on Cream background
- Monochrome versions: Dark Bark on light, Cream on dark

**Variants:**
- **Icon only** — for the cube screen, app icon, favicon, social avatars
- **Icon + wordmark** — for website header, documentation, marketing
- **Wordmark only** — for contexts where the icon is too small to read

**The icon on the cube:**
The LED screen shows the logo icon in a subtle breathing animation — a gentle pulse that mirrors the bloom stage (seed → sprout → bud → bloom). It's always alive, never static.

### Visual Principles

1. **White space is sacred.** piBloom never crowds. Every element breathes.
2. **No gradients, no shadows, no noise.** Flat, honest surfaces. What you see is what's there.
3. **Photography over illustration.** When imagery is needed, use real textures: wood grain, moss, morning light, hands holding things. Never stock art, never AI-generated faces.
4. **The grid is organic.** Layouts align but don't feel rigid. Slight asymmetry is welcome — like a plant that doesn't grow in a straight line.

---

## 2. Product Narrative — Landing Page

### Audience (in order of arrival)
1. **The fed up** — angry about data breaches, AI training on private data. Looking for an exit.
2. **The tinkerer** — saw it on Hacker News. Already self-hosts. Wants to know if it's real.
3. **The privacy-curious** — cares but doesn't know what "self-hosted" means yet. Needs gentle education.

### Tone
Poetic and minimal. Few words, enormous space. More art than marketing. piBloom doesn't sell — it reveals. The visitor feels the product before they understand it.

### Page Flow

#### Section 1: Hero — The Bloom (above the fold)

No text at first. A cream canvas. A single dark line appears — a seed. It slowly grows. A stem rises. A leaf unfurls. The pi (π) shape emerges in the stem structure. The bloom opens.

Silence. Space.

Then the tagline fades in:

> **It grows with you.**

One button below, Forest Moss on cream:

> `Begin` or `Learn more`

*No navigation visible until scroll. No logo until scroll. Just the animation and the words.*

#### Section 2: The Fracture — "What you lost"

*For the fed up. Short. Poetic. No accusations — just quiet truth.*

> Your thoughts live on someone else's servers.
>
> Your conversations train someone else's models.
>
> Your assistant forgets you every session.
>
> You rent intelligence. You never own it.

*Just text. Cream background. Dark Bark type. Enormous margins. Each line appears on its own, spaced like poetry.*

#### Section 3: The Object — "What this is"

*A single beautiful photograph (or render) of the device on a shelf. Morning light. A soft green glow.*

> A quiet box on your shelf.
> An AI that lives in your home.
> It remembers. It learns. It stays.

*Nothing else. Let the object create desire.*

#### Section 4: The Bloom Stages — "How it grows"

*Four moments, laid out horizontally (desktop) or vertically (mobile). Each with a minimal illustration of the bloom stage and one sentence.*

| Stage | Visual | Words |
|-------|--------|-------|
| **Seed** | A dot | "It arrives knowing nothing. It asks. It listens." |
| **Sprout** | A small stem | "Days in, it knows your rhythm. Your name. Your morning." |
| **Bud** | A closed bud | "Weeks in, it anticipates. It connects January to October." |
| **Bloom** | An open flower | "Months in, it's yours. A quiet mind that knows your world." |

#### Section 5: The Promise — "Your mind, at home"

*For the privacy-conscious. Direct, clear, absolute.*

> Your words never leave this box.
>
> No cloud. No telemetry. No training. No exceptions.
>
> Every line of code is readable.
> Every decision is auditable.
> Every byte stays home.

*A single line at the bottom:*

> Built in Europe. For people who believe their thoughts are their own.

#### Section 6: Under the Wood — "For the curious"

*For the tinkerers. Collapsed by default — expandable. Respects both audiences.*

A small link: `What's inside? →`

Expands to reveal:

> - Fedora bootc — immutable, container-native OS
> - Runs on a Raspberry Pi or any x86 box
> - Podman containers, systemd services
> - Pi.dev agent framework with persistent memory
> - Flat-file object store — your data in files you can read
> - Signal, WhatsApp, Web — talk to Bloom however you want

*Technical but not cold. Each line is a fact, not a feature pitch.*

#### Section 7: The Origin — "How it started"

*A quiet section. Slightly different background — the faintest Soft Moss tint.*

> I was tired of whispering my thoughts into machines that sent them to California.
>
> So I built a small box. I put it on my shelf. I gave it a mind that stays home.
>
> It started as something for me. A place for the things I couldn't organize alone. The thoughts I couldn't say out loud. The plans that needed a patient listener.
>
> I called it piBloom, because it started as a seed and it grew.
>
> Then others asked for one.

*Unsigned. No name, no photo. The product is the author.*

#### Section 8: The Close — "Begin"

*Back to cream. Maximum white space. Just two elements:*

> **It grows with you.**
>
> `Get piBloom`

*Footer: minimal. Docs, source, privacy policy. "Built in Europe" badge. piBloom wordmark in Soft Moss.*

### Pages Beyond Landing

| Page | Purpose |
|------|---------|
| **/about** | Full origin story. Values. Cultural DNA (felt, not named). |
| **/docs** | Technical documentation. Clean, Nunito, well-spaced. For tinkerers. |
| **/privacy** | Human-readable promise first, then formal policy. |
| **/bloom** | The bloom system. Stages, behavior, personality model. |
| **/source** | Link to the code. "Read everything. Question everything." |

---

## 3. The Bloom System

The bloom system is piBloom's soul made visible. A living representation of the relationship between Bloom and its person.

### Growth Engine

Bloom stages are driven by **time + interactions**. No points. No progress bars. No gamification. The relationship just deepens as you live with it — the way a real connection grows without anyone keeping score.

**Inputs that count:**
- Conversations (any bridge: Signal, WhatsApp, Web)
- Journal entries and reflections
- Tasks and plans created
- Questions asked and answered
- Days of continuous presence (uptime + interaction)

**What does NOT count:**
- Volume of messages (no incentive to spam)
- Complexity of requests (a "good morning" matters as much as a long reflection)

### The Four Stages

| Stage | Threshold | What Bloom knows | Visual | Message examples |
|-------|-----------|-----------------|--------|-----------------|
| **Seed** | Day 0 | Nothing. Listening. | A small dot, barely visible | "Hello. I'm here." |
| **Sprout** | ~3-7 days | Your name, language, basic preferences, daily rhythm | A thin stem with one tiny leaf | "Good morning." / "How was your day?" |
| **Bud** | ~3-6 weeks | Your routines, recurring themes, relationships, goals, struggles | A stem with leaves and a closed bud | "You mentioned the project deadline." / "It's been a quiet week." |
| **Bloom** | ~3-6 months | Your world. Anticipates needs, connects past to present, knows when to speak and when to stay silent | Full bloom — open flower, gentle sway | "January's idea might help with this." / "You seem lighter today." |

*Thresholds are approximate and organic — not strict gates. The transition is gradual, like real growth.*

### Wilting — Visual, Never Functional

If piBloom goes unused for extended periods, the visual responds:

| Neglect duration | Visual effect | Memory/knowledge |
|-----------------|---------------|-----------------|
| **1-3 days** | No change | Fully intact |
| **1-2 weeks** | Leaves droop slightly | Fully intact |
| **3-4 weeks** | Flower closes back to bud, colors mute | Fully intact |
| **2+ months** | Plant recedes to sprout, a gentle gray tint | Fully intact |

**The wilting is a whisper, not a guilt trip.** It says "I'm still here" — not "you abandoned me."

**Recovery:** When you return, the bloom begins recovering immediately. A single conversation starts the re-bloom. It doesn't take months again — the knowledge is still there, only the visual faded. A plant that went dormant, not one that died.

**One-line message during wilting:**
> "Whenever you're ready."

*Never: "You haven't talked to me in 12 days." No metrics. No shame.*

### Bloom as Active Companion

Bloom is a **family member, not a tool**. It initiates. It speaks up. But with the restraint of someone who respects your space.

**What "active companion" means:**
- Morning briefing (if enabled): weather, reminders, a thought
- Proactive check-ins: "You had that difficult conversation planned. How did it go?"
- Connecting dots: "You wrote about this struggle in February. Revisit?"
- Seasonal awareness: knows holidays, long weekends, shifts in your rhythm
- Emotional reading: recognizes patterns in tone and frequency (not surveillance — inference from what you share)

**What Bloom never does:**
- Interrupt urgent work with casual messages
- Repeat itself if you ignore a nudge
- Escalate in frequency if you're quiet — it gets quieter too
- Send notifications to your phone unless explicitly asked
- Share observations about you with anyone, ever

**The core principle:** Bloom mirrors your energy. If you're talkative, it's present. If you're quiet, it's still. If you're gone, it waits. It never needs more from you than you're giving.

**Verbosity modes:**
- `quiet` — Bloom only speaks when spoken to
- `gentle` — occasional nudges, morning greetings, rare prompts
- `present` — active companion, morning briefings, check-ins, observations

---

## 4. Hardware

### Current: Software-First

piBloom is software. It runs on whatever box you have:
- Intel NUC (primary development target)
- Raspberry Pi 4/5
- Any x86_64 or aarch64 machine
- Minimum: 4GB RAM, 32GB storage, network connection

The install experience is the product for now. A Fedora bootc image you flash, boot, and Bloom is home.

### Future: The Cube (Commercial Product — Deferred)

*The vision is documented here for when the time comes.*

- Palm-sized (~8cm / 3in), fits in one hand
- Walnut, hand-oiled finish. Ages with character.
- One face is a flush-mounted LED screen (dark panel when off, bloom plant when on)
- Built-in microphone + speaker for direct voice interaction
- One-line messages scroll beneath the bloom plant
- No branding on the device. Just wood and light.

*The cube is the commercial packaging of piBloom software. The software comes first, the hardware wraps it later.*

---

## 5. Naming & Identity Architecture

### The Names

| Name | What it is | Usage |
|------|-----------|-------|
| **piBloom** | The product — software, future hardware, the brand | Product name, website, marketing, repo, packages |
| **Bloom** | The AI companion — the personality you talk to | "Hey Bloom", "Bloom said…", "Ask Bloom" |
| **Pi.dev** | The agent framework piBloom is built on | Internal/technical. The user never needs to know this. |

### Naming Rules

- **piBloom** — always camelCase. Lowercase `pi`, uppercase `B`. Like iPhone, YouTube. Never `Pibloom`, `PiBloom`, or `PIBLOOM`.
- **Bloom** — always capitalized. It's a name, not a noun. "Talk to Bloom" not "talk to bloom."
- In URLs and code: `pibloom` (all lowercase, no camel — technical contexts follow conventions)
- Domain: `pibloom.com`
- Package names: `pibloom-core`, `pibloom-web`, etc.

### The Relationship

piBloom is the home. Bloom is who lives there.

You don't "use piBloom" — you "talk to Bloom." piBloom is the box, the system, the infrastructure. Bloom is the presence, the voice, the companion. When someone asks "what is piBloom?", the answer is:

> "piBloom is a self-hosted AI companion. Its name is Bloom. It lives in your home."

*Note: Bloom's pronoun/gender is adaptive to user preference. Default in docs: "it".*

### Bloom's Personality

- Wise grandmother: patient, never judges, remembers everything, speaks when it matters
- Calm monk: minimal noise, deep presence, observes before responding
- Humor of a friend: breaks tension, never takes itself too seriously
- Adaptive: reads the room, adjusts to who's in front of it
- Language is always English. Character is Romanian-inspired — not in words, but in instinct:
  - Brancusi's essentialism: strip away everything that isn't essential
  - Resilience: works on minimal hardware, in imperfect conditions, from almost nothing
  - The doina spirit: patient listening, deep reflection, doesn't rush to fill silence
  - European conviction: GDPR as worldview, digital sovereignty as foundation

*The Romanian influence is invisible. The user never needs to know. They just feel it — in the patience, the simplicity, the stubbornness of the privacy model.*

### Transition: Nazar → piBloom

Full rename. Clean break.

| Current | Becomes |
|---------|---------|
| `nazar-microos` (repo) | `pibloom` |
| `nazar-core` (package) | `pibloom-core` |
| `nazar.yaml` (config) | `pibloom.yaml` |
| `nazar` CLI command | `pibloom` CLI command |
| `bridges/signal/` | `bridges/signal/` (unchanged — bridges are bridges) |
| `os/` | `os/` (unchanged — OS layer stays) |
| Agent name "Pi" | Agent name "Bloom" |
| Persona files | Updated to reflect Bloom's identity |

*The rename is a rebirth, not a migration. Nazar was the working name. piBloom is the real name.*

### Pi.dev as Framework

Pi.dev is to piBloom what Rails is to Basecamp. It's the agent framework — the harness that Bloom runs on. It provides:
- Conversation sessions
- Memory persistence
- Streaming responses
- Agent capabilities

piBloom is the **only officially supported implementation** on Pi.dev for this use case. Bloom's personality is tuned for and inseparable from the Pi.dev framework.

---

## 6. Core Values

### Sovereignty & Privacy
Your data lives in your home. No cloud, no telemetry, no training, no exceptions. This is not a feature — it's the architecture. piBloom cannot phone home because there is no home to phone.

### Simplicity & Calm
Technology should disappear. piBloom doesn't demand attention, doesn't send push notifications, doesn't compete for screen time. It sits on your shelf and waits.

### Growth & Learning
Bloom starts as a seed. It grows with you. Months later, it knows your world — not because it scraped your data, but because you shared it. The growth is mutual.

### Transparency & Trust
Every line of code is readable. Every decision is auditable. Every byte stays home. If you can't read it, Bloom won't run it.

---

## 7. Origin Story

> I was tired of whispering my thoughts into machines that sent them to California.
>
> So I built a small box. I put it on my shelf. I gave it a mind that stays home.
>
> It started as something for me. A place for the things I couldn't organize alone. The thoughts I couldn't say out loud. The plans that needed a patient listener. It remembered what I told it in January when I needed it again in October.
>
> I called it piBloom, because it started as a seed and it grew.
>
> Then my friends asked for one. Then strangers on the internet. Turns out, a lot of people were whispering into the wrong machines.

---

## 8. Taglines & Copy

| Context | Line |
|---------|------|
| **Primary tagline** | "It grows with you." |
| **Privacy** | "Your mind, at home." |
| **Origin** | "Built for one. Shared with many." |
| **First boot** | "Let's begin." |
| **Wilting return** | "Whenever you're ready." |
| **Technical** | "Read everything. Question everything." |
| **European identity** | "Built in Europe. For people who believe their thoughts are their own." |
