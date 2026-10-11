"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { record, ROOT, NODE, stageInstall } = require("../helpers");
const { getGitInfo } = require("../../src/lib/git");
const {
  renderStatusline,
  sampleData,
  defaultConfig,
  mergeConfig,
} = require("../../src/lib/shared");
const { VALID_WIDGET_IDS } = require("../../src/lib/config");

// Valid JSON with the wrong types: every widget, both layouts, every field of
// the sample payload swapped for each bad value. The bar must render and never
// show "[object Object]".
function testWrongPayloadTypes() {
  const widgets = [...VALID_WIDGET_IDS].filter((id) => id !== "exec").map((id) => ({ id }));
  const configs = ["pills", "lines"].map((layout) => mergeConfig({ layout, widgets }));
  const failures = [];
  const check = (label, payload) => {
    for (const config of configs) {
      try {
        const out = renderStatusline(payload, config, { color: "none" });
        if (out.includes("[object Object]")) {
          failures.push(`${label} (${config.layout}): [object Object]`);
        }
      } catch (err) {
        failures.push(`${label} (${config.layout}): ${err.message}`);
      }
    }
  };

  for (const payload of [null, [], "text", 5]) {
    check(`payload ${JSON.stringify(payload)}`, payload);
  }

  const base = sampleData();
  const leaves = [];
  (function walk(obj, at) {
    for (const [key, value] of Object.entries(obj)) {
      leaves.push([...at, key]);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        walk(value, [...at, key]);
      }
    }
  })(base, []);

  for (const at of leaves) {
    for (const bad of [{ x: 1 }, ["a"], 123, true, null, 1e12, -5]) {
      const data = structuredClone(base);
      let parent = data;
      for (const key of at.slice(0, -1)) {
        parent = parent[key];
      }
      parent[at[at.length - 1]] = bad;
      check(`${at.join(".")}=${JSON.stringify(bad)}`, data);
    }
  }

  record(
    "the bar renders any payload field of the wrong type",
    failures.length === 0,
    failures.slice(0, 5).join("; ")
  );

  // The flex separator pads to terminal_width; a huge value must not allocate it.
  const widths = [1e12, "Infinity", -1, "wide"].map((width) => {
    try {
      return renderStatusline({ terminal_width: width }, defaultConfig(), { color: "none" }).length;
    } catch {
      return -1;
    }
  });
  record(
    "a bogus terminal_width neither throws nor pads past 1000 columns",
    widths.every((length) => length >= 0 && length < 5000),
    widths.join(", ")
  );
}

// Several agy windows refresh at once and share the exec cache. A reader must
// never see a half-written file while other processes rewrite it.
async function testConcurrentExecCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-exec-cache-"));
  fs.writeFileSync(path.join(dir, "statusline.config.json"), "{}");
  const lib = path.join(ROOT, "src", "lib").replace(/\\/g, "/");
  const writer = [
    `const { setConfigDir } = require("${lib}/config");`,
    `const { saveDiskCache } = require("${lib}/exec");`,
    `setConfigDir(${JSON.stringify(dir)});`,
    "const big = { output: 'x'.repeat(200000), timestamp: Date.now() };",
    "for (let i = 0; i < 150; i++) saveDiskCache({ [String(i)]: big });",
  ].join("\n");

  const writers = Array.from({ length: 4 }, () => spawn(NODE, ["-e", writer], { stdio: "ignore" }));
  const done = Promise.all(writers.map((child) => new Promise((ok) => child.on("exit", ok))));
  const file = path.join(dir, ".exec-cache.json");
  let reads = 0;
  let torn = 0;
  let finished = false;
  done.then(() => {
    finished = true;
  });

  while (!finished) {
    try {
      JSON.parse(fs.readFileSync(file, "utf8"));
      reads += 1;
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "EBUSY" && err.code !== "EPERM") {
        torn += 1;
      }
    }
    await new Promise((ok) => setImmediate(ok));
  }

  const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
  fs.rmSync(dir, { recursive: true, force: true });
  record(
    "the exec cache is never seen half-written while other processes write it",
    torn === 0 && reads > 0 && leftovers.length === 0,
    `${reads} reads, ${torn} torn, ${leftovers.length} temp files left`
  );
}

