/**
 * 素材加载：把 resources/assets 下的原版图片转成 dataURL 并缓存。
 * 同一路径只 IPC 读一次，多窗口/多次重渲染不重复读盘。
 */
const cache = new Map()

/** 读取 assets 下的一张图，返回 dataURL；失败返回空串（调用方按"无图"降级） */
export async function asset(rel) {
  if (!rel) return ''
  if (cache.has(rel)) return cache.get(rel)
  let url = ''
  try {
    url = await window.api.readImage(rel)
  } catch (_) {
    url = ''
  }
  cache.set(rel, url)
  return url
}

/** 批量读取：{ key: 'rel/path.png' } → { key: 'data:image/png;base64,...' } */
export async function assets(map) {
  const keys = Object.keys(map)
  const list = await Promise.all(keys.map((k) => asset(map[k])))
  const out = {}
  keys.forEach((k, i) => {
    out[k] = list[i]
  })
  return out
}

/** 原版三段式进度条切片（左帽 / 中段 / 右帽），尺寸见 resources/assets/stateInfo */
export const BAR_SLICES = {
  green: ['stateInfo/lusejindutiao00.png', 'stateInfo/lusejindutiao01.png', 'stateInfo/lusejindutiao02.png'],
  blue: ['stateInfo/bluejidutiao_01.png', 'stateInfo/bluejidutiao_02.png', 'stateInfo/bluejidutiao_03.png'],
  yellow: ['stateInfo/huangsejindutiao00.png', 'stateInfo/huangsejindutiao01.png', 'stateInfo/huangsejindutiao02.png'],
  red: ['stateInfo/hongsejindutiao00.png', 'stateInfo/hongsejindutiao01.png', 'stateInfo/hongsejindutiao02.png'],
  orange: ['stateInfo/chengsejindutiao00.png', 'stateInfo/chengsejindutiao01.png', 'stateInfo/chengsejindutiao02.png'],
  deepblue: ['stateInfo/shenglanjindutiao00.png', 'stateInfo/shenglanjindutiao01.png', 'stateInfo/shenglanjindutiao02.png']
}

/** 读取某色进度条的三段切片，返回 { l, m, r } */
export async function barSlices(color) {
  const [l, m, r] = BAR_SLICES[color] || BAR_SLICES.green
  return assets({ l: `assets/${l}`, m: `assets/${m}`, r: `assets/${r}` })
}
