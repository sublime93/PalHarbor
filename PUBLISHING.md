# Public repository checklist

The local history-preparation step is complete:

- [x] Rewrote the original history to use the owner's verified GitHub noreply
      address and removed `apps/web/public/maps` from every published tree. The
      map-only commit was pruned, leaving six clean commits.

Complete these repository-owner steps before making PalHarbor public:

- [x] Add the MIT License and state the contribution terms.
- [x] Add the final GitHub URL to package and documentation metadata.
- Set the repository description, topics, homepage, and social preview.
- Publish from a fresh clone with `git push origin main`. Do not use
  `git push --mirror` or publish this workspace's private `refs/codex/`
  checkpoint refs.
- Protect `main`: require the `verify` CI job, require the branch to be current,
  dismiss stale approvals, block force pushes, and block branch deletion.
- Enable Dependabot alerts and security updates, secret scanning and push
  protection, and private vulnerability reporting.
- Keep Actions permissions read-only by default and approve new third-party
  Actions or dependency build scripts deliberately.
- Run `pnpm check`, `pnpm test:e2e`, the production dependency audit, and a
  container smoke test from the exact history that will be published.
- Create a signed semantic-version tag such as `v1.0.0`, push it, and publish a
  GitHub release only after the clean-history clone passes those checks. The
  release workflow reruns the complete verification gate before publishing
  `ghcr.io/sublime93/palharbor` with version, minor, commit, and—only for stable
  releases—`latest` tags plus a provenance attestation.
- After the first package publish, confirm the GHCR package is public and still
  linked to this repository so anonymous pulls and inherited workflow access
  behave as intended.

After publication, review `SECURITY.md`, supported-version wording, dependency
alerts, and the data-retention defaults for every release.
