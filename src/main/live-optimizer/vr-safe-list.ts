// VR Optimization Suite — VR Safe Process List
// Processes in this set are NEVER killed by the live optimizer.

export const VR_SAFE_PROCESSES: ReadonlySet<string> = new Set([
  // ── VR Runtimes & SteamVR Core ──────────────────────────────
  'vrserver.exe', 'vrcompositor.exe', 'vrmonitor.exe', 'vrdashboard.exe',
  'vrstartup.exe', 'vroverlayhost.exe', 'vrwebhelper.exe',
  'steam.exe', 'steamwebhelper.exe', 'steamservice.exe',
  'ovrserver_x64.exe', 'ovrservice.exe', 'ovrredir.exe',
  'ovrservicelauncher.exe', 'oculusclient.exe', 'oculus.exe',

  // ── Wireless Streaming ───────────────────────────────────────
  'virtualdesktop.streamer.exe', 'alvr dashboard.exe', 'alvr_server.exe',
  'alvr_server_launcher.exe',
  // Steam Link family — Steam Link for Meta Quest streams over SteamVR
  // and uses Steam's streaming pipeline. Quantum reported headset
  // disconnects on first launch with this combo; the optimizer was
  // likely throttling streaming infrastructure during connection
  // establishment. Protect every plausible binary.
  'steam_link.exe', 'steamlink.exe', 'streaming_client_x64.exe',
  'streaming_client.exe', 'steamvr_link.exe', 'vrlink.exe',
  'steamremoteclient.exe',
  // Steam itself + helpers — already above, but also protect when
  // streaming via in-home / link
  'steam streaming client.exe', 'steamstreamingclient.exe',

  // ── VRChat & Companion Tools ─────────────────────────────────
  'vrchat.exe', 'vrcx.exe', 'magicchatbox.exe', 'vrcosc.exe',
  'vrcfacetracking.exe', 'vrcfacetracking.avalonia.desktop.exe',
  'thumbparamsosc.exe', 'oyasumivr.exe', 'pulsoidtoosc.exe',
  'hrtovrchat_osc.exe', 'autoimmobilizeosc.exe', 'realiksosc.exe',
  'vrcadvancedactionsosc.exe', 'creatorcompanion.exe',

  // ── SteamVR Overlays & Tools ─────────────────────────────────
  'xsoverlay.exe', 'xsoverlay media manager.exe', 'xsoverlay process manager.exe',
  'ovr toolkit.exe', 'ovrtoolkit-task.exe', 'ovr toolkit-launcher.exe',
  'fpsvr.exe', 'advancedsettings.exe', 'openkneeboardapp.exe',
  'dxoverlay.exe', 'overlay sidecar.exe',

  // ── Body Tracking ────────────────────────────────────────────
  'slimevr.exe', 'amethyst.exe', 'k2ex.exe', 'kinectlessprocess.exe',
  'driver4vr.exe', 'opentrack.exe', 'apriltagtrackers.exe',
  'mocopi.exe', 'psmoveservice.exe', 'psmoveserviceex.exe',
  'owotirackapp.exe', 'owotrackapp.exe',

  // ── Face/Avatar Tracking ─────────────────────────────────────
  'vseeface.exe', 'vtube studio.exe', 'facetracker.exe',
  'sr_runtime.exe', 'sranipalservice.exe', 'vroidstudio.exe',
  'vmc4ue.exe', 'virtualmotion capture.exe',

  // ── Audio Software — NEVER KILL ──────────────────────────────
  'voicemeeter.exe', 'voicemeeter_x64.exe',
  'voicemeeterpro.exe', 'voicemeeterpro_x64.exe',
  'voicemeeter8x64.exe', 'vbaudiovmvaio.exe',
  'voicemod.exe', 'voicemoddesktop.exe',
  'neuralwix.exe', 'eartrumpet.exe',
  'audiodg.exe', 'sndvol.exe', 'realtek hd audio manager.exe',

  // ── Content Creation — NEVER KILL ───────────────────────────
  'obs64.exe', 'obs32.exe', 'obs.exe',
  'streamlabs desktop.exe', 'slobs.exe',
  'tiktok live studio.exe', 'tiktok live studio launcher.exe',
  'medal.exe', '4kcaptureutility.exe',
  'nvidia share.exe', 'nvsphelper64.exe', 'shadowplay.exe',
  'action!.exe', 'bandicam.exe', 'fraps.exe',
  'elgato game capture hd.exe',

  // ── Social & Comms — NEVER KILL ──────────────────────────────
  'discord.exe', 'discordptb.exe', 'discordcanary.exe',
  'teamspeak.exe', 'ts3client_win64.exe', 'teamspeak3.exe',
  'mumble.exe', 'mumble_app.exe',
  'spotify.exe',
  'slack.exe', 'teams.exe', 'msteams.exe',
  'telegram.exe', 'signal.exe', 'zoom.exe', 'skype.exe',
  'element.exe', 'guilded.exe',

  // ── Terminals / Command Prompts — NEVER KILL ─────────────────
  'cmd.exe', 'powershell.exe', 'pwsh.exe',
  'windowsterminal.exe', 'wt.exe', 'conhost.exe',
  'alacritty.exe', 'hyper.exe', 'mintty.exe',
  'bash.exe', 'wsl.exe', 'wslhost.exe',
  'git-bash.exe', 'gitbash.exe',

  // ── System Essentials — NEVER KILL ───────────────────────────
  'explorer.exe', 'dwm.exe', 'winlogon.exe', 'csrss.exe',
  'lsass.exe', 'svchost.exe', 'services.exe', 'smss.exe',
  'wininit.exe', 'taskmgr.exe', 'taskhostw.exe', 'sihost.exe',
  'ctfmon.exe', 'fontdrvhost.exe', 'spoolsv.exe', 'searchhost.exe',
  'securityhealthsystray.exe', 'securityhealthservice.exe',
  'runtimebroker.exe', 'backgroundtaskhost.exe',
  'startmenuexperiencehost.exe', 'shellexperiencehost.exe',
  'applicationframehost.exe', 'systemsettings.exe',
  'registry', 'system', 'idle', 'memory compression',

  // ── Security / AV ────────────────────────────────────────────
  'msmpeng.exe', 'nissrv.exe', 'mssense.exe',
  'mbamdlp.exe', 'mbam.exe', 'mbamservice.exe', 'mbamtray.exe',
  'avast.exe', 'avgui.exe', 'avg.exe', 'avguard.exe',
  'bitdefender.exe', 'bdservicehost.exe',
  'mcshield.exe', 'mcuicnt.exe',

  // ── GPU / Hardware Monitoring ─────────────────────────────────
  'nvdisplay.container.exe', 'nvidia web helper.exe',
  'nvtray.exe', 'nvspcap64.dll', 'rtss.exe',
  'msiafterburner.exe', 'afterburner.exe',
  'hwinfo64.exe', 'hwinfo32.exe', 'cpuz.exe', 'gpuz.exe',
  'aida64.exe', 'coretemp.exe',

  // ── Dev Tools (user may have open) ───────────────────────────
  'code.exe', 'cursor.exe', 'rider64.exe', 'devenv.exe',
  'android studio64.exe', 'idea64.exe', 'webstorm64.exe',
  'notepad++.exe', 'notepad.exe', 'sublimetext.exe',

  // ── VRyionics itself ─────────────────────────────────────────
  'vryionics vr optimization suite.exe', 'electron.exe',
])

// Windows service names that are safe to stop during VR (and restart after)
export const SERVICES_TO_STOP_DURING_VR: ReadonlyArray<{
  name: string
  displayName: string
}> = [
  { name: 'SysMain',       displayName: 'Superfetch / SysMain (disk prefetch)' },
  { name: 'DiagTrack',     displayName: 'Connected User Experiences and Telemetry' },
  { name: 'WSearch',       displayName: 'Windows Search Indexer' },
  { name: 'MapsBroker',    displayName: 'Downloaded Maps Manager' },
  { name: 'wuauserv',      displayName: 'Windows Update' },
  { name: 'RetailDemo',    displayName: 'Retail Demo Service' },
  { name: 'XblGameSave',   displayName: 'Xbox Game Save' },
  { name: 'XboxGipSvc',    displayName: 'Xbox Accessory Management' },
  { name: 'XblAuthManager',displayName: 'Xbox Live Auth Manager' },
  { name: 'TabletInputService', displayName: 'Touch Keyboard and Handwriting' },
]
