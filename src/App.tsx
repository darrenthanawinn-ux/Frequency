import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  Activity,
  ChevronRight,
  Clock,
  Link2,
  MapPin,
  Radio,
  Send,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react'

/* ════════════════════════════════════════════════════════════════════════
   FREQUENCY — an ambient constellation of campus vibes.
   Everything (simulation, canvas renderer, UI, chat) lives in this file.
   ════════════════════════════════════════════════════════════════════════ */

/* ───────────── Types & constants ───────────── */

type VibeId = 'focus' | 'social' | 'creative' | 'support'

interface VibeDef {
  id: VibeId
  label: string
  tag: string
  color: string
  rgb: string
}

const VIBES: Record<VibeId, VibeDef> = {
  focus: { id: 'focus', label: 'Focus & Study', tag: 'Focus', color: '#06b6d4', rgb: '6,182,212' },
  social: { id: 'social', label: 'Hangout & Social', tag: 'Hangout', color: '#f59e0b', rgb: '245,158,11' },
  creative: { id: 'creative', label: 'Creative & Chill', tag: 'Creative', color: '#a855f7', rgb: '168,85,247' },
  support: { id: 'support', label: 'Support & Vent', tag: 'Support', color: '#10b981', rgb: '16,185,129' },
}
const VIBE_ORDER: VibeId[] = ['focus', 'social', 'creative', 'support']

const BG = '#070913'
const TAU = Math.PI * 2
const SYNC_MS = 2 * 60 * 60 * 1000 // 2 hours, shown as 01:59:59 → 00:00:00
const MAX_ORBS = 56
const LINK_RANGE = 160
const ME_LINK_RANGE = 300
const PHYS_RANGE = 460
const INITIAL_ORBS = 22
const FONT = '600 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

interface Orb {
  id: string
  alias: string
  vibe: VibeId
  status: string
  zone: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  seed: number
  born: number
  die: number // 0 = alive, otherwise timestamp the fade-out began
  hover: number // 0..1 eased hover amount
  live: boolean // broadcasting (bots always, "me" only after Broadcast)
  isMe: boolean
}

interface Ripple {
  x: number
  y: number
  born: number
  rgb: string
  max: number
  dur: number
}

interface Star {
  x: number
  y: number
  s: number
  tw: number
  p: number
}

interface ChatMsg {
  id: string
  from: 'me' | 'them' | 'system'
  text: string
  ts: number
}

interface Session {
  id: string
  alias: string
  vibe: VibeId
  zone: string
  status: string
  startedAt: number
  messages: ChatMsg[]
  pending: number // replies still on the way
}

interface Stats {
  orbs: number
  syncs: number
  dominant: VibeId | null
  counts: Record<VibeId, number>
}

interface FeedItem {
  id: string
  text: string
  color: string
}

interface Scene {
  orbs: Orb[]
  stars: Star[]
  hoverId: string | null
  selectedId: string | null
  syncedIds: Set<string>
  effects: Ripple[]
}

/* ───────────── Content pools ───────────── */

const ADJECTIVES = [
  'Quiet', 'Velvet', 'Neon', 'Lunar', 'Amber', 'Gentle', 'Hollow', 'Drifting', 'Solar', 'Misty',
  'Cosmic', 'Tender', 'Midnight', 'Wandering', 'Soft', 'Electric', 'Mellow', 'Silver', 'Golden', 'Hidden',
  'Sleepy', 'Bright', 'Cedar', 'Coral', 'Paper', 'Static',
]
const ANIMALS = [
  'Fox', 'Owl', 'Moth', 'Heron', 'Otter', 'Lynx', 'Finch', 'Koi', 'Panda', 'Gecko',
  'Raven', 'Newt', 'Crane', 'Hare', 'Wren', 'Badger', 'Seal', 'Lark', 'Ibis', 'Tiger',
  'Marmot', 'Plover', 'Stoat', 'Magpie',
]

const ZONES: Record<VibeId, string[]> = {
  focus: ['Library 2F', 'Library 4F', 'Study Pods', 'Lab Wing B', 'Maker Space', 'Quiet Annex'],
  social: ['Student Union', 'Courtyard', 'Cafeteria', 'Gym Lounge', 'Quad Lawn', 'Food Truck Row'],
  creative: ['Art Annex', 'Music Room', 'Rooftop Garden', 'Maker Space', 'Coffee Cart', 'Media Lab'],
  support: ['Quiet Room', 'Garden Bench', 'Chapel Steps', 'Bus Stop', 'Library Steps', 'Lakeside Path'],
}
const ALL_ZONES = Array.from(new Set(VIBE_ORDER.flatMap((v) => ZONES[v])))

const STATUSES: Record<VibeId, string[]> = {
  focus: [
    'Grinding through organic chem flashcards',
    'Deep work block until 6 — headphones on',
    'Debugging a segfault, send snacks',
    'Essay outline day, thesis still loading',
    'Quiet corner, calc problem set #7',
    'Pomodoro round 3, come study silently',
    'Revising for the history midterm',
    'Building my capstone slides',
    'Learning Rust between lectures',
    'Lab report due midnight, 3 graphs to go',
  ],
  social: [
    'Boba run at 4? I am buying the first round',
    'Pickup volleyball on the quad, need 2 more',
    'Anyone up for cafeteria trivia?',
    'Board games and bad takes, all welcome',
    'Heading to the food truck, join me',
    'Free period and zero plans',
    'Movie night planning — pitch me something',
    'Frisbee on the lawn if the sun holds',
    'Looking for a lunch table that is fun',
    'Karaoke in the union later, no judgement',
  ],
  creative: [
    'Sketching the whole courtyard in ink',
    'Lo-fi beats and half-finished poems',
    'Painting a mural panel, come critique',
    'Making a zine about night buses',
    'Writing a song that has no chorus yet',
    'Film club edit session, rough cut review',
    'Knitting while the playlist shuffles',
    'Photographing golden hour on the rooftop',
    'Prototyping a tiny game, need playtesters',
    'Ceramics glaze tests, my hands are blue',
  ],
  support: [
    'Rough week, just want a kind voice',
    'Anyone else feeling the finals dread?',
    'Open ear if you need to vent, no advice',
    'Homesick today — tea and quiet company',
    'Overwhelmed but trying. Say hi?',
    'Happy to listen, been there too',
    'Need a pep talk before my presentation',
    'Walking laps to clear my head',
    'Bad grade, good people — let us talk',
    'Letting today be slow. Join if you like',
  ],
}