async function run() {
  testGitLookup();
  testWrongPayloadTypes();
  await testConcurrentExecCache();

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "agy-verify-bad-json-"));
  stageInstall(sandbox);
  const statuslinePath = path.join(sandbox, "statusline.js");

  try {
    const cliRes = spawnSync(NODE, [path.join(ROOT, "src", "index.js"), "render"], {
      input: "{bad json}",
      encoding: "utf8",
    });
    record(
      "render on bad JSON outputs hint on stdout and diagnostic on stderr",
      cliRes.status === 0 &&
        /invalid JSON/i.test(cliRes.stdout) &&
        /invalid JSON/i.test(cliRes.stderr),
      `code ${cliRes.status}`
    );

    const runtimeRes = spawnSync(NODE, [statuslinePath], {
      input: "not valid json at all",
      encoding: "utf8",
    });
    record(
      "runtime statusline.js on bad JSON outputs hint on stdout and diagnostic on stderr",
      runtimeRes.status === 0 &&
        /invalid JSON/i.test(runtimeRes.stdout) &&
        /invalid JSON/i.test(runtimeRes.stderr),
      `code ${runtimeRes.status}`
    );

    const emptyRes = spawnSync(NODE, [statuslinePath], {
      input: "",
      encoding: "utf8",
    });
    record(
      "runtime statusline.js on empty input exits silently with code 0",
      emptyRes.status === 0 && emptyRes.stdout === "" && emptyRes.stderr === "",
      `code ${emptyRes.status}`
    );

    // Node's "Unexpected token" error quotes the input, escape sequences included.
    const hostile = "SECRET\u001b]52;c;x\u0007";
    const echoes = (text) => text.includes("\u001b") || text.includes("SECRET");
    const cliHostile = spawnSync(NODE, [path.join(ROOT, "src", "index.js"), "render"], {
      input: hostile,
      encoding: "utf8",
    });
    const runtimeHostile = spawnSync(NODE, [statuslinePath], {
      input: hostile,
      encoding: "utf8",
    });
    record(
      "bad JSON diagnostics on stderr never quote the input",
      /invalid JSON/i.test(cliHostile.stderr) &&
        /invalid JSON/i.test(runtimeHostile.stderr) &&
        !echoes(cliHostile.stderr) &&
        !echoes(runtimeHostile.stderr),
      JSON.stringify(runtimeHostile.stderr)
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

// A fake repo (no git binary needed): .git/HEAD on a named branch.
function fakeRepo(root, name, branch) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), `ref: refs/heads/${branch}\n`);
  return dir;
}

function testGitLookup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-verify-git-"));

  try {
    const repo = fakeRepo(root, "repo", "real-branch");
    fs.mkdirSync(path.join(repo, "src", "lib"), { recursive: true });

    record(
      "an existing folder inside a repo shows that repo's branch",
      getGitInfo(repo)?.branch === "real-branch" &&
        getGitInfo(path.join(repo, "src", "lib"))?.branch === "real-branch"
    );

    // Worktrees: .git is a file pointing at the real git dir.
    const worktreeGitDir = path.join(root, "worktree-gitdir");
    fs.mkdirSync(worktreeGitDir, { recursive: true });
    fs.writeFileSync(path.join(worktreeGitDir, "HEAD"), "ref: refs/heads/wt-branch\n");
    const worktree = path.join(root, "worktree");
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${worktreeGitDir}\n`);
    record(
      "a worktree (.git file) still resolves its branch",
      getGitInfo(worktree)?.branch === "wt-branch"
    );

    record(
      "a missing absolute folder or an empty cwd has no branch",
      getGitInfo(path.join(repo, "does", "not", "exist")) === null && getGitInfo("") === null
    );

    // The process runs inside a repo with a recognizable branch; relative and
    // missing payload paths must not pick it up.
    const leaky = fakeRepo(root, "surrounding", "leaked-branch");
    const probe = spawnSync(
      NODE,
      [
        "-e",
        `const g = require(${JSON.stringify(path.join(ROOT, "src", "lib", "git.js"))});
         console.log(JSON.stringify(["Projects/app", "C:/Projects/app", "./x"].map(g.getGitInfo)));`,
      ],
      { cwd: leaky, encoding: "utf8" }
    );
    record(
      "relative or Windows-style paths never pick up the surrounding checkout",
      probe.stdout.trim() === "[null,null,null]",
      probe.stdout.trim() || probe.stderr
    );

    const home = path.join(root, "home");
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      AGY_POWERLINE_HOME: path.join(home, ".agy-powerline"),
    };
    const payload = JSON.stringify({
      model: { display_name: "Gemini" },
      cwd: "C:/Projects/agy-powerline",
      terminal_width: 120,
    });
    const rendered = spawnSync(NODE, [path.join(ROOT, "src", "index.js"), "render"], {
      cwd: leaky,
      input: payload,
      encoding: "utf8",
      env,
    });
    record(
      "the bar shows no git pill for a payload folder that isn't on this machine",
      rendered.status === 0 &&
        /Gemini/.test(rendered.stdout) &&
        !/leaked-branch/.test(rendered.stdout),
      `exit ${rendered.status}`
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { run };
