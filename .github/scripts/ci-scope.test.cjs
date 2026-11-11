const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyPaths, diffBase } = require("./ci-scope.cjs");

test("desktop source and dependency changes only select desktop", () => {
  assert.deepEqual(classifyPaths(["src/main.ts", "package-lock.json", ".nvmrc"]), {
    desktop: true,
    build: true,
  });
});

test("shared CI configuration selects desktop and build", () => {
  for (const path of [
    ".github/workflows/ci-changes.yml",
    ".github/workflows/codeql.yml",
    ".github/scripts/ci-scope.cjs",
    ".github/dependabot.yml",
    ".gitattributes",
  ]) {
    assert.deepEqual(classifyPaths([path]), { desktop: true, build: true });
  }
});

test("desktop docs do not require packaging", () => {
  assert.deepEqual(
    classifyPaths(["README.md", "docs/setup.md", "LICENSE", ".github/ISSUE_TEMPLATE/bug.yml"]),
    {
      desktop: true,
      build: false,
    }
  );
});

test("desktop workflows select desktop and build", () => {
  assert.deepEqual(
    classifyPaths([
      ".github/workflows/build-and-notarize.yml",
      ".github/workflows/lockfile-lint.yml",
    ]),
    {
      desktop: true,
      build: true,
    }
  );
});

test("handles large diffs and unusual file names without truncation", () => {
  const paths = Array.from({ length: 500 }, (_, index) => `src/file-${index}.ts`);
  paths.push("src/file with\na newline.ts");
  assert.deepEqual(classifyPaths(paths), { desktop: true, build: true });
});

test("empty diff selects neither", () => {
  assert.deepEqual(classifyPaths([]), { desktop: false, build: false });
});

test("PRs compare against the merge parent and pushes cover every pushed commit", () => {
  const before = "a".repeat(40);
  assert.equal(diffBase("pull_request", {}), "HEAD^1");
  assert.equal(diffBase("push", { before }), before);
  assert.equal(diffBase("push", { before: "0".repeat(40) }), null);
  assert.equal(diffBase("push", { before: "--invalid" }), null);
  assert.equal(diffBase("workflow_dispatch", {}), null);
  assert.equal(diffBase("schedule", {}), null);
});
