import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

export function createHashingDiskStorage({ destinationDir, filename }) {
  if (!destinationDir) throw new Error('destinationDir is required')
  ensureDir(destinationDir)

  return {
    _handleFile(req, file, cb) {
      let name
      try {
        name = typeof filename === 'function' ? filename(req, file) : file.originalname
      } catch (err) {
        return cb(err)
      }

      const finalName = String(name || '').trim()
      if (!finalName) return cb(new Error('Invalid upload filename'))

      const fullPath = path.join(destinationDir, finalName)

      const outStream = fs.createWriteStream(fullPath)
      const hash = crypto.createHash('sha256')

      let size = 0
      file.stream.on('data', (chunk) => {
        size += chunk.length
        hash.update(chunk)
      })

      outStream.on('error', cb)
      file.stream.on('error', cb)

      outStream.on('finish', () => {
        cb(null, {
          destination: destinationDir,
          filename: finalName,
          path: fullPath,
          size,
          contentHash: hash.digest('hex'),
        })
      })

      file.stream.pipe(outStream)
    },

    _removeFile(req, file, cb) {
      const filePath = file?.path
      if (!filePath) return cb(null)
      fs.unlink(filePath, cb)
    },
  }
}
