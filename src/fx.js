import * as THREE from 'three'
import { rand, clamp } from './utils.js'

const MAX_PARTICLES = 1200

export class FX {
  constructor(scene) {
    this.scene = scene
    this.shake = 0
    this.shakeTime = 0
    this.hitstop = 0

    const positions = new Float32Array(MAX_PARTICLES * 3)
    const colors = new Float32Array(MAX_PARTICLES * 3)
    const sizes = new Float32Array(MAX_PARTICLES)
    const alphas = new Float32Array(MAX_PARTICLES)
    this.data = []
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.data.push({ life: 0, maxLife: 1, vel: new THREE.Vector3(), gravity: 0, drag: 0, size: 0.2 })
      positions[i * 3 + 1] = -9999
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    this.geo = geo
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (240.0 / max(-mv.z, 1.0));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float glow = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(vColor, vAlpha * glow);
        }
      `
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    this.cursor = 0
    this.active = 0

    // shockwave rings
    this.rings = []
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 1.0, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      )
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 6
      scene.add(mesh)
      this.rings.push({ mesh, life: 0, maxLife: 1, maxR: 4 })
    }
    this.ringCursor = 0

    // light flashes
    this.flashes = []
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 2)
      scene.add(l)
      this.flashes.push({ light: l, life: 0, maxLife: 0.3, base: 0 })
    }
    this.flashCursor = 0
  }

  spawn(pos, opts = {}) {
    const count = opts.count ?? 12
    const color = new THREE.Color(opts.color ?? 0xffdd88)
    const spread = opts.spread ?? 0.3
    const speed = opts.speed ?? 4
    const gravity = opts.gravity ?? 9
    const life = opts.life ?? 0.6
    const size = opts.size ?? 0.18
    const drag = opts.drag ?? 1.5
    const dirBias = opts.dir ?? null
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX_PARTICLES
      const d = this.data[i]
      d.life = life * rand(0.6, 1.2)
      d.maxLife = d.life
      d.vel.set(rand(-1, 1), rand(-0.1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.35, 1))
      if (dirBias) d.vel.addScaledVector(dirBias, speed * 0.7)
      d.gravity = gravity
      d.drag = drag
      d.size = size * rand(0.6, 1.5)
      const p = this.geo.attributes.position.array
      p[i * 3] = pos.x + rand(-spread, spread)
      p[i * 3 + 1] = pos.y + rand(-spread, spread)
      p[i * 3 + 2] = pos.z + rand(-spread, spread)
      const c = color.clone().offsetHSL(rand(-0.04, 0.04), 0, rand(-0.08, 0.08))
      const ca = this.geo.attributes.aColor.array
      ca[i * 3] = c.r
      ca[i * 3 + 1] = c.g
      ca[i * 3 + 2] = c.b
      this.geo.attributes.aSize.array[i] = d.size
      this.geo.attributes.aAlpha.array[i] = 1
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aColor.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
  }

  burstDirectional(pos, dir, opts = {}) {
    this.spawn(pos, { ...opts, dir })
  }

  ring(pos, opts = {}) {
    const r = this.rings[this.ringCursor]
    this.ringCursor = (this.ringCursor + 1) % this.rings.length
    r.mesh.position.copy(pos)
    r.mesh.position.y = pos.y + 0.08
    r.mesh.material.color.set(opts.color ?? 0xffffff)
    r.mesh.material.opacity = opts.opacity ?? 0.8
    r.mesh.scale.setScalar(0.4)
    r.mesh.visible = true
    r.life = opts.life ?? 0.55
    r.maxLife = r.life
    r.maxR = opts.maxR ?? 5
    r.baseOpacity = opts.opacity ?? 0.8
  }

  flash(pos, color = 0xffffff, intensity = 8, life = 0.25) {
    const f = this.flashes[this.flashCursor]
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length
    f.light.position.copy(pos)
    f.light.color.set(color)
    f.light.intensity = intensity
    f.life = life
    f.maxLife = life
    f.base = intensity
  }

  addShake(amount, time = 0.25) {
    this.shake = Math.max(this.shake, amount)
    this.shakeTime = Math.max(this.shakeTime, time)
  }

  update(dt) {
    const pos = this.geo.attributes.position.array
    const alpha = this.geo.attributes.aAlpha.array
    const sizes = this.geo.attributes.aSize.array
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const d = this.data[i]
      if (d.life <= 0) continue
      d.life -= dt
      if (d.life <= 0) {
        alpha[i] = 0
        pos[i * 3 + 1] = -9999
        continue
      }
      d.vel.y -= d.gravity * dt
      const dragF = Math.max(0, 1 - d.drag * dt)
      d.vel.multiplyScalar(dragF)
      pos[i * 3] += d.vel.x * dt
      pos[i * 3 + 1] += d.vel.y * dt
      pos[i * 3 + 2] += d.vel.z * dt
      const t = d.life / d.maxLife
      alpha[i] = t * t
      sizes[i] = d.size * (0.6 + t * 0.6)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true

    for (const r of this.rings) {
      if (r.life <= 0) continue
      r.life -= dt
      const t = 1 - clamp(r.life / r.maxLife, 0, 1)
      const s = 0.3 + t * r.maxR
      r.mesh.scale.set(s, s, s)
      r.mesh.material.opacity = (1 - t) * r.baseOpacity
      if (r.life <= 0) r.mesh.visible = false
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue
      f.life -= dt
      f.light.intensity = Math.max(0, f.base * (f.life / f.maxLife))
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt
      if (this.shakeTime <= 0) this.shake = 0
    }
  }

  get shakeOffset() {
    if (this.shake <= 0 || this.shakeTime <= 0) return { x: 0, y: 0 }
    const s = this.shake * this.shakeTime * 2.0
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s }
  }
}