const ICEBREAKERS: Record<VibeId, string[]> = {
  focus: ['What are you studying?', 'Silent pomodoro together?', 'Any tips for staying focused?', 'Best library floor?'],
  social: ['Coffee or boba run?', 'What are you up to later?', 'Best food spot on campus?', 'Want to grab lunch?'],
  creative: ['What are you making?', 'Send me a song rec', 'Show me your latest sketch?', 'What inspires you lately?'],
  support: ['How is your day going?', 'Want to talk it out?', 'Same here — rough week.', 'Can I just keep you company?'],
}

const GREETINGS: Record<VibeId, string[]> = {
  focus: [
    'Hey! I am tucked into {zone} with my headphones on, but a break sounds good.',
    'Oh hi — synced just in time, I was about to zone out. What are you working on?',
    'Hey there. {zone} is quiet today. Studying something fun?',
  ],
  social: [
    'Heyyy! Perfect timing, I am at {zone} and getting bored.',
    'Hi! You caught me at {zone}. What is the plan?',
    'Oh nice, a sync! I am around {zone} if you want to meet up.',
  ],
  creative: [
    'Hey — I am at {zone} with a half-finished idea and a good playlist.',
    'Hi! Just doodling over here at {zone}. What are you into lately?',
    'Oh hello. Synced at the perfect moment, I needed a creative break.',
  ],
  support: [
    'Hey, thanks for syncing. I am at {zone}. How are you really doing?',
    'Hi. It is nice to have company at {zone} today.',
    'Hey you. No pressure here — we can talk or just sit in the quiet.',
  ],
}

const VIBE_REPLIES: Record<VibeId, string[]> = {
  focus: [
    'Honestly I have been staring at the same page for ten minutes. Distraction is welcome.',
    'I work best in 25-minute bursts. Want to sync a timer later?',
    'The 4th floor has the best outlets. Do not tell everyone.',
    'Okay, but explaining my topic out loud actually helps me. Want to hear it?',
    'I am so close to finishing this section. Then snacks.',
    'Same here, deadlines are loud this week. We will get through it.',
  ],
  social: [
    'Okay yes, that sounds fun. Give me ten minutes to pack up.',
    'I know a spot near the quad with the best fries. Trust me.',
    'Haha, I like your energy. Are you bringing anyone else?',
    'Wait, that is actually a great idea. Let us do it.',
    'I am free after 4. Does that work for you?',
    'Only if the group is small and the snacks are big.',
  ],
  creative: [
    'Ooh, that is such a vibe. I have been chasing that feeling all week.',
    'I started three projects today and finished zero. Classic me.',
    'Send me whatever you are making, I will not judge. Promise.',
    'The light on the rooftop right now is unreal. You would love it.',
    'Honestly I just needed someone to bounce ideas off.',
    'That gave me an idea. I am writing it down before I lose it.',
  ],
  support: [
    'Thank you for saying that. It genuinely helps.',
    'I hear you. You do not have to have it all figured out today.',
    'It is okay to take it slow. I am here as long as you want.',
    'That sounds heavy. Do you want to talk it through or just vent?',
    'You are not alone in this. Half my floor feels the same right now.',
    'Small wins count. Did you eat something today?',
  ],
}

interface KeywordRule {
  re: RegExp
  pool: string[]
}
const KEYWORD_RULES: KeywordRule[] = [
  {
    re: /\b(hi|hey|hello|yo|sup|hiya)\b/,
    pool: ['Hey hey! Glad you synced.', 'Hi! Good to meet you, anonymous friend.', 'Yo! What is the vibe today?'],
  },
  {
    re: /(coffee|boba|tea|snack|food|lunch|eat|hungry|dinner|pizza)/,
    pool: [
      'Yes. Food. Please. I could go anywhere in the next 20 minutes.',
      'The cart by the courtyard has the best iced latte. Meet there?',
      'I am always down for snacks. You pick, I will follow.',
    ],
  },
  {
    re: /(study|exam|test|homework|assignment|class|quiz|midterm|final|project|deadline)/,
    pool: [
      'Ugh, same. The deadline pile never shrinks. Want to work side by side?',
      'I have a quiz Thursday and zero confidence. Study buddies?',
      'Splitting the reading helps me. Want to swap summaries later?',
    ],
  },
  {
    re: /(song|music|playlist|listen|band|album)/,
    pool: [
      'I have been looping a dreamy synth playlist all week. Want the link?',
      'Ooh music talk. Give me one song and I will give you three back.',
      'Right now it is rainy-day piano on repeat. You?',
    ],
  },
  {
    re: /(tired|stress|rough|anxious|overwhelm|vent|sad|lonely|bad day|burnt|burned)/,
    pool: [
      'I am sorry it is feeling heavy. I am listening, take your time.',
      'That sounds exhausting. Want to tell me more, or should I just keep you company?',
      'You are doing better than you think. Truly. Breathe for a second with me.',
    ],
  },
  {
    re: /(thanks|thank you|thx|appreciate)/,
    pool: ['Anytime. This is what the frequency is for.', 'Of course! Glad we synced.', 'No problem at all. Happy to be here.'],
  },
  {
    re: /(bye|later|gotta go|got to go|see you|ttyl)/,
    pool: ['Catch you on the next frequency!', 'Take care. This was a nice sync.', 'Later! The constellation will be here.'],
  },
]

/* ───────────── Helpers ───────────── */

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}
let uidCounter = 0
function uid(prefix = 'id'): string {
  uidCounter += 1
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`
}
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds))
  return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`
}
/** Seconds left on a sync. Starts at 7199 so the display opens at 01:59:59. */
function secondsLeft(startedAt: number, now: number): number {
  const elapsed = Math.max(0, now - startedAt)
  return Math.max(0, Math.ceil((SYNC_MS - elapsed) / 1000) - 1)
}
function isExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= SYNC_MS
}

function getBounds(w: number, h: number) {
  const compact = w < 640
  const t = compact ? 120 : 104
  const b = Math.max(h - (compact ? 215 : 170), t + 140)
  return { l: 36, r: Math.max(w - 36, 200), t, b }
}

const CLUSTER_CENTERS: Record<VibeId, [number, number]> = {
  focus: [0.27, 0.34],
  social: [0.74, 0.32],
  creative: [0.28, 0.7],
  support: [0.74, 0.7],
}

