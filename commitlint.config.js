// Every commit's title in Conventional Commits (Decision "Release versions"): `type(scope): subject`, which
// semantic-release reads to version each merge to main (feat → minor, fix and perf → patch; docs, test, refactor, ci,
// build, chore → none). Checked on every pull request (.github/workflows/commits.yml) and by `npm run lint:commits`.
export default { extends: ['@commitlint/config-conventional'] }
