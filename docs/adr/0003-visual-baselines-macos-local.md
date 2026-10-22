# ADR-0003: Visual-diff baselines are generated on the Mac, not in a container

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Scott
**Context:** Issue #540

## Decision

`toHaveScreenshot()` baselines are generated and compared on Scott's Mac only (Playwright's `-darwin` snapshots): exact-pinned `@playwright/test`, Playwright's bundled Chromium, self-hosted fonts from `static/fonts`. CI excludes the visual project. A macOS update that shifts rasterization is handled by one regenerate-all commit, approved in the visual sweep.

## Why

Every agent session and Scott's visual sweep run on this one Mac, so that is where a diff must be stable. CI e2e is report-only today (#341), so a CI-side visual gate would buy nothing yet. The Mac has no Docker/Colima; a container would add a VM boot to every run.

## Considered and rejected

- **Playwright's Docker image locally and in CI (linux baselines).** The most stable cross-machine option, but needs Colima on the Mac and slows every local run; worth it only once e2e becomes a CI gate.
- **Generate baselines in CI only.** Local runs would never match linux baselines, so agents could never get a clean pass locally.

## Consequences

- Visual diffs never run in CI; a contributor on another OS can't verify against the baselines.
- A loose `^` Playwright range or a system-Chrome channel would silently invalidate baselines, so the version stays exact-pinned.
- Revisit when CI e2e becomes blocking: move to the container image and regenerate as linux baselines.
