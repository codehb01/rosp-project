# AI Assistant Implementation Plan

An open-source, free-tier-friendly AI layer for RozgaarSetu. Customers can find, quote, confirm, and pay for a worker from chat, in English, Hindi, and Marathi.

> **Status:** All phases (0-6) are implemented on `feat/ai-assistant`. Automated checks pass (type-check, lint, tests, production build). The items under "Needs a person with credentials" in section 9 have **not** been run yet.
>
> **Findings from Phase 0**
> - Payment happens at job **completion** (`initiatePaymentForJobCompletion`), not at booking. Chat therefore creates a `PENDING` job through the existing `/api/jobs`, and the payment flow is unchanged.
> - Pricing inputs already exist: `WorkerProfile.hourlyRate` and `minimumFee`. Address comes from `CustomerProfile`.
> - The existing rate limiter is in-memory and IP-based, so AI routes use a small per-user limiter (`lib/ai/rate-limit.ts`).
>
> **Differences from the first draft of this plan**
> - The model has **no** `createBooking` tool. `prepareBooking` only returns a draft; the **Confirm Booking** button posts to `/api/jobs`.
> - Embeddings and review summaries live in **separate tables** (`WorkerEmbedding`, `WorkerReviewSummary`), not columns on `WorkerProfile`. This keeps the raw `wp.*` search query safe and means the app works even if a migration has not been applied yet.
> - Smart pricing is statistics only (quartiles of completed job charges), with no LLM and no XGBoost.
> - Upstash Redis and Langfuse were left out; they can be added later.

---

## 1. Goals

1. **AI booking chatbot** that searches workers, quotes, confirms, and pays inside chat.
2. **Semantic worker search** with natural-language and multilingual queries.
3. **Review summaries**: a one-line summary and tags on each worker card.
4. **Smart pricing**: suggested rates for workers and a "Fair / High / Below market" badge for customers.

## 2. Principles (how we avoid breaking anything)

- **Additive only.** New folders, nullable DB columns, and no changes to existing behavior.
- **Feature flag.** `AI_ENABLED=false` hides the widget and disables all AI routes.
- **Graceful fallback.** Any AI failure falls back to the existing UI and keyword search.
- **Provider-agnostic.** The model, key, and base URL come from `.env` only.
- **Human confirmation.** Nothing is booked or charged until the user taps **Confirm**.
- **Same conventions.** Follow the existing structure, naming, Zod validation, and Clerk auth patterns.
- **One PR per phase** into `development`, merged only after lint, tests, and build pass.

## 3. Tech Stack (additions)

| Need | Tool (free tier, works on Vercel) |
|---|---|
| LLM | Qwen / Llama via **Groq** free tier, with **OpenRouter** free models as fallback |
| Orchestration | **Vercel AI SDK** (streaming and tool-calling) |
| Embeddings | **bge-m3** via Hugging Face or Cloudflare Workers AI free tier |
| Vector search | **pgvector** on the existing Postgres (Neon or Supabase) |
| Rate limiting | In-memory per-user limiter (Upstash Redis is an optional upgrade, not used yet) |
| Monitoring | Not added yet (Langfuse is an option) |

> Ollama is for local development only. Vercel serverless functions cannot reach a local machine.

## 4. Configuration (`.env`)

```env
AI_ENABLED=true

# Primary LLM (any OpenAI-compatible endpoint)
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=
LLM_MODEL=

# Optional fallback
LLM_FALLBACK_BASE_URL=https://openrouter.ai/api/v1
LLM_FALLBACK_API_KEY=
LLM_FALLBACK_MODEL=

# Embeddings
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=BAAI/bge-m3

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Switching providers or models means changing these values and redeploying. No code change is needed.

**Cautions**
- Any model used must support **tool-calling**. Test it before adopting.
- Free-tier limits and model availability change, so verify them before launch.
- Changing the embedding model requires re-embedding all workers, because vectors are not compatible across models.

## 5. Structure (new files only)

```
lib/ai/
  config.ts              # reads and validates AI env, feature flag
  provider.ts            # OpenAI-compatible client with fallback
  guard.ts               # flag + Clerk auth + per-user rate limit
  rate-limit.ts
  background.ts          # run work after the response (after())
  prompt.ts              # chat system prompt
  quote.ts               # worker rate -> quote
  booking-draft.ts       # draft validation
  pricing.ts             # pure price maths and badge (browser-safe)
  market-price.ts        # typical price from completed jobs
  embedding-utils.ts     # worker text, hash, vector literal (shared with the script)
  embeddings.ts          # embed and store worker vectors
  vector-search.ts       # pgvector similarity query
  worker-search.ts       # semantic + keyword search for the chat
  review-summary-utils.ts / review-summary.ts
  tools/                 # searchWorkers, getQuote, + index.ts (address, prepareBooking, status)
