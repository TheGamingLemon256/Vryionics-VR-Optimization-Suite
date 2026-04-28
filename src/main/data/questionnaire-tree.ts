// Vryionics VR Optimization Suite — Questionnaire Tree
// Pure data: branching question tree for the interactive setup interview.
// No React — imported by both the store (renderer) and any future main-process logic.

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnswerValue = string

export interface QuestionOption {
  value: AnswerValue
  label: string
  icon?: string
  description?: string
  /** Override the default next question for this specific answer */
  nextQuestionId?: string
}

export interface Question {
  id: string
  section: string
  question: string
  subtext?: string
  options: QuestionOption[]
  /** Default next question (can be overridden per-option) */
  nextQuestionId?: string
  isTerminal?: boolean
}

export interface QuestionTree {
  startQuestionId: string
  questions: Record<string, Question>
}

// ── Question Definitions ──────────────────────────────────────────────────────

const questions: Record<string, Question> = {

  // ── SECTION: Hardware ─────────────────────────────────────────────────────

  'q-headset-type': {
    id: 'q-headset-type',
    section: 'Hardware',
    question: 'Which VR headset do you primarily use?',
    subtext: 'This helps Vryionics tailor its diagnostics to your specific hardware.',
    options: [
      { value: 'meta-quest-3',  label: 'Meta Quest 3',                    icon: '🟦', nextQuestionId: 'q-connection-type' },
      { value: 'meta-quest-3s', label: 'Meta Quest 3S',                   icon: '🟦', nextQuestionId: 'q-connection-type' },
      { value: 'meta-quest-2',  label: 'Meta Quest 2',                    icon: '🟦', nextQuestionId: 'q-connection-type' },
      { value: 'meta-quest-pro',label: 'Meta Quest Pro',                  icon: '🟦', nextQuestionId: 'q-connection-type' },
      { value: 'valve-index',   label: 'Valve Index',                     icon: '🟩', nextQuestionId: 'q-wired-setup' },
      { value: 'htc-vive',      label: 'HTC Vive / Vive Pro',             icon: '🟩', nextQuestionId: 'q-wired-setup' },
      { value: 'pico-4',        label: 'Pico 4 / 4 Ultra',                icon: '🟨', nextQuestionId: 'q-connection-type' },
      { value: 'psvr2',         label: 'PlayStation VR2 (PC adapter)',     icon: '🎮', nextQuestionId: 'q-wired-setup' },
      { value: 'wmr',           label: 'Windows Mixed Reality headset',    icon: '🪟', nextQuestionId: 'q-wired-setup' },
      { value: 'other',         label: 'Other / Not listed',               icon: '❓', nextQuestionId: 'q-connection-type' },
    ],
  },

  // ── SECTION: Connection ───────────────────────────────────────────────────

  'q-connection-type': {
    id: 'q-connection-type',
    section: 'Connection',
    question: 'How do you connect your headset to your PC?',
    options: [
      { value: 'wireless-vd',      label: 'Virtual Desktop',               icon: '📡', description: 'Wi-Fi streaming via Virtual Desktop app',       nextQuestionId: 'q-wifi-type' },
      { value: 'wireless-airlink', label: 'Meta Air Link',                  icon: '📡', description: 'Meta\'s built-in Wi-Fi streaming solution',     nextQuestionId: 'q-wifi-type' },
      { value: 'wireless-alvr',    label: 'ALVR (open source Wi-Fi)',       icon: '📡', description: 'Free, open-source wireless PC VR streaming',    nextQuestionId: 'q-wifi-type' },
      { value: 'usb-link',         label: 'USB Cable (Link / Pico Connect)',icon: '🔌', description: 'Wired USB connection with encoding on the PC', nextQuestionId: 'q-usb-gen' },
      { value: 'both',             label: 'I use both wireless and wired',  icon: '🔄', description: 'Switching between wireless and USB depending on game', nextQuestionId: 'q-wifi-type' },
    ],
  },

  'q-wifi-type': {
    id: 'q-wifi-type',
    section: 'Connection',
    question: 'What kind of Wi-Fi router do you have?',
    subtext: 'Wireless VR performance is heavily dependent on your Wi-Fi generation.',
    options: [
      { value: 'wifi6e',     label: 'Wi-Fi 6E (6 GHz band)',              icon: '🚀', description: 'New in 2022+ routers — best for VR streaming',  nextQuestionId: 'q-router-location' },
      { value: 'wifi6',      label: 'Wi-Fi 6 (5 GHz)',                    icon: '✅', description: 'Common since 2019 — good for VR',               nextQuestionId: 'q-router-location' },
      { value: 'wifi5',      label: 'Wi-Fi 5 (5 GHz, AC router)',         icon: '🟡', description: 'Older but still capable with a good setup',     nextQuestionId: 'q-router-location' },
      { value: 'wifi5-old',  label: 'Only 2.4 GHz available',             icon: '🔴', description: 'Not recommended for VR — too congested/slow',  nextQuestionId: 'q-wifi-issues' },
      { value: 'wifi-unsure',label: 'Not sure what I have',               icon: '❓', nextQuestionId: 'q-router-location' },
    ],
  },

  'q-router-location': {
    id: 'q-router-location',
    section: 'Connection',
    question: 'How far is your PC from the Wi-Fi router?',
    subtext: 'Distance between the headset and router is the most common source of wireless VR issues.',
    options: [
      { value: 'same-room',  label: 'Same room (< 3 metres)',             icon: '✅', nextQuestionId: 'q-router-dedicated' },
      { value: 'near-room',  label: 'Adjacent room (3–10 metres)',         icon: '🟡', nextQuestionId: 'q-router-dedicated' },
      { value: 'far-room',   label: 'Across the house (10+ metres)',       icon: '🔴', description: 'Router distance is likely your primary issue',  nextQuestionId: 'q-performance-issues' },
      { value: 'pc-wired',   label: 'My PC is on Ethernet (not Wi-Fi)',    icon: '🔌', description: 'Great — wired PC removes one variable',         nextQuestionId: 'q-headset-wifi-setup' },
    ],
  },

  'q-router-dedicated': {
    id: 'q-router-dedicated',
    section: 'Connection',
    question: 'Is your headset on a dedicated router or band?',
    subtext: 'Sharing bandwidth with other devices is a common cause of wireless VR stutters.',
    nextQuestionId: 'q-performance-issues',
    options: [
      { value: 'dedicated', label: 'Yes — headset has its own router or band', icon: '✅', description: 'Ideal setup for wireless VR' },
      { value: 'shared',    label: 'No — shares with phones, laptops, etc.',   icon: '🟡', description: 'Congestion on shared networks can cause stutters' },
      { value: 'unsure',    label: 'Not sure',                                 icon: '❓' },
    ],
  },

  'q-headset-wifi-setup': {
    id: 'q-headset-wifi-setup',
    section: 'Connection',
    question: 'Where is the headset connecting from? (your PC is wired)',
    subtext: 'Even with a wired PC, the headset still streams over Wi-Fi.',
    nextQuestionId: 'q-performance-issues',
    options: [
      { value: 'same-router',    label: 'Same router as my wired PC',       icon: '✅', description: 'Best scenario — both on the same network node' },
      { value: 'different-router',label: 'A different router or access point',icon: '🟡', description: 'Cross-router streaming can introduce latency' },
    ],
  },

  'q-usb-gen': {
    id: 'q-usb-gen',
    section: 'Connection',
    question: 'Which USB port are you using for your headset cable?',
    subtext: 'USB generation determines the available bandwidth for video encoding.',
    nextQuestionId: 'q-performance-issues',
    options: [
      { value: 'usb32-gen2', label: 'USB 3.2 Gen 2 — 10 Gbps',            icon: '✅', description: 'Blue/red/teal port — plenty of bandwidth for VR' },
      { value: 'usb32-gen1', label: 'USB 3.2 Gen 1 / USB 3.0 — 5 Gbps',   icon: '🟡', description: 'Standard blue port — usually sufficient' },
      { value: 'usb2',       label: 'USB 2.0 — slower black port',         icon: '🔴', description: 'Too slow for VR Link — this is likely your issue' },
      { value: 'unsure',     label: 'Not sure which port I\'m using',      icon: '❓' },
    ],
  },

  'q-wired-setup': {
    id: 'q-wired-setup',
    section: 'Connection',
    question: 'How is your wired headset connected to your PC?',
    subtext: 'DisplayPort/USB routing affects signal quality and latency for tethered headsets.',
    nextQuestionId: 'q-performance-issues',
    options: [
      { value: 'motherboard-usb', label: 'Direct motherboard port',            icon: '✅', description: 'Best signal path — no hubs in between' },
      { value: 'hub-card',        label: 'Via a USB hub or PCIe expansion card',icon: '🟡', description: 'Hubs can cause tracking or power delivery issues' },
      { value: 'unsure',          label: 'Not sure',                            icon: '❓' },
    ],
  },

  // ── SECTION: Issues ───────────────────────────────────────────────────────

  'q-wifi-issues': {
    id: 'q-wifi-issues',
    section: 'Issues',
    question: 'How severe are your wireless performance issues on 2.4 GHz?',
    subtext: '2.4 GHz is shared with Bluetooth, microwaves, and most home devices — it is not suitable for VR.',
    nextQuestionId: 'q-performance-issues',
    options: [
      { value: 'constant',    label: 'Constant stutters and drops',         icon: '🔴', description: 'Expected — 2.4 GHz bandwidth is insufficient' },
      { value: 'occasional',  label: 'Occasional stutters, mostly ok',      icon: '🟡' },
      { value: 'fine',        label: 'Surprisingly works fine',             icon: '✅', description: 'Low-quality streams may still appear OK' },
    ],
  },

  'q-performance-issues': {
    id: 'q-performance-issues',
    section: 'Issues',
    question: 'What is your main VR performance complaint?',
    subtext: 'Pick the issue that bothers you most — Vryionics will focus its recommendations there.',
    options: [
      { value: 'stutters',    label: 'Frequent stutters / frame drops',     icon: '📉', nextQuestionId: 'q-stutter-when' },
      { value: 'blurry',      label: 'Blurry image / low resolution',       icon: '👁️',  nextQuestionId: 'q-resolution-setting' },
      { value: 'lag',         label: 'High latency / controls feel delayed',icon: '⏱️',  nextQuestionId: 'q-latency-detail' },
      { value: 'drops',       label: 'Connection drops out',                icon: '📶', nextQuestionId: 'q-disconnect-detail' },
      { value: 'crashes',     label: 'VR software crashes',                 icon: '💥', nextQuestionId: 'q-crash-detail' },
      { value: 'overheating', label: 'PC gets too hot',                     icon: '🌡️',  nextQuestionId: 'q-thermal-detail' },
      { value: 'great',       label: 'No issues — everything runs great!',  icon: '🎉', nextQuestionId: 'q-goals' },
    ],
  },

  'q-stutter-when': {
    id: 'q-stutter-when',
    section: 'Issues',
    question: 'When do the stutters happen most?',
    options: [
      { value: 'loading',   label: 'When entering new worlds / loading assets', icon: '💾', nextQuestionId: 'q-storage-type' },
      { value: 'always',    label: 'Constantly throughout play',                icon: '🔁', nextQuestionId: 'q-background-apps' },
      { value: 'crowded',   label: 'In crowded instances (lots of players)',     icon: '👥', nextQuestionId: 'q-vr-category' },
      { value: 'first-few', label: 'Only at the start, then gets better',       icon: '⏳', nextQuestionId: 'q-paging' },
      { value: 'thermal',   label: 'Gets worse the longer I play',              icon: '🌡️', nextQuestionId: 'q-thermal-detail' },
    ],
  },

  'q-storage-type': {
    id: 'q-storage-type',
    section: 'Issues',
    question: 'What kind of drive is your VR software installed on?',
    subtext: 'Slow storage causes hitches when loading assets into VRAM mid-session.',
    options: [
      { value: 'nvme',      label: 'NVMe SSD (M.2 slot)',                  icon: '✅', description: 'Fastest option — good for VR asset streaming', nextQuestionId: 'q-background-apps' },
      { value: 'sata-ssd',  label: 'SATA SSD (2.5" drive)',                icon: '🟡', description: 'Adequate, but slower than NVMe',              nextQuestionId: 'q-background-apps' },
      { value: 'hdd',       label: 'Hard Drive (HDD, spinning disk)',       icon: '🔴', description: 'HDD is very likely your stutter cause',       nextQuestionId: 'q-goals' },
      { value: 'unsure',    label: 'Not sure',                             icon: '❓',                                                              nextQuestionId: 'q-background-apps' },
    ],
  },

  'q-background-apps': {
    id: 'q-background-apps',
    section: 'Issues',
    question: 'Do you run any of these while in VR?',
    subtext: 'Background apps compete for CPU, GPU, and network resources during your VR session.',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'obs',     label: 'OBS / streaming software',   icon: '🎥', description: 'Encoding video in real time uses significant CPU/GPU' },
      { value: 'discord', label: 'Discord with video call',    icon: '🎙️', description: 'Video calls add encoding overhead and network load' },
      { value: 'browser', label: 'Browser with tabs open',     icon: '🌐', description: 'Modern browsers consume memory and background CPU' },
      { value: 'none',    label: 'None of the above',          icon: '✅' },
    ],
  },

  'q-resolution-setting': {
    id: 'q-resolution-setting',
    section: 'Issues',
    question: 'What resolution or supersampling settings do you use?',
    subtext: 'Running above native resolution places significant additional load on your GPU.',
    options: [
      { value: 'native',        label: 'Game default / no changes',              icon: '🎯', nextQuestionId: 'q-vr-category' },
      { value: 'above-native',  label: 'Supersampling above 1.0× in headset app',icon: '📈', description: 'Higher SS demands more GPU headroom',      nextQuestionId: 'q-gpu-temp' },
      { value: 'very-high',     label: '100 %+ render resolution in SteamVR',   icon: '📈', description: 'Very high SS can stall even high-end GPUs', nextQuestionId: 'q-gpu-temp' },
      { value: 'unsure',        label: 'I have not changed any settings',        icon: '❓', nextQuestionId: 'q-vr-category' },
    ],
  },

  'q-latency-detail': {
    id: 'q-latency-detail',
    section: 'Issues',
    question: 'When do you notice the latency / input delay most?',
    subtext: 'Pinpointing when lag appears helps narrow down whether it is network, CPU, or GPU related.',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'always',      label: 'Constantly — head movement always lags',   icon: '🔴', description: 'Likely a network or render pipeline issue' },
      { value: 'heavy-scenes',label: 'Only in graphically heavy scenes',          icon: '🟡', description: 'GPU frame time is likely the bottleneck' },
      { value: 'wireless',    label: 'Only noticeable on wireless, fine on cable',icon: '📡', description: 'Network latency is the probable cause' },
      { value: 'controller',  label: 'Controller tracking feels delayed',         icon: '🕹️', description: 'Could be USB bandwidth or Bluetooth interference' },
    ],
  },

  'q-disconnect-detail': {
    id: 'q-disconnect-detail',
    section: 'Issues',
    question: 'How do the connection drops typically happen?',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'random',    label: 'Random drops with no pattern',           icon: '🎲', description: 'Could be driver instability or interference' },
      { value: 'movement',  label: 'When I move around or leave a certain area', icon: '🚶', description: 'Signal dead zones or antenna orientation' },
      { value: 'prolonged', label: 'After a long session (30 min+)',          icon: '⏳', description: 'Thermal throttling or memory leak in software' },
      { value: 'usb',       label: 'USB cable disconnects during play',       icon: '🔌', description: 'Cable or USB controller power management issue' },
    ],
  },

  'q-crash-detail': {
    id: 'q-crash-detail',
    section: 'Issues',
    question: 'Which software crashes most often?',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'steamvr',   label: 'SteamVR itself crashes or freezes',      icon: '💨', description: 'Often caused by outdated drivers or bad USB power' },
      { value: 'game',      label: 'Specific games crash, SteamVR stays up',  icon: '🎮', description: 'Usually a game-specific compatibility issue' },
      { value: 'airlink',   label: 'Air Link / Oculus software crashes',      icon: '📡', description: 'Can be caused by GPU driver or service conflicts' },
      { value: 'vd',        label: 'Virtual Desktop crashes',                 icon: '📡', description: 'Check for conflicting overlays or antivirus blocks' },
      { value: 'all',       label: 'Everything crashes / whole PC locks up',  icon: '🔴', description: 'Likely a hardware instability (GPU, RAM, power)' },
    ],
  },

  'q-thermal-detail': {
    id: 'q-thermal-detail',
    section: 'Issues',
    question: 'Which component runs hot?',
    subtext: 'Thermal throttling causes sudden frame drops that get worse over time.',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'gpu',    label: 'GPU is very hot (85 °C+)',               icon: '🟥', description: 'GPU throttles at ~90 °C, causing sudden frame drops' },
      { value: 'cpu',    label: 'CPU is very hot (95 °C+)',               icon: '🟥', description: 'CPU throttle hurts physics and asset streaming' },
      { value: 'both',   label: 'Both GPU and CPU run hot',               icon: '🔥', description: 'Poor case airflow or insufficient cooling' },
      { value: 'unsure', label: 'Not sure — PC just feels warm',          icon: '❓' },
    ],
  },

  'q-gpu-temp': {
    id: 'q-gpu-temp',
    section: 'Issues',
    question: 'Does your GPU temperature spike during VR sessions?',
    subtext: 'Running high supersampling pushes GPUs close to their thermal limits.',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'hot',    label: 'Yes — GPU hits 85 °C or above',          icon: '🔴', description: 'Thermal throttle will cause stutters under high SS' },
      { value: 'warm',   label: 'Warm but stable (75–85 °C)',              icon: '🟡', description: 'Manageable but leave some headroom' },
      { value: 'cool',   label: 'Stays cool (below 75 °C)',                icon: '✅' },
      { value: 'unsure', label: 'I have not checked',                      icon: '❓' },
    ],
  },

  'q-paging': {
    id: 'q-paging',
    section: 'Issues',
    question: 'How much RAM does your PC have?',
    subtext: 'Early-session stutters often indicate Windows is using the page file because RAM is full.',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: '8gb',    label: '8 GB RAM',                               icon: '🔴', description: 'Very tight for VR — paging is almost certain' },
      { value: '16gb',   label: '16 GB RAM',                              icon: '🟡', description: 'Minimum recommended — may page under load' },
      { value: '32gb',   label: '32 GB RAM',                              icon: '✅', description: 'Comfortable for VR workloads' },
      { value: '64gb',   label: '64 GB+ RAM',                             icon: '✅', description: 'RAM is not your bottleneck' },
      { value: 'unsure', label: 'Not sure',                               icon: '❓' },
    ],
  },

  // ── SECTION: Goals ────────────────────────────────────────────────────────

  'q-goals': {
    id: 'q-goals',
    section: 'Goals',
    question: 'What do you primarily use VR for?',
    subtext: 'Different use cases have different performance priorities. This shapes how Vryionics weighs its recommendations.',
    nextQuestionId: 'q-vr-category',
    options: [
      { value: 'social',  label: 'Social VR (VRChat, Rec Room)',           icon: '🧑‍🤝‍🧑', description: 'CPU-heavy — avatar rendering and physics dominate' },
      { value: 'gaming',  label: 'VR gaming (Beat Saber, HLA, Boneworks)', icon: '🎮', description: 'GPU-heavy — consistent frame timing matters most' },
      { value: 'fitness', label: 'Fitness (Beat Saber, Supernatural)',     icon: '🏃', description: 'Reliability and low latency are top priorities' },
      { value: 'sim',     label: 'Simulation (DCS, MSFS, Elite Dangerous)',icon: '✈️', description: 'Extreme GPU and CPU demands — resolution matters' },
      { value: 'mixed',   label: 'Mix of everything',                     icon: '🎯' },
    ],
  },

  'q-vr-category': {
    id: 'q-vr-category',
    section: 'Goals',
    question: 'What do you primarily use VR for?',
    subtext: 'Different use cases have different performance priorities.',
    nextQuestionId: 'q-budget',
    options: [
      { value: 'social',  label: 'Social VR (VRChat, Rec Room)',           icon: '🧑‍🤝‍🧑', description: 'CPU-heavy — avatar rendering and physics dominate' },
      { value: 'gaming',  label: 'VR gaming (Beat Saber, HLA, Boneworks)', icon: '🎮', description: 'GPU-heavy — consistent frame timing matters most' },
      { value: 'fitness', label: 'Fitness (Beat Saber, Supernatural)',     icon: '🏃', description: 'Reliability and low latency are top priorities' },
      { value: 'sim',     label: 'Simulation (DCS, MSFS, Elite Dangerous)',icon: '✈️', description: 'Extreme GPU and CPU demands — resolution matters' },
      { value: 'mixed',   label: 'Mix of everything',                     icon: '🎯' },
    ],
  },

  'q-budget': {
    id: 'q-budget',
    section: 'Goals',
    question: 'If you were to upgrade hardware, what is your rough budget?',
    subtext: 'This helps Vryionics prioritise free software fixes vs hardware upgrade suggestions.',
    isTerminal: true,
    options: [
      { value: 'none',       label: 'No upgrades right now',                 icon: '🚫', description: 'Software-only recommendations' },
      { value: 'under-100',  label: 'Under $100 (accessories / cables)',     icon: '💵' },
      { value: '100-300',    label: '$100–300 (one component)',               icon: '💵' },
      { value: '300-600',    label: '$300–600 (significant upgrade)',         icon: '💰' },
      { value: 'unlimited',  label: 'Performance over price',                icon: '🏆', description: 'Show me every option' },
    ],
  },

}

// ── Tree Export ───────────────────────────────────────────────────────────────

export const QUESTION_TREE: QuestionTree = {
  startQuestionId: 'q-headset-type',
  questions,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getQuestionById(id: string): Question | undefined {
  return QUESTION_TREE.questions[id]
}

export function getAnswerLabel(questionId: string, answerValue: string): string {
  const question = getQuestionById(questionId)
  if (!question) return answerValue
  const option = question.options.find((o) => o.value === answerValue)
  return option?.label ?? answerValue
}
