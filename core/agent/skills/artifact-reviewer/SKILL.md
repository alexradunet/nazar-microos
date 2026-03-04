---
name: artifact-reviewer
description: Checklist-driven review for evaluating system packages and npm dependencies before adoption.
---

# Artifact Reviewer Skill

Use this skill when evaluating a new package (system package, npm, or other) for adoption into the Bloom project.

## Purpose

Ensure every dependency meets freshness, security, maintenance, and size standards before it enters the project. Follow the principle: system tools via Containerfile (dnf install) or container images, application dependencies via npm.

## Review Checklist

### 1. Package Source Evaluation

Before adopting any dependency, determine the right source:

- **System-level tools** (CLI utilities, daemons, libraries): prefer adding to the Containerfile (dnf install) or container images.
  ```bash
  # Add to Containerfile: RUN dnf install -y <package>
  podman search <image>            # for containerized services
  ```
- **Node.js application dependencies** (libraries, frameworks): use npm.
  ```bash
  npm view <package> version
  npm view <package> time.modified
  ```
- Document why the chosen source is appropriate for this dependency.

### 2. Freshness

- **System packages**: check the version available in Fedora repos vs upstream.
  ```bash
  bootc status      # check current image
  ```
- **npm packages**: must have been published within the last 18 months.
  ```bash
  npm view <package> time.modified
  ```
- Flag stale packages. `gray-matter` (last published 2019) is an example of a banned dependency.

### 3. Security

- **npm packages**: run `npm audit` and review findings.
  ```bash
  npm audit
  ```
- **System packages**: check for pending security updates.
  ```bash
  bootc upgrade --check
  ```
- Check for known CVEs in the package and its transitive dependencies.
- Any critical or high severity vulnerability is a blocking issue.

### 4. Maintenance

- **Upstream activity**: check the source repository for recent commits (within 12 months).
- **Maintainer count**: at least 1 active maintainer required.
- **Issue/PR responsiveness**: review whether the maintainers respond to issues.
- For system packages, check if the package is in the official Fedora repositories (vs third-party).

### 5. Dependency Footprint

- Evaluate the number and size of transitive dependencies.
- For npm packages:
  ```bash
  npm pack --dry-run <package> 2>&1 | tail -1  # check package size
  ```
- Prefer packages with minimal transitive dependencies.
- Flag packages that add excessive disk usage without justification.

### 6. License Compatibility

- Verify license is compatible with the project (MIT, Apache-2.0, BSD preferred).
- Flag copyleft licenses (GPL) for review — they may impose constraints.
- For npm packages:
  ```bash
  npm view <package> license
  ```

## Verdict

After completing the checklist, issue one of:

- **approve**: Package meets all criteria. Safe to adopt.
- **conditional-approve**: Package is acceptable with noted conditions (e.g., "pin to version X", "replace when better alternative matures").
- **reject**: Package fails one or more critical criteria. Document the reasons and suggest alternatives.

## Required Output

Produce a structured review:

```
Package: <name>
Source: <containerfile | container | npm | other>
Version: <version evaluated>

1. Source: [appropriate | review — reason]
2. Freshness: [pass | warn — last published <date> | fail]
3. Security: [pass | fail — <CVE details>]
4. Maintenance: [pass | warn | fail]
5. Dep Footprint: [pass | warn — <size/count> | fail]
6. License: [pass | review — <license>]

Verdict: [approve | conditional-approve | reject]
Conditions: <if applicable>
```
