# Gap Step Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a standalone global gap-distribution page between the current template-selection page and the resume refinement page, then enter refinement with optimize-processed results already populated.

**Architecture:** Keep the data pipeline unchanged up to Draft JSON and Gap API generation, but move the gap-distribution UI out of the branch editor and into its own step. After the user submits that new step, run memory-writer plus affected-sandbox optimize calls, then route into the existing refinement workspace with optimized versions already staged.

**Tech Stack:** Next.js App Router, React state in `src/app/page.tsx`, existing branch gap distribution helpers, node test, ESLint, TypeScript.

---

### Task 1: Step Flow Reindex

**Files:**
- Modify: `src/app/page.tsx`

- [ ] Move the current refinement page from step `5` to step `6`
- [ ] Move the current export page from step `6` to step `7`
- [ ] Repurpose step `4` into the standalone global gap distribution page
- [ ] Update `visibleSteps`, `stepMeta`, `setCurrentStep(...)`, and dependent `useEffect` transitions

### Task 2: Standalone Gap Page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] Remove the embedded global gap form block from the branch editor area
- [ ] Render the global gap form as the full content of the new step `4`
- [ ] Keep existing card behavior: experience selection, skip option, why-this-gap copy, guide toggle, textarea, validation

### Task 3: Optimize Handoff Into Refinement

**Files:**
- Modify: `src/app/page.tsx`

- [ ] After global gap submission completes, auto-run memory writer and optimize for affected experience sandboxes
- [ ] On success, auto-transition to step `6`
- [ ] Ensure step `6` overview cards render optimize-processed versions instead of raw Draft versions when available

### Task 4: Verification

**Files:**
- Test: `src/lib/branch-gap-distribution.test.mjs`

- [ ] Run `node --test src/lib/branch-gap-distribution.test.mjs`
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
