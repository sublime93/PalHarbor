# Public repository checklist

The local history-preparation step is complete:

- [x] Rewrote the original history to use the owner's verified GitHub noreply
      address and removed `apps/web/public/maps` from every published tree. The
      map-only commit was pruned, leaving six clean commits.

Complete these repository-owner steps before making PalHarbor public:

- [x] Add the MIT License and state the contribution terms.
- Set the repository description, topics, homepage, and social preview after
  the final GitHub URL is known; then add that URL to the package metadata.
- Publish from a fresh clone with `git push origin main` (and explicit release
  tags). Do not use `git push --mirror` or publish this workspace's private
  `refs/codex/` checkpoint refs.
- Protect `main`: require the `verify` CI job, require the branch to be current,
  dismiss stale approvals, block force pushes, and block branch deletion.
- Enable Dependabot alerts and security updates, secret scanning and push
  protection, and private vulnerability reporting.
- Keep Actions permissions read-only by default and approve new third-party
  Actions or dependency build scripts deliberately.
- Run `pnpm check`, `pnpm test:e2e`, the production dependency audit, and a
  container smoke test from the exact history that will be published.
- Create the first signed tag and GitHub release only after the clean-history
  clone passes those checks.

After publication, review `SECURITY.md`, supported-version wording, dependency
alerts, and the data-retention defaults for every release.
