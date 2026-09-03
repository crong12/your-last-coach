# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the project owner personally: a recreational runner training toward a 3:40 Brighton Marathon on 4 April 2027, using the product as a single-athlete personal tool fed by real COROS data. This is the roadmap product all design decisions serve.

Near-term audiences that remain factual:

- **Sam**, the fictional demo Athlete (`demo-athlete-v1`), is the rendering vehicle until real COROS data is integrated.
- **Hackathon judges** evaluated the seeded demo via the approved three-minute judging flow; that flow must keep working.

The second party in every workflow is the **Coach Agent** — an agent exercising running-coaching judgment through the workspace's WebMCP tools, not a human coach.

## Product Purpose

Your Last Coach is a Shared Coaching Workspace where the Athlete and a Coach Agent inspect the same training evidence, compare Workout Adaptations, and update a visible Training Plan through explicit Athlete approval. Success means the Athlete arrives at the Target Race prepared, having trusted the Coach Agent's recommendations because every one was grounded in shared, inspectable evidence — never a silent plan change.

The roadmap product extends this into the Athlete's real daily dashboard: race countdown, today's workout, readiness and performance trends, and the coaching conversation, all over live COROS observations.

## Positioning

The Athlete and the Coach Agent share one authoritative workspace state rather than exchanging chat messages about invisible data. The Agent reads bounded, provenance-labelled context (the Coaching Briefing) through WebMCP tools and can propose — but never apply — plan changes. **Only explicit Athlete approval ("Adapt my plan") mutates the Training Plan.** A chat-first coaching product cannot truthfully copy this: its agent holds the context privately and its plan changes are not gated by a shared, inspectable approval surface.

## Operating Context

- Runs in an ordinary browser as a client-only React/TypeScript/Vite app; fully usable by a human without any agent attached.
- The Coach Agent connects through a WebMCP host (e.g. ChatGPT with the site attached); when WebMCP is unavailable the workspace degrades gracefully to human-only use.
- Mobile-first daily use is the roadmap reality (checking the workspace around workouts); desktop adapts the same panes.
- Persistence is a versioned browser `localStorage` envelope with page-memory fallback; no accounts, server, or cross-device sync.
- All current Athlete, workout, recovery, and COROS-shaped observations are deterministic synthetic data with a fixed clock; **Reset demo** restores the seeded state.

## Capabilities and Constraints

- Six WebMCP fallback tools: `get_coaching_briefing`, `get_training_plan`, `get_workout_context`, `record_athlete_feedback`, `open_workout_adaptation_review`, `read_workout_adaptation_decision`. The entry briefing's structured interaction contract carries the workflow so a fresh generic Agent can coach correctly; downstream descriptions remain operation-specific.
- Domain invariants live in `src/domain/`; one application-owned state serves both React and WebMCP (`src/application/`); adapters own persistence and WebMCP mechanics without coaching judgment.
- The ubiquitous language in [CONTEXT.md](CONTEXT.md) is binding for UI copy and specifications (e.g. "Shared Coaching Workspace", never "dashboard" in product copy; "Athlete", never "user").
- The product does not connect to COROS yet, does not diagnose injury, does not generate a complete training season, and has no multi-user or authenticated persistence. Real COROS sync is a roadmap Stage 2 concern.

## Brand Commitments

- The name **Your Last Coach** is binding.
- The incumbent visual identity — sea-green/cream coastal palette, Manrope (sans) + Newsreader (serif), soft radial light, calm editorial tone — is **preferred but not binding**: future visual-world work may propose evolution or replacement, subject to owner approval. It is recorded here as the incumbent direction, not a lock.
- Voice: calm, precise, coach-like; uses the domain language; never hype.

## Evidence on Hand

- Immutable demo fixture `demo-athlete-v1` with fixed clock (`src/demo/`), including COROS-shaped observations — the only athlete data that exists today.
- Incumbent visual implementation: `src/ui/styles.css` (design tokens as CSS custom properties), `src/ui/WorkspaceApp.tsx`.
- Design explorations (local only, gitignored): `design-explorations/concept-a-countdown-topbar.png`, `design-explorations/concept-b-countdown-card.png`.
- No real users, testimonials, case studies, or benchmarks exist; future work must not fabricate them.

## Product Principles

1. **Shared state over private context** — the Athlete and the Coach Agent always look at the same workspace truth; nothing the Agent knows is invisible to the Athlete.
2. **Approval gates every mutation** — proposals preview; only explicit Athlete approval changes the Training Plan.
3. **Evidence with provenance** — every Coach Recommendation traces to time-stamped, provenance-labelled Coaching Evidence.
4. **The domain language is the interface language** — CONTEXT.md terms appear verbatim in UI copy and specs.
5. **Design for the real product, render with the demo** — decisions target the COROS-fed roadmap dashboard; the deterministic fixture remains the rendering vehicle, and every visualization records its data prerequisite.
