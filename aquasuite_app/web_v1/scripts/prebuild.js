const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const publicServicesDir = path.join(publicDir, 'web', 'services')

fs.mkdirSync(publicServicesDir, { recursive: true })

const srcApp = path.join(root, 'web', 'services', 'app.js')
const destApp = path.join(publicServicesDir, 'app.js')
fs.copyFileSync(srcApp, destApp)

const srcVersion = path.join(root, 'version.json')
const destVersion = path.join(publicDir, 'version.json')
if (fs.existsSync(srcVersion)) {
  fs.copyFileSync(srcVersion, destVersion)
}
