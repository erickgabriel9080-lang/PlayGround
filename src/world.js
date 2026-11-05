import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  clamp, lerp, smoothstep, fbm, ridged, mulberry32, valueNoise, rand, TAU
} from './utils.js'

export const WORLD_SIZE = 520
export const WORLD_RADIUS = 238
export const WATER_LEVEL = 1.0

export const SHRINE_POIS = [
  { id: 'grove', name: 'Whispering Grove', x: -140, z: 120, color: 0x59e0c8 },
  { id: 'peak', name: 'Skyfall Watch', x: 125, z: -55, color: 0x8fa9ff },
  { id: 'shore', name: 'Tidecaller Stones', x: 55, z: 165, color: 0xffc46b }
]

export const CAMP_POIS = [
  { x: -115, z: -35, kind: 'goblin' },
  { x: 120, z: 65, kind: 'goblin' },
  { x: -45, z: 145, kind: 'wraith' },
  { x: 165, z: -150, kind: 'goblin' },
  { x: 60, z: -100, kind: 'wraith' },
  { x: -168, z: -148, kind: 'goblin' }
]

export const CHEST_POIS = [
  { x: -45, z: 15 }, { x: 95, z: 120 }, { x: -160, z: 55 },
  { x: 140, z: -110 }, { x: -30, z: -95 }, { x: 30, z: 90 }
]

export const HERB_POIS = [
  { x: -118, z: -6 }, { x: -124, z: 5 }, { x: -110, z: 15 }, { x: -132, z: 18 },
  { x: -103, z: -18 }, { x: -138, z: -8 }, { x: -96, z: 6 }, { x: -127, z: -20 }
]

export const CIRCLE_POI = { x: 0, z: -158, name: 'The Hollow Circle' }
export const VILLAGE_CENTER = { x: 0, z: 0 }

const FLATTEN = [
  ...SHRINE_POIS.map(p => ({ ...p, r: 13 })),
  ...CAMP_POIS.map(p => ({ ...p, r: 12 })),
  { ...CIRCLE_POI, r: 18 }
]

function srgb(hex) {
  return new THREE.Color(hex).convertSRGBToLinear()
}

function colored(geo, hex, variation = 0, rng = Math.random) {
  const c = srgb(hex)
  const count = geo.attributes.position.count
  const arr = new Float32Array(count * 3)
  const v = 1 + (rng() - 0.5) * variation
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r * v
    arr[i * 3 + 1] = c.g * v
    arr[i * 3 + 2] = c.b * v
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

function boxGeo(w, h, d, x, y, z, hex, rng = Math.random, variation = 0.12) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return colored(g, hex, variation, rng)
}

function cylGeo(rt, rb, h, seg, x, y, z, hex, rng = Math.random) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg)
  g.translate(x, y, z)
  return colored(g, hex, 0.1, rng)
}

function coneGeo(r, h, seg, x, y, z, hex, rng = Math.random) {
  const g = new THREE.ConeGeometry(r, h, seg)
  g.translate(x, y, z)
  return colored(g, hex, 0.12, rng)
}

function makePineGeometry(rng) {
  const parts = []
  parts.push(cylGeo(0.16, 0.3, 2.2, 5, 0, 1.1, 0, 0x5a3b26, rng))
  parts.push(coneGeo(1.75, 2.5, 7, 0, 2.6, 0, 0x2f6339, rng))
  parts.push(coneGeo(1.45, 2.2, 7, 0, 3.9, 0, 0x356d3d, rng))
  parts.push(coneGeo(1.05, 1.8, 7, 0, 5.1, 0, 0x3d7a44, rng))
  return mergeGeometries(parts, false)
}

function makeBroadleafGeometry(rng) {
  const parts = []
  parts.push(cylGeo(0.2, 0.34, 3.1, 5, 0, 1.55, 0, 0x60412a, rng))
  const blob = (r, x, y, z, hex) => {
    const g = new THREE.IcosahedronGeometry(r, 1)
    g.translate(x, y, z)
    return colored(g, hex, 0.18, rng)
  }
  parts.push(blob(1.55, 0, 4.0, 0, 0x4b7f37, rng))
  parts.push(blob(1.2, 1.0, 3.6, 0.3, 0x568c3c, rng))
  parts.push(blob(1.1, -0.9, 3.7, -0.4, 0x44762f, rng))
  parts.push(blob(0.9, 0.2, 4.9, 0.2, 0x5c9440, rng))
  return mergeGeometries(parts, false)
}

function makeRockGeometry(rng) {
  const g = new THREE.IcosahedronGeometry(1, 1)
  const pos = g.attributes.position
  const seed = rng() * 100
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const n = 0.72 + valueNoise(x * 2 + seed, z * 2 + seed, 4) * 0.55
    pos.setXYZ(i, x * n, y * n * 0.85, z * n)
  }
  g.computeVertexNormals()
  return colored(g, 0x77787c, 0.35, rng)
}

