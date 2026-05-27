// Patches node-pty gyp files to fix build issues on Windows:
// 1. Replaces GetCommitHash.bat shell command with static value (path resolution issue)
// 2. Replaces UpdateGenVersion.bat with static include dir + generates header
// 3. Disables Spectre mitigation requirement (needs separate VS component)

const fs = require('fs')
const path = require('path')

const nodePtyDir = path.join(__dirname, '..', 'node_modules', 'node-pty')
if (!fs.existsSync(nodePtyDir)) {
  console.log('node-pty not installed yet, skipping patch')
  process.exit(0)
}

// Patch winpty.gyp
const winptyGyp = path.join(nodePtyDir, 'deps', 'winpty', 'src', 'winpty.gyp')
if (fs.existsSync(winptyGyp)) {
  let content = fs.readFileSync(winptyGyp, 'utf-8')
  content = content.replace(
    `'<!(cmd /c "cd shared && GetCommitHash.bat")'`,
    `'none'`
  )
  content = content.replace(
    /'\<!\(cmd \/c "cd shared && UpdateGenVersion\.bat.*?\)'/,
    `'gen'`
  )
  content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'")
  fs.writeFileSync(winptyGyp, content)
  console.log('Patched winpty.gyp')
}

// Generate version header
const genDir = path.join(nodePtyDir, 'deps', 'winpty', 'src', 'gen')
fs.mkdirSync(genDir, { recursive: true })
const versionFile = path.join(nodePtyDir, 'deps', 'winpty', 'VERSION.txt')
const version = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf-8').trim() : '0.0.0'
fs.writeFileSync(
  path.join(genDir, 'GenVersion.h'),
  `// AUTO-GENERATED\nconst char GenVersion_Version[] = "${version}";\nconst char GenVersion_Commit[] = "none";\n`
)
console.log('Generated GenVersion.h')

// Patch binding.gyp
const bindingGyp = path.join(nodePtyDir, 'binding.gyp')
if (fs.existsSync(bindingGyp)) {
  let content = fs.readFileSync(bindingGyp, 'utf-8')
  content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'")
  fs.writeFileSync(bindingGyp, content)
  console.log('Patched binding.gyp')
}

console.log('node-pty patches applied successfully')
