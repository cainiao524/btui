// Generates the publishable tree for each backend repository from this source repo.
//
//   node scripts/release.mjs [version] [--only qbittorrent|transmission] [--out release-out]
//                            [--compare <dir containing the existing repo checkouts>]
//                            [--open-pr]
//
// Without --open-pr nothing leaves this machine: each tree is written to <out>/<packageName>
// and, with --compare, diffed against an existing checkout of that repository. With --open-pr
// the tree is committed to a `release/v<version>` branch of the target repository and a draft
// PR is opened through the authenticated gh CLI; merging and tagging stay manual.
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const BACKENDS = ["qbittorrent", "transmission"]
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-\d+)?$/
// Files at the root of this repo that each backend repository replaces with its own copy.
const REPO_SPECIFIC = new Set(["README.md", "DOCKERHUB.md", "CHANGELOG.md", "Dockerfile", "docker-compose.yml", "docker-compose.webui.yml", "nginx.conf", ".dockerignore"])
const SOURCE_ONLY = [".github/", "release/", "scripts/release.mjs"]

function parseArgs(argv) {
  const options = { version: null, only: null, out: "release-out", compare: null, openPr: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--only") options.only = argv[++index]
    else if (arg === "--out") options.out = argv[++index]
    else if (arg === "--compare") options.compare = argv[++index]
    else if (arg === "--open-pr") options.openPr = true
    else if (!arg.startsWith("--") && !options.version) options.version = arg
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.only && !BACKENDS.includes(options.only)) throw new Error(`--only expects one of ${BACKENDS.join(", ")}`)
  if (options.version && !VERSION_PATTERN.test(options.version)) throw new Error(`Version must look like 1.2.3 or 1.2.3-1, got ${options.version}`)
  return options
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const run = (command, args, cwd = ROOT) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })

// package.json carries the shared base version; a single-backend hotfix (--only, X.Y.Z-N)
// only changes that backend's displayed version, and its release tree gets it back in package.json.
function bumpVersion(version, backends, only) {
  const packageFile = path.join(ROOT, "package.json")
  const packageJson = readJson(packageFile)
  if (only) {
    const base = version.replace(/-\d+$/, "")
    if (base !== packageJson.version.replace(/-\d+$/, "")) {
      throw new Error(`--only is for hotfixes of the current version ${packageJson.version}; bump both backends to change the base version`)
    }
  } else {
    packageJson.version = version
    writeJson(packageFile, packageJson)
  }
  for (const backend of backends) {
    const { displaySuffix } = readJson(path.join(ROOT, "backends", backend, "release.json"))
    const configFile = path.join(ROOT, "backends", backend, "config.ts")
    const config = readFileSync(configFile, "utf8")
    const next = config.replace(/version: "[^"]+"/, `version: "v${version}-${displaySuffix}"`)
    if (next === config && !config.includes(`version: "v${version}-${displaySuffix}"`)) throw new Error(`Could not update version in ${configFile}`)
    writeFileSync(configFile, next)
  }
}

function backendVersion(backend, release) {
  const config = readFileSync(path.join(ROOT, "backends", backend, "config.ts"), "utf8")
  const display = config.match(/version: "v([^"]+)"/)?.[1]
  if (!display?.endsWith(`-${release.displaySuffix}`)) throw new Error(`backends/${backend}/config.ts version must end with -${release.displaySuffix}`)
  return display.slice(0, -release.displaySuffix.length - 1)
}

function renderWorkflow(template, backend, release) {
  return template
    .replaceAll("__REPO__", release.packageName)
    .replaceAll("__STAGING_PKG__", release.stagingPackage)
    .replaceAll("__CANDIDATE_PREFIX__", release.candidatePrefix)
    .replaceAll("__DISPLAY_SUFFIX__", release.displaySuffix)
    .replaceAll("__TAG_SUFFIX__", release.tagSuffix)
    .replaceAll("__BACKEND__", backend)
    .replaceAll("__DOCKERHUB_SHORT_DESC__", release.dockerHubShortDescription)
}

function trackedFiles() {
  return run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean)
}

