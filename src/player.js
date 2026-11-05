import * as THREE from 'three'
import { clamp, damp, lerp, angleLerp, TAU } from './utils.js'

const WALK_SPEED = 5.4
const SPRINT_SPEED = 8.6
const SWIM_SPEED = 3.0
const GRAVITY = 27
const JUMP_VEL = 8.6
const RADIUS = 0.45

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.82, metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flat ?? false
  })
}

function part(geo, material, x, y, z, parent) {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

function makeSlashGeometry() {
  const inner = 0.85, outer = 2.7
  const a0 = -1.35, a1 = 1.35
  const seg = 22
  const pos = []
  const idx = []
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg)
    pos.push(Math.sin(a) * inner, 0, Math.cos(a) * inner)
    pos.push(Math.sin(a) * outer, 0, Math.cos(a) * outer)
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

export class Player {
  constructor(scene, world, callbacks = {}) {
    this.scene = scene
    this.world = world
    this.cb = callbacks
    this.pos = new THREE.Vector3(0, world.heightAt(0, 24), 24)
    this.vel = new THREE.Vector3()
    this.modelYaw = Math.PI
    this.camYaw = 0
    this.camPitch = 0.22
    this.camDist = 6.2
    this.grounded = true
    this.inWater = false
    this.swimming = false

    this.maxHp = 100
    this.hp = 100
    this.maxStamina = 100
    this.stamina = 100
    this.staminaDelay = 0
    this.level = 1
    this.xp = 0
    this.xpNext = 120
    this.gold = 25
    this.potions = 2
    this.herbs = 0
    this.swordTier = 1
    this.baseDamage = 13
    this.killCount = 0
    this.dead = false

    this.attackCd = 0
    this.combo = 0
    this.comboTimer = 0
    this.attackTime = -1
    this.attackDuration = 0.52
    this.attackHitDone = false
    this.rollTime = 0
    this.rollDir = new THREE.Vector3()
    this.iframes = 0
    this.hurtFlash = 0
    this.potionCd = 0
    this.regenDelay = 0
    this.sprintTime = 0
    this.walkPhase = 0
    this.idleTime = Math.random() * 4
    this.speed = 0
    this.locked = false
    this.lastMove = new THREE.Vector3(0, 0, -1)

    this.buildModel()
    this.trail = this.buildTrail()
    scene.add(this.group)
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.modelYaw
  }

  buildModel() {
    const g = new THREE.Group()
    this.group = g
    const rig = new THREE.Group()
    this.rig = rig
    g.add(rig)

    const tunic = mat(0x2c6870)
    const tunicDark = mat(0x224f56)
    const leather = mat(0x5a3d26)
    const skin = mat(0xd7a577)
    const hair = mat(0x2c211b)
    const metal = mat(0xc3ccd6, { metalness: 0.75, roughness: 0.3 })
    const gold = mat(0xc9a04a, { metalness: 0.8, roughness: 0.3 })
    const capeMat = mat(0x7c2f35, { roughness: 0.9 })

    // torso
    const torso = part(new THREE.CapsuleGeometry(0.33, 0.5, 5, 10), tunic, 0, 1.34, 0, rig)
    torso.scale.z = 0.78
    part(new THREE.CylinderGeometry(0.35, 0.36, 0.14, 10), leather, 0, 1.03, 0, rig)
    part(new THREE.BoxGeometry(0.12, 0.12, 0.05), gold, 0, 1.03, 0.35, rig)
    // chest strap
    const strap = part(new THREE.BoxGeometry(0.08, 0.8, 0.04), leather, 0.12, 1.38, 0.3, rig)
    strap.rotation.z = -0.5
    // shoulders
    part(new THREE.SphereGeometry(0.17, 8, 6), tunicDark, -0.36, 1.55, 0, rig)
    part(new THREE.SphereGeometry(0.17, 8, 6), tunicDark, 0.36, 1.55, 0, rig)
    // neck + head
    part(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 8), skin, 0, 1.69, 0, rig)
    const head = part(new THREE.SphereGeometry(0.235, 12, 10), skin, 0, 1.88, 0, rig)
    head.scale.set(0.92, 1.05, 0.92)
    // hair
    const hairMesh = part(new THREE.SphereGeometry(0.245, 12, 10, 0, TAU, 0, 1.9), hair, 0, 1.92, -0.01, rig)
    hairMesh.scale.set(0.96, 1.0, 0.98)
    part(new THREE.BoxGeometry(0.06, 0.18, 0.06), hair, -0.19, 1.78, 0.06, rig)
    part(new THREE.BoxGeometry(0.06, 0.18, 0.06), hair, 0.19, 1.78, 0.06, rig)
    // eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x201a17 })
    part(new THREE.SphereGeometry(0.028, 6, 5), eyeMat, -0.08, 1.9, 0.21, rig)
    part(new THREE.SphereGeometry(0.028, 6, 5), eyeMat, 0.08, 1.9, 0.21, rig)

    // arms
    const makeArm = (side) => {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.42, 1.53, 0)
      rig.add(pivot)
      const upper = part(new THREE.CapsuleGeometry(0.1, 0.32, 4, 8), tunic, 0, -0.22, 0, pivot)
      const fore = new THREE.Group()
      fore.position.set(0, -0.47, 0)
      pivot.add(fore)
      part(new THREE.CapsuleGeometry(0.085, 0.28, 4, 8), skin, 0, -0.17, 0, fore)
      const hand = part(new THREE.SphereGeometry(0.1, 8, 6), skin, 0, -0.36, 0, fore)
      return { pivot, fore, hand, upper }
    }
    this.armL = makeArm(-1)
    this.armR = makeArm(1)

    // sword in right hand
    const sword = new THREE.Group()
    sword.position.set(0, -0.38, 0.02)
    this.armR.fore.add(sword)
    this.sword = sword
    this.bladeMat = mat(0xd7e2ec, { metalness: 0.9, roughness: 0.22 })
    const blade = part(new THREE.BoxGeometry(0.085, 1.15, 0.025), this.bladeMat, 0, -0.66, 0, sword)
    const tip = part(new THREE.ConeGeometry(0.055, 0.18, 4), this.bladeMat, 0, -1.32, 0, sword)
    tip.rotation.y = Math.PI / 4
    part(new THREE.BoxGeometry(0.38, 0.06, 0.09), gold, 0, -0.06, 0, sword)
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6), leather, 0, 0.08, 0, sword)
    part(new THREE.SphereGeometry(0.06, 6, 5), gold, 0, 0.22, 0, sword)
    sword.rotation.z = 0.15

    // shield on back
    const shield = new THREE.Group()
    shield.position.set(0, 1.3, -0.32)
    shield.rotation.x = 0.1
    rig.add(shield)
    part(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 12), leather, 0, 0, 0, shield).rotation.x = Math.PI / 2
    part(new THREE.CylinderGeometry(0.23, 0.23, 0.09, 12), tunicDark, 0, 0, -0.01, shield).rotation.x = Math.PI / 2
    part(new THREE.SphereGeometry(0.08, 8, 6), gold, 0, 0, -0.07, shield)

    // legs
    const makeLeg = (side) => {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.17, 0.95, 0)
      rig.add(pivot)
      part(new THREE.CapsuleGeometry(0.12, 0.38, 4, 8), tunicDark, 0, -0.28, 0, pivot)
      const lower = new THREE.Group()
      lower.position.set(0, -0.58, 0)
      pivot.add(lower)
      part(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), leather, 0, -0.16, 0, lower)
      part(new THREE.BoxGeometry(0.2, 0.13, 0.34), leather, 0, -0.38, 0.06, lower)
      return { pivot, lower }
    }
    this.legL = makeLeg(-1)
    this.legR = makeLeg(1)

    // cape
    const capeGeo = new THREE.PlaneGeometry(0.72, 1.18, 4, 6)
    capeGeo.translate(0, -0.55, 0)
    this.cape = new THREE.Mesh(capeGeo, capeMat)
    this.cape.position.set(0, 1.55, -0.28)
    this.cape.castShadow = true
    this.cape.receiveShadow = true
    rig.add(this.cape)
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.5, 2, 4), capeMat)
    cloth.position.set(0, 0.98, 0.32)
    cloth.rotation.x = -0.1
    rig.add(cloth)

    // hood / collar
    part(new THREE.TorusGeometry(0.2, 0.06, 5, 12), capeMat, 0, 1.68, 0, rig).rotation.x = Math.PI / 2

    // sword trail
    this.slashGroup = new THREE.Group()
    this.slashGroup.position.y = 1.25
    rig.add(this.slashGroup)
  }

  buildTrail() {
    const geo = makeSlashGeometry()
    const mtl = new THREE.MeshBasicMaterial({
      color: 0xdff6ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
    const mesh = new THREE.Mesh(geo, mtl)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.05
    mesh.visible = false
    this.slashGroup.add(mesh)
    return { mesh, mtl }
  }

  setSwordTier(tier) {
    this.swordTier = tier
    this.baseDamage = tier === 3 ? 26 : tier === 2 ? 19 : 13
    if (tier >= 2) {
      this.bladeMat.color.set(0xbfe9ff)
      this.bladeMat.emissive.set(tier === 3 ? 0x66d9ff : 0x1f7a8a)
      this.bladeMat.emissiveIntensity = tier === 3 ? 1.3 : 0.5
      this.sword.scale.setScalar(tier === 3 ? 1.12 : 1.05)
      this.sword.children[0].material = this.bladeMat
    }
  }

  get damage() {
    return Math.round(this.baseDamage + (this.level - 1) * 1.6)
  }

  get facing() {
    return new THREE.Vector3(Math.sin(this.modelYaw), 0, Math.cos(this.modelYaw))
  }

  addXp(amount) {
    this.xp += amount
    let leveled = false
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext
      this.level++
      this.xpNext = Math.round(this.xpNext * 1.32 + 40)
      this.maxHp += 12
      this.hp = this.maxHp
      this.maxStamina += 4
      this.stamina = this.maxStamina
      leveled = true
    }
    if (leveled) this.cb.onLevelUp?.(this.level)
    this.cb.onXp?.()
  }

  heal(n) {
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + n)
    return this.hp - before
  }

  usePotion() {
    if (this.potions <= 0 || this.potionCd > 0 || this.hp >= this.maxHp || this.dead) {
      if (this.potions <= 0) this.cb.onToast?.('No potions left', 'warn')
      return false
    }
    this.potions--
    this.potionCd = 1.2
    const healed = this.heal(48)
    this.cb.onPotion?.(healed)
    return true
  }

  takeDamage(amount, fromPos) {
    if (this.dead || this.iframes > 0) return false
    this.hp -= amount
    this.iframes = 0.72
    this.hurtFlash = 0.4
    this.regenDelay = 8
    if (fromPos) {
      const d = this.pos.clone().sub(fromPos)
      d.y = 0
      if (d.lengthSq() > 0.001) d.normalize()
      this.vel.addScaledVector(d, 4.5)
    }
    this.cb.onHurt?.(amount, fromPos)
    if (this.hp <= 0) {
      this.hp = 0
      this.dead = true
      this.cb.onDeath?.()
    }
    return true
  }

  revive(pos) {
    this.dead = false
    this.hp = this.maxHp
    this.stamina = this.maxStamina
    this.pos.copy(pos)
    this.vel.set(0, 0, 0)
    this.iframes = 2.0
    this.group.position.copy(pos)
    this.group.visible = true
  }

  startAttack() {
    if (this.attackCd > 0 || this.rollTime > 0 || this.dead) return false
    if (this.stamina < 7) {
      this.cb.onToast?.('Too exhausted to swing', 'warn')
      return false
    }
    this.stamina -= 7
    this.staminaDelay = 0.8
    this.combo = this.comboTimer > 0 ? (this.combo + 1) % 3 : 0
    this.comboTimer = 0.95
    this.attackCd = 0.44
    this.attackTime = 0
    this.attackHitDone = false
    this.attackDuration = this.combo === 2 ? 0.62 : 0.48
    this.cb.onSwing?.(this.combo)
    return true
  }

  startRoll(dir) {
    if (this.rollTime > 0 || this.attackCd > 0.2 || this.dead) return false
    if (this.stamina < 20) {
      this.cb.onToast?.('Not enough stamina to dodge', 'warn')
      return false
    }
    this.stamina -= 20
    this.staminaDelay = 0.9
    this.rollTime = 0.42
    this.iframes = Math.max(this.iframes, 0.42)
    if (dir && dir.lengthSq() > 0.01) this.rollDir.copy(dir).normalize()
    else this.rollDir.copy(this.facing).multiplyScalar(-1)
    this.cb.onRoll?.()
    return true
  }

  update(dt, input) {
    if (this.dead) {
      this.updateModel(dt, 0)
      return
    }
    this.attackCd = Math.max(0, this.attackCd - dt)
    this.comboTimer = Math.max(0, this.comboTimer - dt)
    this.iframes = Math.max(0, this.iframes - dt)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt)
    this.potionCd = Math.max(0, this.potionCd - dt)
    this.regenDelay = Math.max(0, this.regenDelay - dt)
    this.sprintTime = Math.max(0, this.sprintTime - dt)

    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw))
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    const move = new THREE.Vector3()
    if (input.forward) move.add(fwd)
    if (input.back) move.sub(fwd)
    if (input.right) move.add(right)
    if (input.left) move.sub(right)
    const moving = move.lengthSq() > 0.001
    if (moving) move.normalize()

    const ground = this.world.heightAt(this.pos.x, this.pos.z)
    this.inWater = ground < 1.02
    this.swimming = ground < -0.9

    let speed = this.inWater ? SWIM_SPEED : WALK_SPEED
    const sprinting = input.sprint && moving && this.stamina > 1 && !this.inWater && this.rollTime <= 0
    if (sprinting) {
      speed = SPRINT_SPEED
      this.stamina -= 17 * dt
      this.staminaDelay = 0.7
      this.sprintTime += dt
    }

    if (this.rollTime > 0) {
      this.rollTime -= dt
      const t = 1 - this.rollTime / 0.42
      const rollSpeed = lerp(11.5, 4.0, t * t)
      this.pos.addScaledVector(this.rollDir, rollSpeed * dt)
    } else if (moving) {
      const attackPenalty = this.attackTime >= 0 ? 0.42 : 1
      this.pos.addScaledVector(move, speed * attackPenalty * dt)
      if (this.attackTime < 0 && this.comboTimer <= 0.05) {
        this.lastMove.copy(move)
      }
    }

    // collisions
    for (const c of this.world.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z
      const d = Math.hypot(dx, dz)
      const rr = c.r + RADIUS
      if (d < rr && d > 0.0001) {
        const push = (rr - d) / d
        this.pos.x += dx * push
        this.pos.z += dz * push
      }
    }
    // world bounds
    const rad = Math.hypot(this.pos.x, this.pos.z)
    if (rad > 232) {
      this.pos.x *= 232 / rad
      this.pos.z *= 232 / rad
    }

    // vertical
    if (input.jump && this.grounded && this.rollTime <= 0) {
      this.vel.y = JUMP_VEL
      this.grounded = false
      this.stamina = Math.max(0, this.stamina - 6)
      this.cb.onJump?.()
    }
    this.vel.y -= GRAVITY * dt
    this.pos.y += this.vel.y * dt
    const gh = this.world.heightAt(this.pos.x, this.pos.z)
    let floor = gh
    if (this.swimming) floor = Math.max(gh, -0.55)
    if (this.pos.y <= floor) {
      if (!this.grounded && this.vel.y < -6) this.cb.onLand?.(-this.vel.y)
      this.pos.y = floor
      this.vel.y = 0
      this.grounded = true
    } else {
      this.grounded = false
    }

    // attack update
    if (this.attackTime >= 0) {
      this.attackTime += dt
      if (!this.attackHitDone && this.attackTime > 0.14) {
        this.attackHitDone = true
        this.cb.onAttackHit?.(this)
      }
      if (this.attackTime > this.attackDuration) {
        this.attackTime = -1
        this.trail.mesh.visible = false
        this.trail.mtl.opacity = 0
      }
    }

    // sword trail
    if (this.attackTime >= 0) {
      const t = clamp((this.attackTime - 0.05) / (this.attackDuration * 0.6), 0, 1)
      this.trail.mesh.visible = t > 0.05 && t < 0.95
      this.trail.mtl.opacity = Math.sin(t * Math.PI) * 0.55
      this.slashGroup.rotation.y = lerp(1.1, -1.2, t)
      this.slashGroup.position.y = 1.15 + Math.sin(t * Math.PI) * 0.15
      this.slashGroup.scale.setScalar(1.0 + this.combo * 0.08)
    }

    // stamina / regen
    this.staminaDelay = Math.max(0, this.staminaDelay - dt)
    if (this.staminaDelay <= 0) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 19 * dt)
    }
    if (this.regenDelay <= 0 && this.hp < this.maxHp) {
      this.heal(1.2 * dt)
    }

    // facing
    if (this.attackTime >= 0) {
      const want = Math.atan2(fwd.x, fwd.z)
      this.modelYaw = angleLerp(this.modelYaw, want, 1 - Math.exp(-18 * dt))
    } else if (this.rollTime > 0) {
      const want = Math.atan2(this.rollDir.x, this.rollDir.z)
      this.modelYaw = angleLerp(this.modelYaw, want, 1 - Math.exp(-14 * dt))
    } else if (moving) {
      const want = Math.atan2(move.x, move.z)
      this.modelYaw = angleLerp(this.modelYaw, want, 1 - Math.exp(-12 * dt))
    }

    this.speed = moving ? speed : 0
    if (moving && this.grounded) this.walkPhase += dt * (speed * 1.55)
    else this.walkPhase += dt * 1.2
    this.idleTime += dt

    this.group.position.copy(this.pos)
    this.group.rotation.y = this.modelYaw
    this.updateModel(dt, moving ? speed : 0)
  }

  updateModel(dt, speed) {
    const t = this.idleTime
    const moving = speed > 0.1
    const run = clamp(speed / SPRINT_SPEED, 0, 1)
    const phase = this.walkPhase
    const swing = moving ? Math.sin(phase) : 0
    const swing2 = moving ? Math.sin(phase + Math.PI) : 0
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.045 * (0.6 + run) : Math.sin(t * 1.6) * 0.012
    const attack = this.attackTime >= 0 ? this.attackTime / this.attackDuration : -1

    this.rig.position.y = bob
    this.rig.rotation.x = 0
    this.rig.rotation.z = 0

    if (this.rollTime > 0) {
      const p = 1 - this.rollTime / 0.42
      this.rig.rotation.x = p * TAU
      this.rig.position.y = Math.sin(p * Math.PI) * 0.35
    }

    // legs
    const legAmp = moving ? (0.55 + run * 0.35) : 0
    this.legL.pivot.rotation.x = swing * legAmp
    this.legR.pivot.rotation.x = swing2 * legAmp
    this.legL.lower.rotation.x = Math.max(0, -swing) * 0.7 * (moving ? 1 : 0)
    this.legR.lower.rotation.x = Math.max(0, -swing2) * 0.7 * (moving ? 1 : 0)
    if (!this.grounded) {
      this.legL.pivot.rotation.x = 0.45
      this.legR.pivot.rotation.x = -0.25
      this.legL.lower.rotation.x = 0.6
      this.legR.lower.rotation.x = 0.4
    }

    // arms
    let armRX = -0.12 + swing2 * (moving ? 0.38 : 0) + Math.sin(t * 1.4) * 0.02
    let armLX = -0.05 + swing * (moving ? 0.5 : 0)
    let armRZ = 0.1
    let foreRX = -0.35
    let foreLX = -0.2

    if (attack >= 0) {
      const wind = 0.14 / this.attackDuration
      const hit = 0.42 / this.attackDuration
      if (attack < wind) {
        const p = attack / wind
        armRX = lerp(-0.2, -2.55, p)
        armRZ = lerp(0.1, -0.4, p)
        foreRX = lerp(-0.3, -0.55, p)
      } else if (attack < hit) {
        const p = (attack - wind) / (hit - wind)
        const e = p * p * (3 - 2 * p)
        armRX = lerp(-2.55, 0.85, e)
        armRZ = lerp(-0.4, 0.5, e)
        foreRX = lerp(-0.55, -0.05, e)
      } else {
        const p = (attack - hit) / (1 - hit)
        armRX = lerp(0.85, -0.12, p)
        armRZ = lerp(0.5, 0.1, p)
        foreRX = lerp(-0.05, -0.35, p)
      }
    } else if (this.attackCd > 0.2) {
      armRX = 0.85
    }

    this.armR.pivot.rotation.x = armRX
    this.armR.pivot.rotation.z = armRZ
    this.armR.fore.rotation.x = foreRX
    this.armL.pivot.rotation.x = armLX
    this.armL.pivot.rotation.z = -0.1
    this.armL.fore.rotation.x = foreLX

    // torso lean
    if (moving) this.rig.rotation.z = -0.06 * run
    if (attack >= 0) this.rig.rotation.z = lerp(0, -0.12, Math.sin(attack * Math.PI))

    // cape
    const sway = moving ? Math.sin(phase * 2) * 0.12 : Math.sin(t * 1.2) * 0.03
    this.cape.rotation.x = 0.18 + (moving ? run * 0.5 : 0) + sway
    this.cape.rotation.z = sway * 0.4
    this.cape.position.y = 1.55 + bob

    // hurt flash on tunic? flicker all materials gently
    if (this.hurtFlash > 0) {
      const f = this.hurtFlash * 2
      this.rig.position.x = Math.sin(t * 90) * 0.02 * f
    } else {
      this.rig.position.x = 0
    }
  }

  getState() {
    return {
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      hp: this.hp, stamina: this.stamina, maxHp: this.maxHp, maxStamina: this.maxStamina,
      level: this.level, xp: this.xp, xpNext: this.xpNext, gold: this.gold,
      potions: this.potions, herbs: this.herbs, swordTier: this.swordTier,
      killCount: this.killCount, camYaw: this.camYaw, camPitch: this.camPitch
    }
  }

  loadState(s) {
    if (!s) return
    if (s.pos) this.pos.set(s.pos.x, s.pos.y, s.pos.z)
    this.hp = s.hp ?? this.hp
    this.stamina = s.stamina ?? this.stamina
    this.maxHp = s.maxHp ?? this.maxHp
    this.maxStamina = s.maxStamina ?? this.maxStamina
    this.level = s.level ?? this.level
    this.xp = s.xp ?? this.xp
    this.xpNext = s.xpNext ?? this.xpNext
    this.gold = s.gold ?? this.gold
    this.potions = s.potions ?? this.potions
    this.herbs = s.herbs ?? this.herbs
    this.killCount = s.killCount ?? 0
    this.camYaw = s.camYaw ?? 0
    this.camPitch = s.camPitch ?? 0.22
    if (s.swordTier) this.setSwordTier(s.swordTier)
    this.group.position.copy(this.pos)
  }
}
