import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// /stockfish/ is served from the repo-root `stockfish/` folder only during dev.
// It is intentionally NOT in `public/` so Vite does not copy the 108 MiB wasm
// into the static dist output (Cloudflare Pages rejects assets >25 MiB).
const stockfishDir = fileURLToPath(new URL('./stockfish', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serve-stockfish',
      configureServer(server) {
        server.middlewares.use('/stockfish', (req, res, next) => {
          const url = req.url ?? ''
          const file = path.basename(url)
          const fullPath = path.join(stockfishDir, file)
          if (fs.existsSync(fullPath)) {
            const ext = path.extname(file)
            const mime =
              ext === '.wasm'
                ? 'application/wasm'
                : ext === '.js'
                  ? 'application/javascript'
                  : 'application/octet-stream'
            res.setHeader('Content-Type', mime)
            fs.createReadStream(fullPath).pipe(res)
          } else {
            next()
          }
        })
      },
    },
  ],
})