function makeGrassGeometry() {
  const positions = []
  const colors = []
  const base = srgb(0x4a7a33)
  const tip = srgb(0x8dbb55)
  const blades = 4
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * TAU + 0.4
    const w = 0.055
    const h = 0.5 + (b % 2) * 0.25
    const cx = Math.cos(a) * 0.08
    const cz = Math.sin(a) * 0.08
    const dx = Math.cos(a + 1.4) * 0.12
    const dz = Math.sin(a + 1.4) * 0.12
    const x1 = cx + Math.cos(a + Math.PI / 2) * w
    const z1 = cz + Math.sin(a + Math.PI / 2) * w
    const x2 = cx - Math.cos(a + Math.PI / 2) * w
    const z2 = cz - Math.sin(a + Math.PI / 2) * w
    positions.push(x1, 0, z1, x2, 0, z2, cx + dx, h, cz + dz)
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

function makeFlowerGeometry(rng) {
  const parts = []
  parts.push(cylGeo(0.012, 0.02, 0.32, 3, 0, 0.16, 0, 0x3e702e, rng))
  const petal = (a, hex) => {
    const g = new THREE.IcosahedronGeometry(0.09, 0)
    g.translate(Math.cos(a) * 0.1, 0.34, Math.sin(a) * 0.1)
    return colored(g, hex, 0.05, rng)
  }
  const hexes = [0xf6e7a8, 0xffd36e, 0xe8a2c8, 0xcfe0ff, 0xf7f2e0]
  const hex = hexes[Math.floor(rng() * hexes.length)]
  for (let i = 0; i < 5; i++) parts.push(petal((i / 5) * TAU, hex))
  return mergeGeometries(parts, false)
}

function makeTuftedCrystal(hex) {
  const parts = []
  const c = colored(new THREE.ConeGeometry(0.24, 1.5, 5), hex, 0.2)
  parts.push(c)
  const c2 = colored(new THREE.ConeGeometry(0.16, 1.0, 5), hex, 0.2)
  c2.rotateZ(0.5); c2.translate(0.3, 0.15, 0)
  parts.push(c2)
  const c3 = colored(new THREE.ConeGeometry(0.13, 0.8, 5), hex, 0.2)
  c3.rotateZ(-0.6); c3.translate(-0.26, 0.05, 0.1)
  parts.push(c3)
  return mergeGeometries(parts, false)
}

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene
    this.quality = opts.quality || 'high'
    this.colliders = []
    this.interactables = []
    this.houses = []
    this.shrines = []
    this.chests = []
    this.herbs = []
    this.camps = []
    this.crystals = []
    this.flames = []
    this.windowLights = []
    this.floating = []
    this.poiMarkers = []
    this.timeUniforms = []
    this.windUniforms = []
    this.group = new THREE.Group()
    scene.add(this.group)

    this.anchors = []
    this._prepareAnchors()
    this.createSky()
    this.createLights()
    this.createTerrain()
    this.createWater()
    this.createScenery()
    this.createVillage()
    this.createShrines()
    this.createCamps()
    this.createChests()
    this.createHerbs()
    this.createCircle()
    this.createMotes()
    this.createClouds()
  }

  // ------------------------------------------------------------------ height
  baseHeight(x, z) {
    const n = fbm(x * 0.006 + 51.2, z * 0.006 + 17.7, 4, 1337)
    const detail = fbm(x * 0.029, z * 0.029, 3, 811)
    let h = 3.1 + (n - 0.5) * 8.5 + (detail - 0.5) * 2.4

    // Mirror Lake
    const dl = Math.hypot(x + 85, z - 75) / 52
    if (dl < 1) h = lerp(h, -3.8, 1 - smoothstep(0.2, 1, dl))
    // Hidden pond
    const dp = Math.hypot(x - 108, z + 118) / 30
    if (dp < 1) h = lerp(h, -2.6, 1 - smoothstep(0.2, 1, dp))

    // Village plateau
    const dv = Math.hypot(x, z)
    if (dv < 60) h = lerp(h, 3.5, 1 - smoothstep(33, 60, dv))

    // Mountain ring + outer rim
    const r = Math.hypot(x, z)
    const ring = smoothstep(176, 258, r + (fbm(x * 0.011, z * 0.011, 3, 77) - 0.5) * 34)
    const ridge = ridged(x * 0.017 + 4, z * 0.017 - 9, 4, 411)
    h += ring * (24 + ridge * 44)
    h += smoothstep(242, 264, r) * 26
    return h
  }

  _prepareAnchors() {
    for (const poi of FLATTEN) {
      let y = this.baseHeight(poi.x, poi.z)
      y = Math.max(y, WATER_LEVEL + 1.4)
      this.anchors.push({ x: poi.x, z: poi.z, r: poi.r, y })
    }
  }

  heightAt(x, z) {
    let h = this.baseHeight(x, z)
    for (const a of this.anchors) {
      const d = Math.hypot(x - a.x, z - a.z)
      if (d < a.r) h = lerp(h, a.y, 1 - smoothstep(a.r * 0.55, a.r, d))
    }
    return h
  }

  normalAt(x, z, eps = 0.6) {
    const hL = this.heightAt(x - eps, z)
    const hR = this.heightAt(x + eps, z)
    const hD = this.heightAt(x, z - eps)
    const hU = this.heightAt(x, z + eps)
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize()
  }

  slopeAt(x, z) {
    return this.normalAt(x, z).y
  }

  isWater(x, z, margin = 0) {
    return this.heightAt(x, z) < WATER_LEVEL + margin
  }

  isFree(x, z, radius = 1) {
    if (Math.hypot(x, z) > WORLD_RADIUS) return false
    for (const c of this.colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + radius) return false
    }
    return true
  }

  addCollider(x, z, r) {
    this.colliders.push({ x, z, r })
  }

  // -------------------------------------------------------------------- sky
  createSky() {
    const geo = new THREE.SphereGeometry(1200, 32, 20)
    this.skyUniforms = {
      uZenith: { value: new THREE.Color(0x2c6cb4) },
      uHorizon: { value: new THREE.Color(0xbfd9e8) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.2) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uCloudTint: { value: new THREE.Color(0xffffff) }
    }
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uZenith, uHorizon, uSunColor, uCloudTint;
        uniform vec3 uSunDir;
        uniform float uNight, uTime;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { v += noise(p) * a; p *= 2.03; a *= 0.5; }
          return v;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          vec3 sky = mix(uHorizon, uZenith, pow(h, 0.62));
          sky = mix(sky, uHorizon * 0.72, smoothstep(0.0, -0.18, dir.y));

          // cloud layer
          if (dir.y > 0.015) {
            vec2 cuv = dir.xz / (dir.y + 0.22) * 0.9 + vec2(uTime * 0.006, uTime * 0.0022);
            float c = fbm(cuv * 1.6);
            float c2 = fbm(cuv * 4.1 + 13.0);
            float clouds = smoothstep(0.48, 0.78, c * 0.75 + c2 * 0.4);
            clouds *= smoothstep(0.0, 0.16, dir.y) * (1.0 - smoothstep(0.55, 0.98, h) * 0.35);
            float lit = smoothstep(-0.15, 0.5, uSunDir.y);
            vec3 cloudCol = mix(uCloudTint * 0.32, uCloudTint, lit);
            sky = mix(sky, cloudCol, clouds * 0.68);
          }

          // stars
          if (uNight > 0.01) {
            vec2 sp = floor(dir.xz * 340.0 / (abs(dir.y) + 0.35));
            float st = hash(sp);
            float tw = 0.65 + 0.35 * sin(uTime * 2.0 + st * 40.0);
            float star = smoothstep(0.9955, 0.9995, st) * tw;
            star *= smoothstep(-0.02, 0.22, dir.y);
            sky += vec3(0.8, 0.88, 1.0) * star * uNight * 1.5;
          }

          // sun
          float sd = max(dot(dir, uSunDir), 0.0);
          sky += uSunColor * pow(sd, 6.0) * 0.20;
          sky += uSunColor * pow(sd, 90.0) * 0.55;
          float disc = smoothstep(0.99935, 0.99975, sd);
          sky += uSunColor * disc * 6.0;

          // moon (opposite the sun)
          vec3 moonDir = normalize(vec3(-uSunDir.x, -uSunDir.y * 0.85 + 0.12, -uSunDir.z));
          float md = max(dot(dir, moonDir), 0.0);
          sky += vec3(0.72, 0.82, 1.0) * smoothstep(0.9993, 0.9998, md) * 2.2 * uNight;
          sky += vec3(0.4, 0.55, 0.9) * pow(md, 40.0) * 0.25 * uNight;

          gl_FragColor = vec4(sky, 1.0);
        }
      `
    })
    this.sky = new THREE.Mesh(geo, mat)
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
  }

  createLights() {
    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4230, 0.85)
    this.scene.add(hemi)
    this.hemi = hemi

    const sun = new THREE.DirectionalLight(0xfff1d8, 2.4)
    sun.castShadow = this.quality !== 'low'
    sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 160
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    sun.shadow.bias = -0.0008
    sun.shadow.normalBias = 0.035
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sun = sun
    this.moon = new THREE.DirectionalLight(0x9fb8ff, 0.0)
    this.scene.add(this.moon)

    this.scene.fog = new THREE.FogExp2(0xbcd6e5, 0.0026)
  }

  createClouds() {
    const tex = this.makeCloudTexture()
    this.cloudSprites = new THREE.Group()
    const rng = mulberry32(4242)
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.5, depthWrite: false,
        color: 0xffffff, fog: false
      })
      const s = new THREE.Sprite(mat)
      const a = rng() * TAU
      const r = 320 + rng() * 380
      s.position.set(Math.cos(a) * r, 110 + rng() * 90, Math.sin(a) * r)
      const sc = 140 + rng() * 160
      s.scale.set(sc, sc * 0.42, 1)
      this.cloudSprites.add(s)
    }
    this.scene.add(this.cloudSprites)
  }

  makeCloudTexture() {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const ctx = c.getContext('2d')
    const grd = ctx.createRadialGradient(128, 128, 10, 128, 128, 126)
    grd.addColorStop(0, 'rgba(255,255,255,0.9)')
    grd.addColorStop(0.45, 'rgba(255,255,255,0.55)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 18; i++) {
      const x = 40 + Math.random() * 176
      const y = 90 + Math.random() * 76
      const r = 20 + Math.random() * 42
      const g2 = ctx.createRadialGradient(x, y, 1, x, y, r)
      g2.addColorStop(0, 'rgba(255,255,255,0.35)')
      g2.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g2
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  // ---------------------------------------------------------------- terrain
  terrainColor(x, z, h, ny, out) {
    const moisture = fbm(x * 0.012 + 90, z * 0.012 - 40, 3, 71)
    const dv = Math.hypot(x, z)
    let hex
    if (h < WATER_LEVEL + 0.55) {
      hex = 0xc2b184
    } else if (ny < 0.66) {
      hex = 0x77787a
    } else if (h > 40 && ny > 0.6) {
      hex = 0xe6edf0
    } else if (h > 30) {
      hex = 0x8e8e8a
    } else {
      const grass = new THREE.Color(0x6d9647).lerp(new THREE.Color(0x8fae5c), moisture)
      if (moisture < 0.38) grass.lerp(new THREE.Color(0x9fa761), 0.5)
      hex = grass.getHex()
    }

    if (dv < 13) hex = 0x8f8878
    // dirt roads leaving the village
    if (dv > 12 && dv < 62) {
      const roads = [[0, 1], [0.55, -0.84], [-0.92, -0.38]]
      for (const [dx, dz] of roads) {
        const px = dx * dv, pz = dz * dv
        const lateral = Math.abs(-dz * (x - px) + dx * (z - pz))
        if (lateral < 2.6 && Math.hypot(x, z) > 12) hex = 0x9c8a68
      }
    }

    const c = new THREE.Color(hex)
    const v = 0.9 + valueNoise(x * 0.6, z * 0.6, 22) * 0.2
    out.copy(c).multiplyScalar(v)
    return out
  }

  createTerrain() {
    const seg = this.quality === 'low' ? 150 : 210
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const h = this.heightAt(x, z)
      pos.setY(i, h)
      const n = this.normalAt(x, z, 1.2)
      this.terrainColor(x, z, h, n.y, c)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, metalness: 0.0
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.castShadow = false
    this.terrain = mesh
    this.group.add(mesh)
  }

  createWater() {
    this.waterUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.3, 0.9, 0.2) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uDeep: { value: new THREE.Color(0x0d3b45) },
      uShallow: { value: new THREE.Color(0x2f7d7a) },
      uFogColor: { value: new THREE.Color(0xbcd6e5) },
      uFogDensity: { value: 0.0026 }
    }
    const geo = new THREE.PlaneGeometry(WORLD_SIZE + 20, WORLD_SIZE + 20, 1, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: this.waterUniforms,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        uniform float uTime;
        void main() {
          vec3 p = position;
          p.y += sin(p.x * 0.32 + uTime * 1.1) * 0.09 + sin(p.z * 0.27 - uTime * 0.9) * 0.07;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vWorld;
        uniform float uTime, uFogDensity;
        uniform vec3 uSunDir, uSunColor, uDeep, uShallow, uFogColor;
        void main() {
          vec3 dx = dFdx(vWorld);
          vec3 dy = dFdy(vWorld);
          vec3 n = normalize(cross(dx, dy));
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);
          vec3 col = mix(uDeep, uShallow, fres * 0.85 + 0.18);
          float spec = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 90.0);
          col += uSunColor * spec * 2.4;
          float sparkle = smoothstep(0.75, 1.0, sin(vWorld.x * 1.7 + uTime * 1.4) * sin(vWorld.z * 1.9 - uTime * 1.1));
          col += vec3(0.5, 0.7, 0.7) * sparkle * 0.06;
          float d = length(cameraPosition - vWorld);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 0.86);
        }
      `
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = WATER_LEVEL
    mesh.renderOrder = 1
    this.water = mesh
    this.group.add(mesh)
  }

  // ---------------------------------------------------------------- scenery
  createScenery() {
    const rng = mulberry32(90210)
    const dummy = new THREE.Object3D()
    const treeMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true
    })
    const pineGeo = makePineGeometry(rng)
    const broadGeo = makeBroadleafGeometry(rng)
    const maxTrees = this.quality === 'low' ? 450 : 900
    const pines = []
    const broads = []

    for (let i = 0; i < maxTrees * 4 && pines.length + broads.length < maxTrees; i++) {
      const a = rng() * TAU
      const r = 30 + Math.sqrt(rng()) * 200
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      const h = this.heightAt(x, z)
      if (h < WATER_LEVEL + 0.4 || h > 44) continue
      if (this.slopeAt(x, z) < 0.72) continue
      if (Math.hypot(x, z) < 52) continue
      if (this.nearPoi(x, z, 10)) continue
      const forest = fbm(x * 0.010 + 300, z * 0.010 - 120, 3, 5)
      if (rng() > 0.25 + forest * 0.95) continue
      if (!this.isFree(x, z, 1.2)) continue
      const scale = rand(0.7, 1.5)
      const rot = rng() * TAU
      const color = new THREE.Color().setHSL(0.28 + rng() * 0.04, 0.12 + rng() * 0.12, 0.46 + rng() * 0.12)
      const entry = { x, z, y: h - 0.12, scale, rot, color }
      if ((h > 8 && rng() < 0.72) || rng() < 0.28) pines.push(entry)
      else broads.push(entry)
    }

    const build = (geo, list) => {
      const mesh = new THREE.InstancedMesh(geo, treeMat, list.length)
      mesh.castShadow = true
      mesh.receiveShadow = true
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z)
        dummy.rotation.set(0, t.rot, 0)
        dummy.scale.setScalar(t.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, t.color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      this.group.add(mesh)
    }
    build(pineGeo, pines)
    build(broadGeo, broads)

    // rocks
    const rockGeo = makeRockGeometry(rng)
    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, flatShading: true
    })
    const rocks = []
    for (let i = 0; i < 420 && rocks.length < 200; i++) {
      const a = rng() * TAU
      const r = 26 + Math.sqrt(rng()) * 205
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      const h = this.heightAt(x, z)
      if (h < WATER_LEVEL - 0.5) continue
      if (Math.hypot(x, z) < 16) continue
      if (this.nearPoi(x, z, 8)) continue
      if (rng() > 0.55) continue
      rocks.push({ x, z, y: h - 0.25, s: rand(0.3, 1.7), rot: rng() * TAU })
    }
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length)
    rockMesh.castShadow = true
    rockMesh.receiveShadow = true
    rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z)
      dummy.rotation.set(rng() * 0.4, r.rot, rng() * 0.3)
      dummy.scale.set(r.s, r.s * 0.8, r.s)
      dummy.updateMatrix()
      rockMesh.setMatrixAt(i, dummy.matrix)
      const tint = new THREE.Color().setHSL(0.1, 0.03, 0.5 + rng() * 0.2)
      rockMesh.setColorAt(i, tint)
    })
    rockMesh.instanceMatrix.needsUpdate = true
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true
    this.group.add(rockMesh)

    // grass
    const grassGeo = makeGrassGeometry()
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, side: THREE.DoubleSide
    })
    const windUniform = { value: 0 }
    this.windUniforms.push(windUniform)
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = windUniform
      shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float sway = sin(uWind * 1.6 + instanceMatrix[3].x * 0.45 + instanceMatrix[3].z * 0.35);
         transformed.x += sway * pow(position.y, 1.5) * 0.18;
         transformed.z += sway * pow(position.y, 1.5) * 0.10;`
      )
    }
    const grassCount = this.quality === 'low' ? 1800 : 4200
    const grass = []
    for (let i = 0; i < grassCount * 3 && grass.length < grassCount; i++) {
      const a = rng() * TAU
      const r = 18 + Math.sqrt(rng()) * 195
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      const h = this.heightAt(x, z)
      if (h < WATER_LEVEL + 0.2 || h > 34) continue
      if (this.slopeAt(x, z) < 0.72) continue
      if (Math.hypot(x, z) < 14) continue
      if (this.nearPoi(x, z, 5)) continue
      const dens = fbm(x * 0.02, z * 0.02, 2, 88)
      if (rng() > dens * 1.5) continue
      grass.push({ x, z, y: h, s: rand(0.7, 1.6), rot: rng() * TAU })
    }
    const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grass.length)
    grassMesh.receiveShadow = true
    grass.forEach((g, i) => {
      dummy.position.set(g.x, g.y - 0.03, g.z)
      dummy.rotation.set(0, g.rot, 0)
      dummy.scale.setScalar(g.s)
      dummy.updateMatrix()
      grassMesh.setMatrixAt(i, dummy.matrix)
    })
    grassMesh.instanceMatrix.needsUpdate = true
    this.group.add(grassMesh)

    // flowers
    const flowerGeo = makeFlowerGeometry(rng)
    const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
    const flowers = []
    for (let i = 0; i < 1400 && flowers.length < 420; i++) {
      const a = rng() * TAU
      const r = 20 + Math.sqrt(rng()) * 180
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      const h = this.heightAt(x, z)
      if (h < WATER_LEVEL + 0.5 || h > 26) continue
      if (this.slopeAt(x, z) < 0.8) continue
      if (Math.hypot(x, z) < 13) continue
      if (this.nearPoi(x, z, 4)) continue
      flowers.push({ x, z, y: h, s: rand(0.8, 1.4) })
    }
    const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, flowers.length)
    flowers.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z)
      dummy.rotation.set(0, rng() * TAU, 0)
      dummy.scale.setScalar(f.s)
      dummy.updateMatrix()
      flowerMesh.setMatrixAt(i, dummy.matrix)
    })
    flowerMesh.instanceMatrix.needsUpdate = true
    this.group.add(flowerMesh)
  }

  nearPoi(x, z, pad) {
    for (const p of [...FLATTEN, ...CHEST_POIS, ...HERB_POIS]) {
      if (Math.hypot(x - p.x, z - p.z) < pad) return true
    }
    return false
  }

  // ---------------------------------------------------------------- village
  addBox(group, w, h, d, x, y, z, color, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0
    })
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    m.castShadow = opts.shadow ?? true
    m.receiveShadow = true
    group.add(m)
    return m
  }

  makeHouse(x, z, rotY, variant = 0) {
    const rng = mulberry32(1000 + variant * 77 + x * 3 + z * 5)
    const g = new THREE.Group()
    const y = this.heightAt(x, z)
    g.position.set(x, y, z)
    g.rotation.y = rotY

    const wallCols = [0xd9c9a6, 0xcdbb98, 0xd6c5a1]
    const roofCols = [0x94493b, 0x7e4234, 0x5d4a3f, 0x8a4f3a]
    const wall = wallCols[variant % wallCols.length]
    const roof = roofCols[variant % roofCols.length]
    const W = 4.8, D = 4.0, H = 2.9

    this.addBox(g, W + 0.4, 0.5, D + 0.4, 0, 0.25, 0, 0x8b877c)
    this.addBox(g, W, H, D, 0, 0.5 + H / 2, 0, wall)
    // timber frame
    const beam = 0x58402b
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.addBox(g, 0.18, H, 0.18, sx * (W / 2 - 0.1), 0.5 + H / 2, sz * (D / 2 - 0.1), beam)
    }
    this.addBox(g, W, 0.18, 0.16, 0, 0.55, D / 2 - 0.02, beam)
    this.addBox(g, W, 0.16, 0.16, 0, 0.5 + H - 0.1, D / 2 - 0.02, beam)
    this.addBox(g, 0.16, H, 0.16, 0, 0.5 + H / 2, D / 2 - 0.02, beam)
    this.addBox(g, W * 0.92, 0.15, 0.1, 0, 0.5 + H - 0.5, -D / 2 - 0.02, beam)

    // door
    this.addBox(g, 1.05, 2.0, 0.14, 0, 1.5, D / 2 + 0.04, 0x4b3220)
    this.addBox(g, 0.1, 0.1, 0.1, 0.32, 1.55, D / 2 + 0.13, 0xd8b45a, { metalness: 0.7, roughness: 0.4 })
    // windows
    const winMat = 0xffbf6a
    for (const sx of [-1.45, 1.45]) {
      const m = this.addBox(g, 0.85, 0.8, 0.1, sx, 1.8, D / 2 + 0.04, 0x2a2a30, {
        emissive: winMat, emissiveIntensity: 0.0
      })
      this.windowLights.push(m)
      this.addBox(g, 1.0, 0.1, 0.14, sx, 1.36, D / 2 + 0.06, beam)
    }

    // roof
    const roofMesh = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(W, D) * 0.78, 2.3, 4),
      new THREE.MeshStandardMaterial({ color: roof, roughness: 0.9, flatShading: true })
    )
    roofMesh.rotation.y = Math.PI / 4
    roofMesh.position.y = 0.5 + H + 1.05
    roofMesh.castShadow = true
    roofMesh.receiveShadow = true
    g.add(roofMesh)
    // chimney
    this.addBox(g, 0.55, 1.6, 0.55, 1.3, 0.5 + H + 1.2, -0.8, 0x77716a)

    // props
    this.addBox(g, 0.6, 0.6, 0.6, W / 2 + 0.7, 0.8, 1.2, 0x7a5c3a)
    this.addBox(g, 0.5, 0.8, 0.5, W / 2 + 0.7, 0.9, 0.4, 0x6b4e30)
    this.group.add(g)
    this.addCollider(x, z, 3.5)
    this.houses.push({ x, z, group: g })
    return g
  }

  createVillage() {
    const rng = mulberry32(555)
    const houses = [
      [-16, -9, 0.15], [15, -10, -0.3], [-17, 12, 2.5], [17, 13, 3.3], [1, -21, 0.05], [31, 3, 1.4]
    ]
    houses.forEach((h, i) => this.makeHouse(h[0], h[1], h[2], i))

    // plaza & well
    const y0 = this.heightAt(0, 0)
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(13, 13.2, 0.16, 20),
      new THREE.MeshStandardMaterial({ color: 0x8d8574, roughness: 1 })
    )
    plaza.position.set(0, y0 + 0.02, 0)
    plaza.receiveShadow = true
    this.group.add(plaza)

    const wellG = new THREE.Group()
    wellG.position.set(0, this.heightAt(0, -2), -2)
    this.addBox(wellG, 1.8, 0.9, 1.8, 0, 0.45, 0, 0x87837a)
    this.addBox(wellG, 1.5, 0.2, 1.5, 0, 0.92, 0, 0x2a2a2a)
    for (const sx of [-1, 1]) this.addBox(wellG, 0.16, 2.0, 0.16, sx * 0.85, 1.4, 0, 0x5a4028)
    this.addBox(wellG, 2.1, 0.14, 1.8, 0, 2.35, 0, 0x6b4a2f)
    this.group.add(wellG)
    this.addCollider(0, -2, 1.3)

    // campfire
    this.makeCampfire(-7, 7, 1.15)
    // market stalls
    this.makeStall(7, -10, -0.5, 0xa04a3d)
    this.makeStall(-9, -11, 0.4, 0x3d6a8a)
    // forge
    this.makeForge(11, 8)
    // fences at south entrance
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = side * (7 + i * 3.2)
        const z = 21 + (i % 2) * 0.2
        this.addBox(this.group, 0.16, 1.2, 0.16, x, this.heightAt(x, z) + 0.6, z, 0x6d5236)
        this.addBox(this.group, 3.2, 0.12, 0.1, x + side * 1.6, this.heightAt(x, z) + 0.9, z, 0x7b5c3c)
      }
    }
    // banners
    for (const [x, z, col] of [[-5, 15, 0x2f6d8a], [5, 15, 0x8a3f34], [-11, 0, 0x2f6d8a]]) {
      const y = this.heightAt(x, z)
      this.addBox(this.group, 0.12, 4.2, 0.12, x, y + 2.1, z, 0x5c4328)
      const flag = this.addBox(this.group, 1.1, 1.4, 0.06, x + 0.62, y + 3.4, z, col)
      flag.castShadow = true
      this.floating.push({ mesh: flag, kind: 'flag', base: y + 3.4, phase: rng() * TAU })
    }
    // hay, crates, barrels
    for (let i = 0; i < 10; i++) {
      const a = rng() * TAU
      const r = 11 + rng() * 16
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      if (!this.isFree(x, z, 1.2)) continue
      const y = this.heightAt(x, z)
      if (rng() < 0.5) this.addBox(this.group, 0.8, 0.8, 0.8, x, y + 0.4, z, 0x7a5a38)
      else {
        const b = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 1.0, 8),
          new THREE.MeshStandardMaterial({ color: 0x75512f, roughness: 0.9 })
        )
        b.position.set(x, y + 0.5, z)
        b.castShadow = true
        this.group.add(b)
      }
    }
    // lamp posts
    for (const [x, z] of [[0, 12], [-13, 1], [13, 1], [0, -12]]) {
      const y = this.heightAt(x, z)
      this.addBox(this.group, 0.14, 3.2, 0.14, x, y + 1.6, z, 0x4c3826)
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.5, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffc066, emissiveIntensity: 2.2 })
      )
      lamp.position.set(x, y + 3.35, z)
      this.group.add(lamp)
      const pl = new THREE.PointLight(0xffb35e, 0.0, 12, 2)
      pl.position.set(x, y + 3.3, z)
      this.group.add(pl)
      this.windowLights.push({ glow: true, light: pl, mesh: lamp })
    }
    // shrine-ish stone marker at plaza center
    this.addCollider(0, 0, 1.0)
  }

  makeCampfire(x, z, scale = 1) {
    const y = this.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, y, z)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      const s = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.24 * scale, 0),
        new THREE.MeshStandardMaterial({ color: 0x66625c, roughness: 1, flatShading: true })
      )
      s.position.set(Math.cos(a) * 0.92 * scale, 0.08, Math.sin(a) * 0.92 * scale)
      s.castShadow = true
      g.add(s)
    }
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * scale, 0.13 * scale, 1.6 * scale, 5),
        new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 })
      )
      log.rotation.z = Math.PI / 2
      log.rotation.y = (i / 3) * Math.PI
      log.position.y = 0.22
      log.castShadow = true
      g.add(log)
    }
    const flames = []
    const flameCols = [0xff7a1a, 0xffb43a, 0xffe08a]
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry((0.36 - i * 0.045) * scale, (1.2 - i * 0.15) * scale, 5),
        new THREE.MeshBasicMaterial({
          color: flameCols[i % 3], transparent: true, opacity: 0.9 - i * 0.12,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      )
      m.position.y = 0.55 * scale + i * 0.16
      m.userData.phase = i * 1.7
      flames.push(m)
      g.add(m)
    }
    const light = new THREE.PointLight(0xff9a42, 6, 18, 2)
    light.position.y = 1.0
    g.add(light)
    this.group.add(g)
    this.flames.push({ group: g, flames, light, base: 6, x, z, scale })
    this.addCollider(x, z, 1.0)
    return g
  }

  makeStall(x, z, rotY, cloth) {
    const y = this.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.rotation.y = rotY
    this.addBox(g, 3.6, 0.18, 1.8, 0, 1.0, 0, 0x6b4b2e)
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.75, 0.75]) {
      this.addBox(g, 0.12, 2.3, 0.12, sx, 1.15, sz, 0x5a3f26)
    }
    const canopy = this.addBox(g, 4.0, 0.12, 2.3, 0, 2.4, 0, cloth)
    canopy.rotation.z = 0.04
    for (let i = 0; i < 6; i++) {
      const c = [0xd9b44a, 0x9a3f36, 0x3f7a5a][i % 3]
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 6, 5),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })
      )
      s.position.set(-1.2 + i * 0.45, 1.2, 0)
      s.castShadow = true
      g.add(s)
    }
    this.group.add(g)
    this.addCollider(x, z, 2.0)
  }

  makeForge(x, z) {
    const y = this.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, y, z)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU
      this.addBox(g, 0.5, 0.55, 0.5, Math.cos(a) * 1.2, 0.28, Math.sin(a) * 1.2, 0x65605a)
    }
    this.addBox(g, 1.5, 0.35, 1.2, 0, 0.62, 0, 0x3a3128)
    // coals
    const coal = this.addBox(g, 1.1, 0.12, 0.8, 0, 0.84, 0, 0xff6a1a, {
      emissive: 0xff4d00, emissiveIntensity: 3.0
    })
    coal.castShadow = false
    const pl = new THREE.PointLight(0xff6a20, 5, 10, 2)
    pl.position.y = 1.2
    g.add(pl)
    this.flames.push({ group: g, flames: [], light: pl, base: 4, x, z, scale: 1, coal })
    // anvil
    this.addBox(g, 0.7, 0.35, 0.35, 1.8, 0.6, 0.4, 0x33343a, { metalness: 0.6, roughness: 0.5 })
    this.addBox(g, 0.4, 0.5, 0.3, 1.8, 0.25, 0.4, 0x4a3a2a)
    this.group.add(g)
    this.addCollider(x, z, 2.2)
  }

  // ----------------------------------------------------------------- shrines
  createShrines() {
    SHRINE_POIS.forEach((p, idx) => {
      const y = this.heightAt(p.x, p.z)
      const g = new THREE.Group()
      g.position.set(p.x, y, p.z)
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b8b8f, roughness: 0.95, flatShading: true })
      const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.8, 0.9, 9), stoneMat)
      base.position.y = 0.25
      base.receiveShadow = true
      base.castShadow = true
      g.add(base)
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.4, 0.5, 9), stoneMat)
      inner.position.y = 0.85
      inner.receiveShadow = true
      g.add(inner)

      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.3
        const px = Math.cos(a) * 5.1, pz = Math.sin(a) * 5.1
        const h = 2.2 + (i % 2) * 0.6
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), stoneMat)
        pillar.position.set(px, 0.7 + h / 2, pz)
        pillar.rotation.y = a
        pillar.castShadow = true
        pillar.receiveShadow = true
        g.add(pillar)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.95), stoneMat)
        cap.position.set(px, 0.7 + h + 0.08, pz)
        cap.rotation.y = a
        cap.castShadow = true
        g.add(cap)
        this.addCollider(p.x + px, p.z + pz, 0.65)
      }

      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x6f7f88, emissive: p.color, emissiveIntensity: 0.25,
        roughness: 0.25, metalness: 0.35, flatShading: true
      })
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), crystalMat)
      crystal.position.y = 3.4
      crystal.castShadow = true
      g.add(crystal)
      const shards = new THREE.Group()
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), crystalMat)
        s.userData.a = (i / 3) * TAU
        s.userData.r = 1.25
        shards.add(s)
      }
      g.add(shards)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.06, 6, 40),
        new THREE.MeshStandardMaterial({ color: 0x2a2f33, emissive: p.color, emissiveIntensity: 0.3 })
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 1.25
      g.add(ring)
      const light = new THREE.PointLight(p.color, 0, 22, 2)
      light.position.y = 3.6
      g.add(light)
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 1.4, 60, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: p.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide
        })
      )
      beam.position.y = 30
      g.add(beam)
      this.group.add(g)
      this.shrines.push({
        id: p.id, name: p.name, x: p.x, z: p.z, color: p.color,
        group: g, crystal, shards, ring, light, beam, lit: false, crystalMat
      })
      this.addCollider(p.x, p.z, 4.9)
    })
  }

  lightShrine(shrine) {
    shrine.lit = true
    shrine.crystalMat.color.set(0xcfeaff)
    shrine.crystalMat.emissiveIntensity = 2.6
    shrine.crystalMat.emissive.set(shrine.color)
    shrine.beam.material.opacity = 0.24
    shrine.light.intensity = 9
    shrine.ring.material.emissiveIntensity = 2.0
  }

  // ------------------------------------------------------------------- camps
  createCamps() {
    const rng = mulberry32(777)
    CAMP_POIS.forEach((p, idx) => {
      const y = this.heightAt(p.x, p.z)
      const g = new THREE.Group()
      g.position.set(p.x, y, p.z)
      const rot = rng() * TAU
      // tents
      for (let t = 0; t < 2; t++) {
        const a = rot + t * 2.2
        const tx = Math.cos(a) * 4.5, tz = Math.sin(a) * 4.5
        const tent = new THREE.Mesh(
          new THREE.ConeGeometry(2.1, 2.6, 5),
          new THREE.MeshStandardMaterial({ color: t ? 0x5d4a35 : 0x4c5a3a, roughness: 0.95, flatShading: true })
        )
        tent.position.set(tx, 1.3, tz)
        tent.rotation.y = a
        tent.castShadow = true
        g.add(tent)
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 3.1, 4),
          new THREE.MeshStandardMaterial({ color: 0x4a3524 })
        )
        pole.position.set(tx, 1.5, tz)
        g.add(pole)
        this.addCollider(p.x + tx, p.z + tz, 2.0)
      }
      // banner
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 4.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x4a3524 })
      )
      pole.position.set(-1.5, 2.1, 0)
      g.add(pole)
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.9, 4, 2),
        new THREE.MeshStandardMaterial({ color: p.kind === 'wraith' ? 0x513566 : 0x6b2f2b, side: THREE.DoubleSide, roughness: 1 })
      )
      flag.position.set(-0.8, 3.3, 0)
      g.add(flag)
      this.floating.push({ mesh: flag, kind: 'flag', base: 3.3, phase: rng() * TAU, group: g, amp: 0.02 })

      // crates/logs
      for (let i = 0; i < 4; i++) {
        const a = rng() * TAU
        const r = 2 + rng() * 4
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r
        if (i % 2 === 0) {
          const c = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            new THREE.MeshStandardMaterial({ color: 0x6b4c2e, roughness: 1 })
          )
          c.position.set(cx, 0.35, cz)
          c.rotation.y = rng() * TAU
          c.castShadow = true
          g.add(c)
        } else {
          const c = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 1.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x543b25, roughness: 1 })
          )
          c.rotation.z = Math.PI / 2
          c.rotation.y = rng() * TAU
          c.position.set(cx, 0.25, cz)
          c.castShadow = true
          g.add(c)
        }
      }
      const fire = this.makeCampfire(p.x + 1.8, p.z - 1.2, 0.8)
      // bone pile / totem for goblins
      if (p.kind === 'goblin') {
        const skull = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 6, 5),
          new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.9 })
        )
        skull.position.set(-0.2, 0.5, 1.6)
        skull.scale.set(1, 0.85, 1.15)
        g.add(skull)
      }
      this.group.add(g)
      this.camps.push({ ...p, group: g, rot })
    })
  }

  // ------------------------------------------------------------------ chests
  createChests() {
    const rng = mulberry32(3030)
    CHEST_POIS.forEach((p, i) => {
      const x = p.x, z = p.z
      const y = this.heightAt(x, z)
      const g = new THREE.Group()
      g.position.set(x, y, z)
      g.rotation.y = rng() * TAU
      const wood = new THREE.MeshStandardMaterial({ color: 0x5f3f24, roughness: 0.85 })
      const trim = new THREE.MeshStandardMaterial({ color: 0xc79a3d, metalness: 0.7, roughness: 0.35 })
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.75, 0.9), wood)
      body.position.y = 0.38
      body.castShadow = true
      body.receiveShadow = true
      g.add(body)
      for (const sx of [-0.6, 0, 0.6]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.94), trim)
        b.position.set(sx, 0.38, 0)
        g.add(b)
      }
      const lidPivot = new THREE.Group()
      lidPivot.position.set(0, 0.75, -0.45)
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.24, 0.95), wood)
      lid.position.set(0, 0.05, 0.45)
      lid.castShadow = true
      lidPivot.add(lid)
      const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.07, 0.98), trim)
      lidTrim.position.set(0, 0.17, 0.45)
      lidPivot.add(lidTrim)
      g.add(lidPivot)
      const glow = new THREE.PointLight(0xffc75a, 1.6, 6, 2)
      glow.position.y = 1.0
      g.add(glow)
      this.group.add(g)
      this.addCollider(x, z, 1.1)
      this.chests.push({ x, z, y, group: g, lidPivot, glow, opened: false, id: i })
    })
  }

  // ------------------------------------------------------------------- herbs
  createHerbs() {
    const rng = mulberry32(2468)
    HERB_POIS.forEach((p, i) => {
      const x = p.x + (rng() - 0.5) * 4, z = p.z + (rng() - 0.5) * 4
      const y = this.heightAt(x, z)
      const g = new THREE.Group()
      g.position.set(x, y, z)
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 0.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x3f7a5a })
      )
      stem.position.y = 0.25
      g.add(stem)
      const petalMat = new THREE.MeshStandardMaterial({
        color: 0x9fe6ff, emissive: 0x48b8ff, emissiveIntensity: 1.6, roughness: 0.4
      })
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU
        const petal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), petalMat)
        petal.position.set(Math.cos(a) * 0.16, 0.52, Math.sin(a) * 0.16)
        g.add(petal)
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xe8fbff }))
      core.position.y = 0.53
      g.add(core)
      const light = new THREE.PointLight(0x52c7ff, 1.2, 4, 2)
      light.position.y = 0.6
      g.add(light)
      this.group.add(g)
      this.herbs.push({ id: i, x, z, y, group: g, light, collected: false, bob: rng() * TAU })
    })
  }

  // ------------------------------------------------------------ hollow circle
  createCircle() {
    const p = CIRCLE_POI
    const y = this.heightAt(p.x, p.z)
    const g = new THREE.Group()
    g.position.set(p.x, y, p.z)
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.95, flatShading: true })
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x2a1733, emissive: 0x9b4dff, emissiveIntensity: 0.4, roughness: 0.6
    })
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 13, 0.35, 40), mat)
    ring.position.y = 0.1
    ring.receiveShadow = true
    g.add(ring)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU
      const r = 11
      const h = 3.2 + (i % 3) * 0.9
      const stone = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 0.7), mat)
      stone.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r)
      stone.rotation.y = -a + Math.PI / 2
      stone.rotation.z = (Math.random() - 0.5) * 0.12
      stone.castShadow = true
      g.add(stone)
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), runeMat)
      rune.position.set(Math.cos(a) * (r - 0.63), h * 0.55, Math.sin(a) * (r - 0.37))
      rune.rotation.y = -a + Math.PI / 2
      g.add(rune)
      this.addCollider(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 0.8)
    }
    const altar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.8, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x3d3a44, roughness: 0.9 })
    )
    altar.position.y = 0.5
    altar.castShadow = true
    g.add(altar)
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7, 0),
      new THREE.MeshStandardMaterial({
        color: 0x8a4dff, emissive: 0x8a4dff, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.3
      })
    )
    core.position.y = 2.1
    g.add(core)
    const light = new THREE.PointLight(0x9b4dff, 4, 26, 2)
    light.position.y = 2.5
    g.add(light)
    const fog = new THREE.Mesh(
      new THREE.CylinderGeometry(12.6, 12.6, 0.5, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x6a3a9e, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    )
    fog.position.y = 0.6
    g.add(fog)
    this.group.add(g)
    this.circle = { ...p, group: g, core, light, y, active: false }
    this.addCollider(p.x, p.z, 2.4)
  }

  setCircleActive(active) {
    this.circle.active = active
    this.circle.core.material.emissiveIntensity = active ? 4.5 : 1.4
    this.circle.light.intensity = active ? 14 : 4
  }

  // ------------------------------------------------------------------- motes
  createMotes() {
    const count = 260
    const positions = new Float32Array(count * 3)
    this.moteData = []
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU
      const r = Math.random() * 34
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      positions[i * 3] = x
      positions[i * 3 + 1] = Math.random() * 9 + 1
      positions[i * 3 + 2] = z
      this.moteData.push({ a, r, y: Math.random() * 9 + 1, speed: 0.1 + Math.random() * 0.25, phase: Math.random() * TAU })
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xffe9a8, size: 0.09, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    this.scene.add(points)
    this.motes = points
  }

  // ------------------------------------------------------------------ update
  update(dt, t, playerPos, dayTime) {
    this.skyUniforms.uTime.value = t
    this.waterUniforms.uTime.value = t
    for (const u of this.windUniforms) u.value = t

    // sun / moon / sky palette
    const angle = ((dayTime - 6) / 24) * TAU
    const sunDir = new THREE.Vector3(Math.cos(angle) * 0.92, Math.sin(angle), 0.36).normalize()
    this.skyUniforms.uSunDir.value.copy(sunDir)
    const se = sunDir.y
    const day = smoothstep(-0.02, 0.32, se)
    const dusk = smoothstep(-0.22, 0.06, se) * (1 - smoothstep(0.02, 0.36, se))
    const night = 1 - smoothstep(-0.22, 0.04, se)
    this.skyUniforms.uNight.value = night

    const zenithDay = new THREE.Color(0x2e6db4)
    const zenithDusk = new THREE.Color(0x2a3566)
    const zenithNight = new THREE.Color(0x050914)
    const horizDay = new THREE.Color(0xc4dcea)
    const horizDusk = new THREE.Color(0xff9a5c)
    const horizNight = new THREE.Color(0x131f33)
    const zen = zenithNight.clone().lerp(zenithDusk, dusk).lerp(zenithDay, day)
    const hor = horizNight.clone().lerp(horizDusk, dusk).lerp(horizDay, day)
    this.skyUniforms.uZenith.value.copy(zen)
    this.skyUniforms.uHorizon.value.copy(hor)
    const sunCol = new THREE.Color(0xffd9a0).lerp(new THREE.Color(0xfff4e0), day)
    this.skyUniforms.uSunColor.value.copy(sunCol)
    this.skyUniforms.uCloudTint.value.copy(new THREE.Color(0x2a3242).lerp(new THREE.Color(0xffffff), day))

    this.sun.position.copy(playerPos).add(sunDir.clone().multiplyScalar(90))
    this.sun.target.position.copy(playerPos)
    this.sun.color.copy(new THREE.Color(0xff9c5a).lerp(new THREE.Color(0xfff2da), day))
    this.sun.intensity = 0.12 + day * 2.5 + dusk * 0.5
    this.moon.position.copy(playerPos).add(sunDir.clone().multiplyScalar(-90))
    this.moon.intensity = night * 0.35
    this.hemi.intensity = 0.18 + day * 0.75
    this.hemi.color.copy(new THREE.Color(0x6f84b8).lerp(new THREE.Color(0xcfe6ff), day))
    this.hemi.groundColor.copy(new THREE.Color(0x2a2c25).lerp(new THREE.Color(0x5a513c), day))

    this.scene.fog.color.copy(hor).lerp(new THREE.Color(0x9fb6c4), 0.25)
    this.waterUniforms.uFogColor.value.copy(this.scene.fog.color)
    this.waterUniforms.uSunDir.value.copy(sunDir)
    this.waterUniforms.uSunColor.value.copy(sunCol)
    this.waterUniforms.uDeep.value.copy(new THREE.Color(0x0a2730).lerp(new THREE.Color(0x123f4a), day))
    this.waterUniforms.uShallow.value.copy(new THREE.Color(0x17484f).lerp(new THREE.Color(0x3a8c86), day))

    this.sky.position.copy(playerPos)

    // floating bits
    for (const s of this.shrines) {
      s.crystal.rotation.y += dt * 0.5
      s.crystal.position.y = 3.4 + Math.sin(t * 1.4 + s.x) * 0.18
      s.shards.children.forEach((sh) => {
        const a = sh.userData.a + t * 0.7
        sh.position.set(Math.cos(a) * sh.userData.r, 3.4 + Math.sin(t * 1.4 + s.x) * 0.18, Math.sin(a) * sh.userData.r)
        sh.rotation.y = t
      })
      s.ring.rotation.z += dt * 0.3
      if (s.lit) {
        s.light.intensity = 8 + Math.sin(t * 3 + s.x) * 2
        s.beam.material.opacity = 0.2 + Math.sin(t * 2) * 0.05
      }
    }

    // fire flicker
    const isNight = night > 0.45
    for (const f of this.flames) {
      const flick = 0.82 + Math.sin(t * 10 + f.x) * 0.12 + Math.sin(t * 23 + f.z) * 0.06
      f.light.intensity = f.base * flick * (0.75 + (isNight ? 0.5 : 0.1))
      for (const fl of f.flames) {
        fl.scale.y = flick * (0.9 + Math.sin(t * 13 + fl.userData.phase) * 0.12)
        fl.scale.x = fl.scale.z = 0.9 + Math.sin(t * 9 + fl.userData.phase) * 0.1
        fl.rotation.y = t * 2 + fl.userData.phase
      }
      if (f.coal) f.coal.material.emissiveIntensity = 2.4 + flick * 0.8
    }

    // window and lamp glow
    for (const w of this.windowLights) {
      const target = isNight ? 1.8 : 0.0
      if (w.isMesh || w.material) {
        const m = w.material ? w : w
        m.material.emissiveIntensity = lerp(m.material.emissiveIntensity, target, dt * 1.5)
      }
      if (w.light) w.light.intensity = lerp(w.light.intensity, isNight ? 2.6 : 0.0, dt * 1.5)
      if (w.glow) w.mesh.material.emissiveIntensity = isNight ? 2.6 : 0.6
    }

    for (const h of this.herbs) {
      if (h.collected) continue
      h.group.position.y = h.y + Math.sin(t * 2 + h.bob) * 0.08
      h.group.rotation.y += dt * 0.4
      h.light.intensity = 1.0 + Math.sin(t * 3 + h.bob) * 0.4
    }

    for (const p of this.floating) {
      if (p.kind === 'flag') {
        p.mesh.rotation.y = Math.sin(t * 2 + p.phase) * 0.25
        p.mesh.position.y = p.base + Math.sin(t * 3 + p.phase) * (p.amp || 0.03)
      }
    }

    this.circle.core.rotation.y += dt * 0.4
    this.circle.core.position.y = 2.1 + Math.sin(t * 1.2) * 0.15

    // fireflies / dust motes follow the player
    if (this.motes) {
      this.motes.material.opacity = 0.25 + night * 0.7
      const arr = this.motes.geometry.attributes.position.array
      const md = this.moteData
      for (let i = 0; i < md.length; i++) {
        const m = md[i]
        const a = m.a + t * m.speed * 0.15
        arr[i * 3] = playerPos.x + Math.cos(a) * m.r
        arr[i * 3 + 1] = playerPos.y + m.y + Math.sin(t * 0.8 + m.phase) * 0.6
        arr[i * 3 + 2] = playerPos.z + Math.sin(a) * m.r
      }
      this.motes.geometry.attributes.position.needsUpdate = true
    }

    for (const s of this.cloudSprites.children) {
      s.position.x += dt * 0.6
      if (s.position.x > 700) s.position.x -= 1400
    }
    this.cloudSprites.rotation.y = t * 0.001
    this.cloudSprites.children.forEach((s) => {
      const d = s.material
      d.opacity = 0.18 + day * 0.42
    })
  }

  collectHerb(herb) {
    herb.collected = true
    herb.group.visible = false
  }

  openChest(chest) {
    chest.opened = true
    chest.lidPivot.rotation.x = -1.9
    chest.glow.intensity = 0
  }

  resetChestVisual(chest) {
    chest.opened = true
    chest.lidPivot.rotation.x = -1.9
    chest.glow.intensity = 0
  }

  // --------------------------------------------------------------------- map
  renderMap(size = 256) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(size, size)
    const col = new THREE.Color()
    const half = WORLD_SIZE / 2
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size) * WORLD_SIZE - half
        const z = (py / size) * WORLD_SIZE - half
        const h = this.heightAt(x, z)
        const n = this.normalAt(x, z, 2).y
        if (h < WATER_LEVEL) {
          const d = clamp((WATER_LEVEL - h) / 5, 0, 1)
          col.setHex(0x3d7d84).lerp(new THREE.Color(0x123a45), d)
        } else {
          this.terrainColor(x, z, h, n, col)
          const light = clamp(0.65 + (h - 3) * 0.015, 0.55, 1.05)
          col.multiplyScalar(light)
        }
        const i = (py * size + px) * 4
        img.data[i] = clamp(col.r ** (1 / 2.2) * 255, 0, 255)
        img.data[i + 1] = clamp(col.g ** (1 / 2.2) * 255, 0, 255)
        img.data[i + 2] = clamp(col.b ** (1 / 2.2) * 255, 0, 255)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // subtle vignette
    const grd = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.55)
    grd.addColorStop(0, 'rgba(0,0,0,0)')
    grd.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size, size)
    return c
  }

  dispose() {
    this.scene.remove(this.group)
    this.scene.remove(this.sky)
    this.scene.remove(this.motes)
    this.scene.remove(this.cloudSprites)
    this.scene.remove(this.hemi)
    this.scene.remove(this.sun)
    this.scene.remove(this.sun.target)
    this.scene.remove(this.moon)
  }
}