function buildTree(backend, outDir, sourceCommit) {
  const release = readJson(path.join(ROOT, "backends", backend, "release.json"))
  const target = path.join(outDir, release.packageName)
  rmSync(target, { recursive: true, force: true })

  for (const file of trackedFiles()) {
    if (REPO_SPECIFIC.has(file) || file.startsWith("docker/") || SOURCE_ONLY.some((prefix) => file.startsWith(prefix))) continue
    if (!existsSync(path.join(ROOT, file))) continue
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true })
    cpSync(path.join(ROOT, file), path.join(target, file))
  }

  const overlay = path.join(ROOT, "backends", backend, "repo")
  cpSync(overlay, target, { recursive: true })

  const workflowDir = path.join(target, ".github", "workflows")
  mkdirSync(workflowDir, { recursive: true })
  for (const name of readdirSync(path.join(ROOT, "release", "workflows"))) {
    const template = readFileSync(path.join(ROOT, "release", "workflows", name), "utf8")
    writeFileSync(path.join(workflowDir, name), renderWorkflow(template, backend, release))
  }

  const packageFile = path.join(target, "package.json")
  const packageJson = readJson(packageFile)
  packageJson.name = release.packageName
  packageJson.version = backendVersion(backend, release)
  packageJson.backend = backend
  writeJson(packageFile, packageJson)

  writeFileSync(path.join(target, ".github", "SYNCED_FROM"), `${sourceCommit}\n`)
  return { release, target, version: packageJson.version }
}

function compareTree(target, existing) {
  if (!existsSync(existing)) {
    console.log(`  (no checkout at ${existing}, skipped comparison)`)
    return
  }
  try {
    run("git", ["diff", "--no-index", "--stat", "--ignore-cr-at-eol", "--", existing, target])
    console.log("  identical to existing checkout")
  } catch (error) {
    console.log(error.stdout)
  }
}

function openPullRequest({ release, target }, version) {
  const branch = `release/v${version}-${release.tagSuffix}`
  const workdir = path.join(path.dirname(target), `.${release.packageName}-push`)
  rmSync(workdir, { recursive: true, force: true })
  run("gh", ["repo", "clone", release.repository, workdir, "--", "--depth", "50"])
  const synced = path.join(workdir, ".github", "SYNCED_FROM")
  const log = run("git", ["log", "--format=%H %s", "-n", "20"], workdir)
  if (existsSync(synced)) {
    // Stop if the target repo has commits that did not come from this sync, so they are never overwritten.
    const manual = run("git", ["log", "--format=%H", `${run("git", ["log", "-n", "1", "--format=%H", "--", ".github/SYNCED_FROM"], workdir).trim()}..HEAD`], workdir).trim()
    if (manual) throw new Error(`${release.repository} has commits after the last sync; port them first:\n${manual}`)
  } else {
    console.log(`  first sync into ${release.repository}; recent history:\n${log}`)
  }
  run("git", ["checkout", "-b", branch], workdir)
  for (const entry of readdirSync(workdir)) if (entry !== ".git") rmSync(path.join(workdir, entry), { recursive: true, force: true })
  cpSync(target, workdir, { recursive: true })
  run("git", ["add", "-A"], workdir)
  run("git", ["commit", "-m", `同步发布 v${version}-${release.tagSuffix}`], workdir)
  run("git", ["push", "-u", "origin", branch], workdir)
  console.log(run("gh", ["pr", "create", "--draft", "--repo", release.repository, "--head", branch, "--title", `发布 v${version}-${release.tagSuffix}`, "--body", "由统一源码仓同步生成。合并后打标签即触发 Docker Hub / GHCR 发布。"], workdir))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const backends = options.only ? [options.only] : BACKENDS
  if (options.version) bumpVersion(options.version, backends, options.only)
  const sourceCommit = run("git", ["rev-parse", "HEAD"]).trim()
  const outDir = path.resolve(ROOT, options.out)

  for (const backend of backends) {
    const result = buildTree(backend, outDir, sourceCommit)
    console.log(`${backend}: ${path.relative(ROOT, result.target)} (v${result.version}-${result.release.tagSuffix})`)
    if (options.compare) compareTree(result.target, path.resolve(options.compare, result.release.packageName))
    if (options.openPr) openPullRequest(result, result.version)
  }
}

main()