function createOrb(vibe: VibeId, w: number, h: number, taken: Set<string>, born: number, clustered: boolean): Orb {
  const bnd = getBounds(w, h)
  let alias = ''
  for (let i = 0; i < 40; i++) {
    alias = pick(ADJECTIVES) + pick(ANIMALS)
    if (!taken.has(alias)) break
  }
  if (taken.has(alias)) alias = `${alias}${Math.floor(rand(2, 99))}`
  taken.add(alias)

  let x = rand(bnd.l, bnd.r)
  let y = rand(bnd.t, bnd.b)
  if (clustered) {
    const [fx, fy] = CLUSTER_CENTERS[vibe]
    x = x * 0.5 + fx * w * 0.5 + rand(-50, 50)
    y = y * 0.5 + fy * h * 0.5 + rand(-50, 50)
  }
  return {
    id: uid('o'),
    alias,
    vibe,
    status: pick(STATUSES[vibe]).slice(0, 80),
    zone: pick(ZONES[vibe]),
    x: clamp(x, bnd.l, bnd.r),
    y: clamp(y, bnd.t, bnd.b),
    vx: rand(-0.3, 0.3),
    vy: rand(-0.3, 0.3),
    r: rand(6.5, 9),
    seed: Math.random(),
    born,
    die: 0,
    hover: 0,
    live: true,
    isMe: false,
  }
}

function makeReply(s: Session, text: string, n: number): string {
  const lower = text.toLowerCase()
  const h = hashStr(s.alias)
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(lower)) return rule.pool[(h + n) % rule.pool.length]
  }
  const pool = VIBE_REPLIES[s.vibe]
  return pool[(h + n) % pool.length]
}

/* ───────────── Simulation ───────────── */

function spawnK(o: Orb, t: number): number {
  if (o.die) return Math.max(0, 1 - (t - o.die) / 700)
  const k = Math.min(1, (t - o.born) / 900)
  if (k <= 0) return 0
  if (k >= 1) return 1
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
}

function stepSim(orbs: Orb[], w: number, h: number, t: number, dt: number, hoverId: string | null): void {
  const bnd = getBounds(w, h)
  const cx = (bnd.l + bnd.r) / 2
  const cy = (bnd.t + bnd.b) / 2
  const n = orbs.length

  for (let i = 0; i < n; i++) {
    const a = orbs[i]
    a.hover += ((hoverId === a.id ? 1 : 0) - a.hover) * Math.min(1, 0.18 * dt)

    if (a.isMe) {
      a.vx += (cx - a.x) * 0.0035 * dt
      a.vy += (cy - a.y) * 0.0035 * dt
    } else {
      a.vx += Math.cos(t * 0.00033 + a.seed * 40) * 0.0042 * dt
      a.vy += Math.sin(t * 0.00039 + a.seed * 57) * 0.0042 * dt
    }

    for (let j = i + 1; j < n; j++) {
      const c = orbs[j]
      const dx = c.x - a.x
      const dy = c.y - a.y
      const d2 = dx * dx + dy * dy
      if (d2 > PHYS_RANGE * PHYS_RANGE) continue
      const d = Math.sqrt(d2) || 0.001
      const nx = dx / d
      const ny = dy / d
      const kin = a.live && c.live && a.vibe === c.vibe
      const meInvolved = a.isMe || c.isMe

      let f = 0
      if (d < 64) f = -((64 - d) / 64) * 0.07
      else if (kin && d > 96) f = 0.0085 * (1 - d / PHYS_RANGE) * (meInvolved ? 1.5 : 1)
      else if (!kin && d < 120) f = -0.0045 * (1 - d / 120)
      if (f === 0) continue

      const fa = f * dt
      if (!a.isMe) {
        a.vx += nx * fa
        a.vy += ny * fa
      }
      if (!c.isMe) {
        c.vx -= nx * fa
        c.vy -= ny * fa
      }
    }
  }

  const damp = Math.pow(0.985, dt)
  for (const o of orbs) {
    if (o.x < bnd.l) o.vx += (bnd.l - o.x) * 0.004 * dt
    if (o.x > bnd.r) o.vx -= (o.x - bnd.r) * 0.004 * dt
    if (o.y < bnd.t) o.vy += (bnd.t - o.y) * 0.004 * dt
    if (o.y > bnd.b) o.vy -= (o.y - bnd.b) * 0.004 * dt
    o.vx *= damp
    o.vy *= damp
    const cap = o.isMe ? 0.5 : 1.0
    const sp = Math.hypot(o.vx, o.vy)
    if (sp > cap) {
      o.vx = (o.vx / sp) * cap
      o.vy = (o.vy / sp) * cap
    }
    o.x += o.vx * dt
    o.y += o.vy * dt
  }
}

