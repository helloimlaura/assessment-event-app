/** Copies `schema.sql` into the compiled output.
 *
 *  `tsc` emits .js and nothing else, so the schema file `openDatabase` reads
 *  at runtime does not travel with the build. Without this step
 *  `npm run build && npm start` compiles cleanly and dies with ENOENT on first
 *  boot — invisible to `tsc`, to the tests, and to every `tsx` script, all of
 *  which read the file from `src/`.
 *
 *  The target is *found*, not assumed. `tsc` puts the compiled db module at a
 *  path that depends on `rootDir`, which here is `..` because the build also
 *  includes `../shared`. Pinning that literal path would turn a legitimate
 *  tsconfig change into either a silent no-copy or a build failure demanding
 *  this script be edited in lockstep; locating `db/index.js` under `dist` and
 *  copying alongside it stays correct through either.
 */
const { copyFileSync, existsSync, readdirSync, statSync } = require('node:fs')
const { join, sep } = require('node:path')

const SERVER_ROOT = join(__dirname, '..')
const SOURCE = join(SERVER_ROOT, 'src', 'db', 'schema.sql')
const DIST = join(SERVER_ROOT, 'dist')

/** Directories under dist holding a compiled `db/index.js` — normally one. */
function findDbModules(dir, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) findDbModules(path, found)
    else if (entry === 'index.js' && dir.endsWith(`${sep}db`)) found.push(dir)
  }
  return found
}

if (!existsSync(SOURCE)) {
  throw new Error(`copy-schema: no schema to copy at ${SOURCE}`)
}

const targets = findDbModules(DIST)

if (targets.length === 0) {
  throw new Error(
    `copy-schema: found no compiled db/index.js under ${DIST}. Either tsc emitted ` +
      `nothing, or the db module moved — the schema would not ship, so the build stops here.`,
  )
}

for (const dir of targets) {
  const target = join(dir, 'schema.sql')
  copyFileSync(SOURCE, target)
  console.log(`copied schema.sql -> ${target}`)
}