app/api/ai/chat/         # streaming chat endpoint
app/api/ai/health/       # model health check
app/api/pricing/         # typical price lookup
components/ai-chat/      # chat-widget, worker-card, confirm-card, chat-mount
components/review-summary.tsx, components/price-insight.tsx
prisma/migrations/       # *_add_worker_embedding, *_add_review_summary
scripts/backfill-embeddings.mjs
tests/ai/
```

## 6. User Flow

1. The user opens the chat widget and types: "Plumber in Pune tomorrow 10am."
2. The LLM extracts the skill, city, and time (`chrono-node` helps with dates).
3. `searchWorkers` queries Prisma and pgvector, and worker cards appear in chat.
4. The user picks a worker.
5. Auto-fill happens:
   - The profile address is offered with **Yes / Change** buttons.
   - The time is already parsed.
   - `getQuote` computes the price.
6. The bot asks only for missing info, one question at a time, with quick-reply chips.
7. A confirmation card shows the worker, slot, address, and price.
8. The user taps **Confirm Booking** and the card posts to the existing `/api/jobs`, which creates a `PENDING` job through `createJob`. The model has no tool that creates bookings.
9. The user gets a booking confirmation. The worker sees the job as usual, and payment stays in the existing completion flow.
10. `getBookingStatus` handles follow-ups such as "Where's my worker?"

## 7. Phases

### Phase 0: Prep (about 0.5 day)
- Read the Prisma schema, booking and search routes, and existing tests.
- Create the branch `feat/ai-assistant`.
- Add the `.env.example` entries.
- **Done when:** the plan is adjusted to the real schema and routes.

### Phase 1: AI foundation (about 1 day)
- Build `provider.ts` (primary and fallback client), rate limiting, shared Zod schemas, and error handling.
- Add `/api/ai/health` to verify the keys.
- **Safety:** only new files, no existing code touched.
- **Done when:** the health route returns a model response, and everything is a no-op with `AI_ENABLED=false`.

### Phase 2: Chatbot with booking (2-3 days)
- Implement the four tools, **reusing existing service and Prisma logic** instead of duplicating it.
- Build `/api/ai/chat` as a streaming route protected by Clerk, rate limiting, and the flag.
- Build the chat widget, worker cards, confirmation card, and address prompt.
- The explicit **Confirm** step is mandatory. Payment stays in the existing completion flow.
- **Done when:** a full booking from chat matches one made through the normal UI.

### Phase 3: Semantic search (1-2 days)
- Add a Prisma migration that enables pgvector and adds a **nullable** embedding column.
- Run `backfill-embeddings.ts` for existing workers, and re-embed on profile updates.
- **Fallback:** if embedding or vector search fails, use the current keyword search.
- **Done when:** Hindi, Marathi, and English queries return relevant workers.

### Phase 4: Review summaries (1-2 days)
- Add a nullable `reviewSummary` field (summary and tags) on the worker.
- Regenerate it **asynchronously** after a review is saved, so submitting a review never waits on the AI.
- Trigger only after a minimum number of reviews (for example, 5).
- Show it on cards only when present.
- **Done when:** summaries appear and the review flow is unchanged.

### Phase 5: Smart pricing (1-2 days)
- Write a pure function that computes percentiles over completed bookings by skill, city, and job type.
- Use seeded fallback ranges when there is little data.
- Feed the result into the worker rate hint, the customer badge, and `getQuote`.
- **Done when:** the badge and quote are consistent and have unit tests.

### Phase 6: Hardening and release (about 1 day)
- Add Vitest tests for tools, pricing, and the provider fallback.
- Run lint and build, test manually end to end, and test on a Vercel preview.
- Enable `AI_ENABLED=true` in preview first, then production.
- **Done when:** the checklist below is complete.

**Total estimate:** about 1.5-2 weeks.

## 8. Safeguards

- Tools run **server-side** under the Clerk user's identity. The model never receives raw user IDs it can override.
- All tool inputs are validated with Zod.
- Per-user rate limits, plus a cap on tool-call steps per message.
- API keys live only in server-side Vercel environment variables.
- Prompts and outputs are logged (without secrets or sensitive data) for debugging.
- Streaming responses keep chat fast and within Vercel function time limits.
- Cached summaries and embeddings keep LLM calls low, so free-tier quotas last longer.

## 9. Release Checklist

**Verified by automated checks**
- [x] With `AI_ENABLED` unset the widget does not render and AI routes return 404; no AI query runs on existing pages
- [x] Type-check, lint (no errors), 138 unit tests and the production build pass
- [x] Migrations are additive: two new tables, no change to existing tables
- [x] The model cannot create bookings (no such tool; booking goes through `/api/jobs`)
- [x] Tools only read data for the signed-in user (booking status is scoped to the customer)
- [x] Fallback model is used on 429, 5xx and network errors; client errors are not retried
- [x] Semantic search, review summaries and price lookups all fall back quietly when unavailable
- [x] Review text is treated as untrusted data; summaries are length-limited and reject links and phone numbers

**Needs a person with credentials (not yet run)**
- [ ] Apply the two migrations to a **dev** database (needs pgvector), then run `npm run ai:backfill-embeddings`
- [ ] Confirm the chosen model really supports tool calling by completing one booking from chat end to end
- [ ] Compare a chat booking with a normal booking (address, price, job appears for the worker)
- [ ] Try Hindi and Marathi queries and tune `MIN_SIMILARITY` in `lib/ai/vector-search.ts` if results are too loose or strict
- [ ] Check review summary quality with real reviews
- [ ] Replace the placeholder estimate ranges in `lib/ai/pricing.ts` (`SEED_RANGES`) with real numbers, or remove them
- [ ] Verify the fallback provider by forcing a failure on the primary
- [ ] Deploy to a Vercel preview with `AI_ENABLED=true`, then production

## Known limitations

- Rate limits are per server instance (in memory). Use a shared store such as Upstash if abuse becomes a concern.
- Free LLM tiers have request quotas, and model availability changes. Keep a fallback configured.
- Worker-written text (name, skills) reaches the model through search results. The model cannot book on its own, so the worst case is a misleading draft that the customer still has to confirm, but it is worth monitoring.
- Price ranges are quartiles of whole-job charges, so they are wide for mixed job sizes. The badge needs 5+ completed jobs for the skill.
- The 1024-dimension embedding column fits `bge-m3`. A different dimension needs a new migration.
- Applying the embedding migration requires pgvector on the database; `prisma migrate deploy` will fail on databases without it.

## 10. Later Extras (out of scope)

Photo-based quotes, voice booking (Whisper), KYC auto-check (OCR and face match), and an admin analytics chat. A tool layer ported to the NearServe project (swap Prisma calls for Firestore).