/* ───────────── Canvas renderer ───────────── */

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, rgb: string): void {
  ctx.font = FONT
  const tw = ctx.measureText(text).width
  const pw = tw + 18
  const ph = 20
  roundRectPath(ctx, x - pw / 2, y - ph / 2, pw, ph, 10)
  ctx.fillStyle = 'rgba(7,9,19,0.8)'
  ctx.fill()
  ctx.strokeStyle = `rgba(${rgb},0.6)`
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 0.5)
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, sc: Scene): void {
  const { orbs, stars, hoverId, selectedId, syncedIds, effects } = sc

  /* Background */
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.setLineDash([])
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w, h)

  const big = Math.max(w, h)
  const g1 = ctx.createRadialGradient(w * 0.18, h * 0.22, 0, w * 0.18, h * 0.22, big * 0.65)
  g1.addColorStop(0, 'rgba(99,68,220,0.11)')
  g1.addColorStop(1, 'rgba(99,68,220,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, w, h)
  const g2 = ctx.createRadialGradient(w * 0.85, h * 0.82, 0, w * 0.85, h * 0.82, big * 0.6)
  g2.addColorStop(0, 'rgba(6,182,212,0.08)')
  g2.addColorStop(1, 'rgba(6,182,212,0)')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, w, h)

  for (const s of stars) {
    const a = 0.12 + 0.26 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.tw + s.p))
    ctx.fillStyle = `rgba(200,210,255,${a.toFixed(3)})`
    ctx.fillRect(s.x * w, s.y * h, s.s, s.s)
  }

  const byId = new Map<string, Orb>()
  for (const o of orbs) byId.set(o.id, o)
  const me = orbs.find((o) => o.isMe)

  /* Connections between same-vibe orbs */
  ctx.lineCap = 'round'
  for (let i = 0; i < orbs.length; i++) {
    const a = orbs[i]
    if (!a.live || a.die) continue
    for (let j = i + 1; j < orbs.length; j++) {
      const b = orbs[j]
      if (!b.live || b.die || a.vibe !== b.vibe) continue
      const meLink = a.isMe || b.isMe
      const range = meLink ? ME_LINK_RANGE : LINK_RANGE
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > range) continue
      const k = (1 - d / range) * Math.min(1, spawnK(a, t), spawnK(b, t))
      const rgb = VIBES[a.vibe].rgb

      ctx.strokeStyle = `rgba(${rgb},${(0.1 * k * (meLink ? 2 : 1)).toFixed(3)})`
      ctx.lineWidth = meLink ? 6 : 4
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()

      ctx.strokeStyle = `rgba(${rgb},${((meLink ? 0.3 : 0.16) + 0.5 * k).toFixed(3)})`
      ctx.lineWidth = meLink ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()

      const ph = (t * 0.00022 + a.seed + b.seed) % 1
      ctx.fillStyle = `rgba(255,255,255,${(0.55 * k).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(a.x + dx * ph, a.y + dy * ph, 1.4, 0, TAU)
      ctx.fill()
    }
  }

  /* Active syncs: dashed link from my orb to the partner */
  if (me && syncedIds.size > 0) {
    ctx.setLineDash([4, 7])
    ctx.lineDashOffset = -t * 0.02
    ctx.lineWidth = 1.3
    for (const id of syncedIds) {
      const o = byId.get(id)
      if (!o || o.die) continue
      ctx.strokeStyle = `rgba(${VIBES[o.vibe].rgb},0.75)`
      ctx.beginPath()
      ctx.moveTo(me.x, me.y)
      ctx.lineTo(o.x, o.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }

  /* Orb glows (additive) */
  ctx.globalCompositeOperation = 'lighter'
  for (const o of orbs) {
    const k = spawnK(o, t)
    if (k <= 0) continue
    const pulse = 1 + 0.07 * Math.sin(t * 0.0016 + o.seed * 20)
    const R = o.r * k * pulse * (1 + 0.25 * o.hover)
    const meOn = o.isMe && o.live
    const glowR = R * (o.isMe ? 7.5 : 5) * (1 + 0.3 * o.hover)
    const rgb = o.isMe && !o.live ? '190,200,240' : VIBES[o.vibe].rgb
    const strength = o.isMe ? (meOn ? 0.8 : 0.28) : 0.5
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glowR)
    g.addColorStop(0, `rgba(${rgb},${strength})`)
    g.addColorStop(0.35, `rgba(${rgb},${strength * 0.3})`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(o.x, o.y, glowR, 0, TAU)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'

  /* Orb cores */
  for (const o of orbs) {
    const k = spawnK(o, t)
    if (k <= 0) continue
    const pulse = 1 + 0.07 * Math.sin(t * 0.0016 + o.seed * 20)
    const R = o.r * k * pulse * (1 + 0.25 * o.hover)
    const meOn = o.isMe && o.live
    const rgb = o.isMe && !o.live ? '190,200,240' : VIBES[o.vibe].rgb
    const cg = ctx.createRadialGradient(o.x - R * 0.3, o.y - R * 0.3, 0, o.x, o.y, R)
    cg.addColorStop(0, 'rgba(255,255,255,0.97)')
    cg.addColorStop(0.45, `rgba(${rgb},${o.isMe && !o.live ? 0.7 : 1})`)
    cg.addColorStop(1, `rgba(${rgb},${o.isMe && !o.live ? 0.5 : 0.88})`)
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.arc(o.x, o.y, R, 0, TAU)
    ctx.fill()
    if (meOn) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(o.x, o.y, R + 2.5, 0, TAU)
      ctx.stroke()
    }
  }

  /* Rings, sync markers, selection, labels */
  for (const o of orbs) {
    const k = spawnK(o, t)
    if (k <= 0) continue
    const pulse = 1 + 0.07 * Math.sin(t * 0.0016 + o.seed * 20)
    const R = o.r * k * pulse * (1 + 0.25 * o.hover)
    const rgb = o.isMe && !o.live ? '190,200,240' : VIBES[o.vibe].rgb

    if (o.isMe) {
      if (o.live) {
        for (let r = 0; r < 2; r++) {
          const ph = (t * 0.0007 + r * 0.5) % 1
          ctx.strokeStyle = `rgba(${rgb},${((1 - ph) * 0.6).toFixed(3)})`
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(o.x, o.y, R + 8 + ph * 38, 0, TAU)
          ctx.stroke()
        }
      } else {
        const ph = (t * 0.00035) % 1
        ctx.strokeStyle = `rgba(190,200,240,${((1 - ph) * 0.3).toFixed(3)})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(o.x, o.y, R + 6 + ph * 22, 0, TAU)
        ctx.stroke()
      }
    }

    if (syncedIds.has(o.id)) {
      ctx.strokeStyle = `rgba(${rgb},0.8)`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(o.x, o.y, R + 5, 0, TAU)
      ctx.stroke()
    }

    if (o.id === selectedId) {
      ctx.setLineDash([5, 6])
      ctx.lineDashOffset = -t * 0.02
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(o.x, o.y, R + 12, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    }

    if (o.isMe) {
      drawLabel(ctx, o.live ? 'YOU · LIVE' : 'YOU', o.x, o.y + R + 22, rgb)
    } else if (o.id === hoverId || o.id === selectedId) {
      drawLabel(ctx, o.alias, o.x, o.y + R + 20, rgb)
    }
  }

  /* Ripples */
  for (const e of effects) {
    const p = (t - e.born) / e.dur
    if (p < 0 || p > 1) continue
    const ease = 1 - Math.pow(1 - p, 3)
    ctx.strokeStyle = `rgba(${e.rgb},${((1 - p) * 0.7).toFixed(3)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(e.x, e.y, ease * e.max, 0, TAU)
    ctx.stroke()
  }
}

/* ───────────── Component ───────────── */

const GLASS = 'border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.45)]'

const INITIAL_STATS: Stats = {
  orbs: 0,
  syncs: 0,
  dominant: null,
  counts: { focus: 0, social: 0, creative: 0, support: 0 },
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const orbsRef = useRef<Orb[]>([])
  const starsRef = useRef<Star[]>([])
  const effectsRef = useRef<Ripple[]>([])
  const sizeRef = useRef({ w: 0, h: 0 })
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const syncedRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Set<number>>(new Set())
  const ambientRef = useRef(5)
  const syncsRef = useRef<Record<string, Session>>({})
  const messagesRef = useRef<HTMLDivElement | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [syncs, setSyncs] = useState<Record<string, Session>>({})
  const [demo, setDemo] = useState(false)
  const [meLive, setMeLive] = useState(false)
  const [bump, setBump] = useState(0)
  const [draftVibe, setDraftVibe] = useState<VibeId>('focus')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftZone, setDraftZone] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [stats, setStats] = useState<Stats>(INITIAL_STATS)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [now, setNow] = useState(() => Date.now())

  syncsRef.current = syncs

  /* ── timers ── */
  const schedule = useCallback((fn: () => void, ms: number) => {
    const handle = window.setTimeout(() => {
      timersRef.current.delete(handle)
      fn()
    }, ms)
    timersRef.current.add(handle)
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((h) => window.clearTimeout(h))
      timers.clear()
    }
  }, [])

  /* ── selection ── */
  const select = useCallback((id: string | null) => {
    selectedRef.current = id
    setSelectedId(id)
  }, [])

  /* ── feed toasts ── */
  const pushFeed = useCallback(
    (text: string, color: string) => {
      const id = uid('f')
      setFeed((prev) => [...prev.slice(-2), { id, text, color }])
      schedule(() => setFeed((prev) => prev.filter((f) => f.id !== id)), 4200)
    },
    [schedule],
  )

  /* ── stats / HUD ── */
  const refreshStats = useCallback(() => {
    const counts: Record<VibeId, number> = { focus: 0, social: 0, creative: 0, support: 0 }
    let total = 0
    for (const o of orbsRef.current) {
      if (o.live && !o.die) {
        counts[o.vibe] += 1
        total += 1
      }
    }
    let dominant: VibeId | null = null
    let best = 0
    for (const v of VIBE_ORDER) {
      if (counts[v] > best) {
        best = counts[v]
        dominant = v
      }
    }
    const t = Date.now()
    let mine = 0
    for (const s of Object.values(syncsRef.current)) {
      if (!isExpired(s.startedAt, t)) mine += 1
    }
    const next: Stats = { orbs: total, syncs: mine + ambientRef.current, dominant, counts }
    setStats((prev) =>
      prev.orbs === next.orbs &&
      prev.syncs === next.syncs &&
      prev.dominant === next.dominant &&
      VIBE_ORDER.every((v) => prev.counts[v] === next.counts[v])
        ? prev
        : next,
    )
  }, [])

  useEffect(() => {
    refreshStats()
  }, [syncs, bump, refreshStats])

  useEffect(() => {
    const fast = window.setInterval(refreshStats, 500)
    const slow = window.setInterval(() => {
      const n = orbsRef.current.filter((o) => o.live && !o.die).length
      const max = Math.max(2, Math.floor(n * 0.32))
      const step = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : 0
      ambientRef.current = clamp(ambientRef.current + step, 1, max)
    }, 2800)
    return () => {
      window.clearInterval(fast)
      window.clearInterval(slow)
    }
  }, [refreshStats])

  /* ── synced ids for the canvas ── */
  useEffect(() => {
    const t = Date.now()
    const s = new Set<string>()
    for (const [id, sess] of Object.entries(syncs)) {
      if (!isExpired(sess.startedAt, t)) s.add(id)
    }
    syncedRef.current = s
  }, [syncs])

  /* ── clock for the drawer timer ── */
  useEffect(() => {
    if (!drawerOpen) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [drawerOpen])

  /* ── Escape key ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (drawerOpen) setDrawerOpen(false)
      else select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, select])

  /* ── spawn a new bot orb ── */
  const spawnBot = useCallback(
    (announce: boolean) => {
      const { w, h } = sizeRef.current
      if (!w) return
      const t = performance.now()
      const orbs = orbsRef.current
      const bots = orbs.filter((o) => !o.isMe && !o.die)
      if (bots.length >= MAX_ORBS) {
        const candidates = bots
          .filter((o) => o.id !== selectedRef.current && !syncsRef.current[o.id])
          .sort((a, b) => a.born - b.born)
        const victim = candidates[0]
        if (victim) {
          victim.die = t
          victim.live = false
        }
      }
      const taken = new Set(orbs.map((o) => o.alias))
      const orb = createOrb(pick(VIBE_ORDER), w, h, taken, t, false)
      orbs.push(orb)
      effectsRef.current.push({ x: orb.x, y: orb.y, born: t, rgb: VIBES[orb.vibe].rgb, max: 90, dur: 1100 })
      if (announce) pushFeed(`${orb.alias} joined · ${orb.zone}`, VIBES[orb.vibe].color)
    },
    [pushFeed],
  )

  /* ── Live Demo Mode ── */
  useEffect(() => {
    if (!demo) return
    spawnBot(true)
    const id = window.setInterval(() => spawnBot(true), 3000)
    return () => window.clearInterval(id)
  }, [demo, spawnBot])

  /* ── canvas: setup, simulation loop, rendering ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w, h }
    }
    resize()

    if (starsRef.current.length === 0) {
      for (let i = 0; i < 140; i++) {
        starsRef.current.push({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 2 : 1, tw: rand(0.4, 1.6), p: rand(0, TAU) })
      }
    }

    if (orbsRef.current.length === 0) {
      const { w, h } = sizeRef.current
      const bnd = getBounds(w, h)
      const t0 = performance.now()
      const taken = new Set<string>(['You'])
      const me: Orb = {
        id: 'me',
        alias: 'You',
        vibe: 'focus',
        status: 'Not broadcasting yet',
        zone: 'Somewhere on campus',
        x: (bnd.l + bnd.r) / 2,
        y: (bnd.t + bnd.b) / 2,
        vx: 0,
        vy: 0,
        r: 11,
        seed: Math.random(),
        born: t0 - 2000,
        die: 0,
        hover: 0,
        live: false,
        isMe: true,
      }
      const orbs: Orb[] = [me]
      const vibes: VibeId[] = []
      for (let i = 0; i < INITIAL_ORBS; i++) vibes.push(VIBE_ORDER[i % 4])
      for (let i = vibes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = vibes[i]
        vibes[i] = vibes[j]
        vibes[j] = tmp
      }
      for (const v of vibes) orbs.push(createOrb(v, w, h, taken, t0 - 2000, true))
      orbsRef.current = orbs
    }

    let raf = 0
    let last = performance.now()
    const loop = (ts: number) => {
      const dt = Math.min(3, (ts - last) / 16.667)
      last = ts
      const { w, h } = sizeRef.current

      let orbs = orbsRef.current
      stepSim(orbs, w, h, ts, dt, hoverRef.current)

      if (orbs.some((o) => o.die && ts - o.die >= 700)) {
        orbs = orbs.filter((o) => !(o.die && ts - o.die >= 700))
        orbsRef.current = orbs
      }
      if (effectsRef.current.length > 0) {
        effectsRef.current = effectsRef.current.filter((e) => ts - e.born < e.dur)
      }

      draw(ctx, w, h, ts, {
        orbs,
        stars: starsRef.current,
        hoverId: hoverRef.current,
        selectedId: selectedRef.current,
        syncedIds: syncedRef.current,
        effects: effectsRef.current,
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  /* ── canvas pointer handling ── */
  const pickOrb = (x: number, y: number): Orb | null => {
    const t = performance.now()
    let best: Orb | null = null
    let bestD = Infinity
    for (const o of orbsRef.current) {
      if (o.die) continue
      const reach = o.r * spawnK(o, t) + (o.isMe ? 18 : 14)
      const d = Math.hypot(o.x - x, o.y - y)
      if (d < reach && d < bestD) {
        best = o
        bestD = d
      }
    }
    return best
  }

  const onCanvasMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const o = pickOrb(e.clientX - rect.left, e.clientY - rect.top)
    hoverRef.current = o ? o.id : null
    e.currentTarget.style.cursor = o ? 'pointer' : 'default'
  }
  const onCanvasLeave = () => {
    hoverRef.current = null
  }
  const onCanvasClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const o = pickOrb(e.clientX - rect.left, e.clientY - rect.top)
    select(o ? o.id : null)
  }

  /* ── chat plumbing ── */
  const pushMessage = useCallback((id: string, msg: Omit<ChatMsg, 'id' | 'ts'>, pendingDelta = 0) => {
    setSyncs((prev) => {
      const s = prev[id]
      if (!s) return prev
      return {
        ...prev,
        [id]: {
          ...s,
          messages: [...s.messages, { ...msg, id: uid('m'), ts: Date.now() }],
          pending: Math.max(0, s.pending + pendingDelta),
        },
      }
    })
  }, [])

  const startSync = (orb: Orb) => {
    if (orb.isMe) return
    setChatId(orb.id)
    setDrawerOpen(true)
    if (syncsRef.current[orb.id]) return

    const t = Date.now()
    const session: Session = {
      id: orb.id,
      alias: orb.alias,
      vibe: orb.vibe,
      zone: orb.zone,
      status: orb.status,
      startedAt: t,
      pending: 1,
      messages: [
        {
          id: uid('m'),
          from: 'system',
          text: `Frequency synced with ${orb.alias}. This space dissolves in 2 hours.`,
          ts: t,
        },
      ],
    }
    syncsRef.current = { ...syncsRef.current, [orb.id]: session }
    setSyncs((prev) => (prev[orb.id] ? prev : { ...prev, [orb.id]: session }))

    const greeting = pick(GREETINGS[orb.vibe]).replace('{zone}', orb.zone)
    schedule(() => pushMessage(orb.id, { from: 'them', text: greeting }, -1), 1200)
  }

  const endSync = (id: string) => {
    const copy = { ...syncsRef.current }
    delete copy[id]
    syncsRef.current = copy
    setSyncs((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setDrawerOpen(false)
  }

  const sendMessage = (raw: string) => {
    const id = chatId
    if (!id) return
    const text = raw.trim().slice(0, 240)
    if (!text) return
    const session = syncsRef.current[id]
    if (!session || isExpired(session.startedAt, Date.now())) return

    const n = session.messages.filter((m) => m.from === 'them').length
    pushMessage(id, { from: 'me', text }, 1)
    setChatDraft('')
    schedule(() => {
      const live = syncsRef.current[id]
      if (!live) return
      pushMessage(id, { from: 'them', text: makeReply(live, text, n) }, -1)
    }, 1200)
  }

  const onChatSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(chatDraft)
  }

  /* ── broadcast ── */
  const broadcast = () => {
    const me = orbsRef.current.find((o) => o.isMe)
    if (!me) return
    const status = draftStatus.trim().slice(0, 80) || 'Tuned in — open to company'
    const zone = draftZone.trim().slice(0, 28) || 'Somewhere on campus'
    me.vibe = draftVibe
    me.status = status
    me.zone = zone
    me.live = true
    const t = performance.now()
    effectsRef.current.push({ x: me.x, y: me.y, born: t, rgb: VIBES[draftVibe].rgb, max: 170, dur: 1500 })
    effectsRef.current.push({ x: me.x, y: me.y, born: t + 220, rgb: VIBES[draftVibe].rgb, max: 240, dur: 1700 })
    setMeLive(true)
    setBump((b) => b + 1)
    pushFeed(`You are live · ${VIBES[draftVibe].label}`, VIBES[draftVibe].color)
  }

  const onBroadcastSubmit = (e: FormEvent) => {
    e.preventDefault()
    broadcast()
  }

  /* ── drawer auto-scroll ── */
  const session = chatId ? syncs[chatId] : undefined
  const msgCount = session ? session.messages.length : 0
  const pending = session ? session.pending : 0
  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [msgCount, pending, drawerOpen, chatId])

  /* ── derived values for render ── */
  const selectedOrb = selectedId ? orbsRef.current.find((o) => o.id === selectedId) ?? null : null
  const selectedColor = selectedOrb ? VIBES[selectedOrb.vibe].color : '#ffffff'
  const selectedIsMe = !!selectedOrb && selectedOrb.isMe
  const selectedHasSession = !!selectedOrb && !!syncs[selectedOrb.id]

  const sessionColor = session ? VIBES[session.vibe].color : '#06b6d4'
  const secsLeft = session ? secondsLeft(session.startedAt, now) : 0
  const expired = session ? isExpired(session.startedAt, now) : false
  const pct = session ? clamp((secsLeft / (SYNC_MS / 1000 - 1)) * 100, 0, 100) : 0
  const totalCount = stats.counts.focus + stats.counts.social + stats.counts.creative + stats.counts.support
  const draftColor = VIBES[draftVibe].color

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070913] font-sans text-white antialiased select-none">
      <style>{`
        @keyframes fq-feed { 0% { opacity: 0; transform: translateY(-6px) scale(.98) } 8% { opacity: 1; transform: none } 86% { opacity: 1 } 100% { opacity: 0; transform: translateY(-4px) } }
        .fq-feed { animation: fq-feed 4.2s ease forwards }
        @keyframes fq-pop { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: none } }
        .fq-pop { animation: fq-pop .28s ease both }
        @keyframes fq-dot { 0%, 80%, 100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-3px) } }
        .fq-dot { animation: fq-dot 1.1s infinite ease-in-out }
        @keyframes fq-live { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.65) } 70% { box-shadow: 0 0 0 8px rgba(16,185,129,0) } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0) } }
        .fq-live { animation: fq-live 1.8s infinite }
        .fq-scroll::-webkit-scrollbar { width: 6px; height: 6px }
        .fq-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 3px }
        .fq-input::placeholder { color: rgba(255,255,255,.34) }
        .fq-selectable { user-select: text }
      `}</style>

      {/* Full-screen constellation */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Live constellation of campus vibes"
        className="absolute inset-0 z-0 h-full w-full touch-none"
        onPointerMove={onCanvasMove}
        onPointerLeave={onCanvasLeave}
        onClick={onCanvasClick}
      />

      {/* ───── Top-left: School Pulse ───── */}
      <section
        aria-label="School Pulse"
        className={`pointer-events-none absolute left-3 top-3 z-20 w-[232px] rounded-2xl p-3 sm:left-5 sm:top-5 sm:w-[310px] sm:p-4 ${GLASS}`}
      >
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
            <Activity className="h-3 w-3" aria-hidden />
            School Pulse
          </p>
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-emerald-300">
            <span className="fq-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <p className="text-[9px] uppercase leading-tight tracking-wider text-white/40 sm:text-[10px]">Active Orbs</p>
            <p className="mt-1 flex items-center gap-1 text-xl font-semibold tabular-nums sm:text-2xl">
              <Users className="h-3.5 w-3.5 text-white/40" aria-hidden />
              {stats.orbs}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase leading-tight tracking-wider text-white/40 sm:text-[10px]">Active Syncs</p>
            <p className="mt-1 flex items-center gap-1 text-xl font-semibold tabular-nums sm:text-2xl">
              <Link2 className="h-3.5 w-3.5 text-white/40" aria-hidden />
              {stats.syncs}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase leading-tight tracking-wider text-white/40 sm:text-[10px]">Dominant Vibe</p>
            <p
              className="mt-1.5 flex items-center gap-1 text-sm font-semibold sm:text-base"
              style={{ color: stats.dominant ? VIBES[stats.dominant].color : 'rgba(255,255,255,0.5)' }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {stats.dominant ? VIBES[stats.dominant].tag : '—'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-white/5">
          {VIBE_ORDER.map((v) => (
            <div
              key={v}
              className="h-full transition-[width] duration-700"
              style={{
                width: `${totalCount ? (stats.counts[v] / totalCount) * 100 : 25}%`,
                background: VIBES[v].color,
                boxShadow: `0 0 8px ${VIBES[v].color}88`,
              }}
            />
          ))}
        </div>
      </section>

      {/* ───── Top-right: Live Demo Mode + feed ───── */}
      <div
        className={`pointer-events-none absolute right-3 top-3 z-30 flex flex-col items-end gap-2 transition-all duration-500 sm:top-5 ${
          drawerOpen ? 'sm:right-[460px]' : 'sm:right-5'
        }`}
      >
        <button
          type="button"
          onClick={() => setDemo((d) => !d)}
          aria-pressed={demo}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-full px-3.5 py-2 text-xs font-medium transition hover:bg-white/10 sm:text-sm ${GLASS}`}
          style={demo ? { borderColor: 'rgba(52,211,153,0.5)', boxShadow: '0 0 24px rgba(16,185,129,0.25)' } : undefined}
        >
          <Zap className={`h-3.5 w-3.5 ${demo ? 'text-emerald-300' : 'text-white/60'}`} aria-hidden />
          <span className="hidden sm:inline">Live Demo Mode</span>
          <span className="sm:hidden">Demo</span>
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${demo ? 'bg-emerald-400/80' : 'bg-white/15'}`}
            aria-hidden
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                demo ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </span>
        </button>
        {feed.map((f) => (
          <div
            key={f.id}
            className="fq-feed flex max-w-[260px] items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur-md"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color, boxShadow: `0 0 8px ${f.color}` }} />
            <span className="truncate">{f.text}</span>
          </div>
        ))}
      </div>

      {/* ───── Selected orb card ───── */}
      {selectedOrb && (
        <div
          key={selectedOrb.id}
          className={`fq-pop absolute bottom-[222px] left-3 right-3 z-30 rounded-3xl p-5 sm:bottom-auto sm:left-5 sm:right-auto sm:top-[168px] sm:w-[330px] ${GLASS}`}
          style={{ boxShadow: `0 10px 50px rgba(0,0,0,0.5), 0 0 40px ${selectedColor}22`, borderColor: `${selectedColor}44` }}
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-1 h-4 w-4 shrink-0 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 35%, #fff, ${selectedColor} 55%)`,
                boxShadow: `0 0 18px ${selectedColor}, 0 0 40px ${selectedColor}66`,
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold leading-tight">
                {selectedIsMe ? 'You' : selectedOrb.alias}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: selectedColor }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: selectedColor }} />
                {selectedIsMe && !meLive ? 'Not broadcasting yet' : VIBES[selectedOrb.vibe].label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => select(null)}
              aria-label="Close card"
              className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="fq-selectable mt-4 text-[15px] leading-snug text-white/90">
            “{selectedIsMe && !meLive ? 'Pick a vibe below and hit Broadcast to light up your orb.' : selectedOrb.status}”
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-white/55">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {selectedIsMe && !meLive ? 'Somewhere on campus' : selectedOrb.zone}
          </p>

          {selectedIsMe ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-relaxed text-white/60">
              This is your orb. Everyone else only sees an anonymous glow, no profile attached.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => startSync(selectedOrb)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition hover:brightness-125 active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${selectedColor}cc, ${selectedColor}55)`,
                borderColor: `${selectedColor}88`,
                boxShadow: `0 6px 28px ${selectedColor}44`,
              }}
            >
              <Radio className="h-4 w-4" aria-hidden />
              {selectedHasSession ? 'Open Frequency' : 'Sync Frequency'}
            </button>
          )}
        </div>
      )}

      {/* ───── Bottom: Broadcast bar ───── */}
      <form
        onSubmit={onBroadcastSubmit}
        aria-label="Broadcast your frequency"
        className={`absolute bottom-3 left-1/2 z-30 w-[calc(100vw_-_24px)] max-w-4xl -translate-x-1/2 rounded-3xl p-3 transition-all duration-500 sm:bottom-5 sm:p-4 ${GLASS} ${
          drawerOpen ? 'sm:left-[calc((100vw_-_440px)/2)] sm:w-[calc(100vw_-_488px)]' : ''
        }`}
      >
        <div className="fq-scroll flex items-center gap-2 overflow-x-auto pb-0.5">
          {VIBE_ORDER.map((v) => {
            const d = VIBES[v]
            const active = draftVibe === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setDraftVibe(v)}
                aria-pressed={active}
                title={d.label}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active ? 'text-white' : 'border-white/10 text-white/55 hover:text-white/85'
                }`}
                style={
                  active
                    ? { borderColor: `${d.color}aa`, background: `${d.color}22`, boxShadow: `0 0 18px ${d.color}44` }
                    : undefined
                }
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
                <span className="hidden sm:inline">{d.label}</span>
                <span className="sm:hidden">{d.tag}</span>
              </button>
            )
          })}
          {meLive && (
            <span className="ml-auto hidden shrink-0 items-center gap-1.5 pl-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 sm:flex">
              <span className="fq-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
              You are live
            </span>
          )}
        </div>

        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
              maxLength={80}
              placeholder="What is your frequency right now?"
              aria-label="Status"
              className="fq-input fq-selectable w-full rounded-2xl border border-white/10 bg-black/25 py-3 pl-4 pr-14 text-sm text-white outline-none transition focus:border-white/30"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-white/35">
              {draftStatus.length}/80
            </span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 sm:w-44 sm:flex-none">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" aria-hidden />
              <input
                type="text"
                value={draftZone}
                onChange={(e) => setDraftZone(e.target.value)}
                maxLength={28}
                list="fq-zones"
                placeholder="Campus zone"
                aria-label="Campus zone"
                className="fq-input fq-selectable w-full rounded-2xl border border-white/10 bg-black/25 py-3 pl-9 pr-3 text-sm text-white outline-none transition focus:border-white/30"
              />
              <datalist id="fq-zones">
                {ALL_ZONES.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </div>
            <button
              type="submit"
              className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold text-white transition hover:brightness-125 active:scale-[0.97]"
              style={{
                background: `linear-gradient(135deg, ${draftColor}d0, ${draftColor}66)`,
                borderColor: `${draftColor}99`,
                boxShadow: `0 6px 26px ${draftColor}44`,
              }}
            >
              <Radio className="h-4 w-4" aria-hidden />
              Broadcast
            </button>
          </div>
        </div>
      </form>

      {/* ───── Ephemeral sync chat drawer ───── */}
      <aside
        aria-hidden={!drawerOpen}
        aria-label="Ephemeral chat"
        className={`absolute right-0 top-0 z-40 flex h-full w-full flex-col border-l border-white/10 bg-[#0a0e1f]/85 shadow-[-24px_0_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-[transform,visibility] duration-500 ease-out sm:w-[440px] ${
          drawerOpen ? 'visible translate-x-0' : 'invisible translate-x-full'
        }`}
      >
        {session && (
          <>
            <div className="flex items-center gap-3 px-5 pb-4 pt-5">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close chat"
                className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{
                  background: `radial-gradient(circle at 35% 35%, #fff, ${sessionColor} 55%)`,
                  boxShadow: `0 0 16px ${sessionColor}`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold leading-tight">{session.alias}</p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/50">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  {session.zone} · {VIBES[session.vibe].tag}
                </p>
              </div>
              <button
                type="button"
                onClick={() => endSync(session.id)}
                title="End sync"
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:border-white/30 hover:text-white"
              >
                End sync
              </button>
            </div>

            <div className="mx-5 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" aria-hidden />
                  Ephemeral frequency
                </span>
                <span style={{ color: expired ? '#f87171' : sessionColor }}>{expired ? 'Faded' : 'Fading in'}</span>
              </div>
              <p
                className="mt-1 text-center font-mono text-4xl font-semibold tabular-nums tracking-wider"
                style={{ color: expired ? '#f87171' : '#fff', textShadow: `0 0 24px ${sessionColor}aa` }}
                aria-label="Time remaining"
              >
                {formatClock(secsLeft)}
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                  style={{ width: `${pct}%`, background: sessionColor, boxShadow: `0 0 10px ${sessionColor}` }}
                />
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-white/40">
                No profiles. No followers. This chat dissolves when the timer hits zero.
              </p>
            </div>

            <div ref={messagesRef} className="fq-scroll fq-selectable mt-3 flex-1 space-y-2.5 overflow-y-auto px-5 py-3">
              {session.messages.map((m) =>
                m.from === 'system' ? (
                  <p key={m.id} className="py-1 text-center text-[11px] text-white/35">
                    {m.text}
                  </p>
                ) : (
                  <div key={m.id} className={`fq-pop flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <p
                      className={`max-w-[82%] break-words rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                        m.from === 'me' ? 'rounded-br-md bg-white/15 text-white' : 'rounded-bl-md text-white/95'
                      }`}
                      style={
                        m.from === 'them'
                          ? { background: `${sessionColor}1f`, border: `1px solid ${sessionColor}44` }
                          : { border: '1px solid rgba(255,255,255,0.12)' }
                      }
                    >
                      {m.text}
                    </p>
                  </div>
                ),
              )}
              {session.pending > 0 && (
                <div className="flex justify-start">
                  <div
                    className="flex items-center gap-1 rounded-2xl rounded-bl-md px-3.5 py-3"
                    style={{ background: `${sessionColor}1f`, border: `1px solid ${sessionColor}44` }}
                    aria-label={`${session.alias} is typing`}
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="fq-dot h-1.5 w-1.5 rounded-full bg-white/80"
                        style={{ animationDelay: `${i * 0.16}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!expired && (
              <div className="flex flex-wrap gap-2 px-5 pb-2 pt-1">
                {ICEBREAKERS[session.vibe].map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => sendMessage(text)}
                    className="rounded-full border px-3 py-1.5 text-xs text-white/80 transition hover:text-white hover:brightness-125"
                    style={{ borderColor: `${sessionColor}55`, background: `${sessionColor}14` }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={onChatSubmit} className="flex items-center gap-2 border-t border-white/10 p-4">
              <input
                type="text"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                maxLength={240}
                disabled={expired}
                placeholder={expired ? 'This frequency has faded' : 'Say something kind…'}
                aria-label="Message"
                className="fq-input fq-selectable min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={expired || !chatDraft.trim()}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-white transition hover:brightness-125 active:scale-95 disabled:opacity-40"
                style={{ background: `${sessionColor}55`, borderColor: `${sessionColor}99` }}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </>
        )}
      </aside>
    </div>
  )
}
