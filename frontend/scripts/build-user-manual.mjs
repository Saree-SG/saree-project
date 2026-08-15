#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import mammoth from "mammoth"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..", "..")

const INPUT =
  process.env.MANUAL_INPUT ??
  path.join(ROOT, "docs/User/Saree_ERP_UserManual_v1.0.0.docx")
const OUT_DIR = path.join(ROOT, "frontend/public/help")
const IMG_DIR = path.join(OUT_DIR, "images")

if (!fs.existsSync(INPUT)) {
  console.error(`[user-manual] Input not found: ${INPUT}`)
  process.exit(1)
}

fs.rmSync(IMG_DIR, { recursive: true, force: true })
fs.mkdirSync(IMG_DIR, { recursive: true })

let imgCount = 0
const result = await mammoth.convertToHtml(
  { path: INPUT },
  {
    convertImage: mammoth.images.imgElement((image) =>
      image.read().then((buf) => {
        imgCount += 1
        const ext = (image.contentType || "image/png").split("/")[1] || "png"
        const name = `img_${imgCount}.${ext}`
        fs.writeFileSync(path.join(IMG_DIR, name), buf)
        return { src: `/help/images/${name}` }
      }),
    ),
    styleMap: [
      "p[style-name='Title'] => h1.manual-title:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
    ],
  },
)

fs.writeFileSync(path.join(OUT_DIR, "user-manual.html"), result.value)
fs.writeFileSync(
  path.join(OUT_DIR, "user-manual.messages.json"),
  JSON.stringify(result.messages, null, 2),
)
console.log(
  `[user-manual] Wrote ${path.relative(ROOT, OUT_DIR)} — ${result.value.length} bytes, ${imgCount} images`,
)
