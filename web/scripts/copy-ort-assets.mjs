import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('node_modules/onnxruntime-web/dist')
const target = resolve('public/ort')
await mkdir(target, { recursive: true })
for (const name of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  await copyFile(resolve(source, name), resolve(target, name))
}
