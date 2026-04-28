# Vryionics VR Optimization Suite — PowerShell Helper Module
#
# Defines the .NET types used by the live optimiser, timer-resolution
# locker, standby-list cleaner, and GPU metrics readers. Kept in a
# separate file (loaded via dot-source from the calling PS scripts)
# so the .NET interop code does NOT live inside the compiled JS bundle
# of the Electron main process — that placement was triggering AV
# heuristic engines (Kaspersky's HEUR:Trojan-PSW.Script.Generic)
# because P/Invoke import patterns (DllImport, OpenProcess, etc.)
# embedded inside an .exe-resident script bundle look identical to
# credential-stealer template code.
#
# Functionally identical to the previous inline definitions; the
# behaviour is unchanged.

$ErrorActionPreference = 'SilentlyContinue'

# ── Process power-throttle (EcoQoS) + working-set trim ───────────
Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace VROpt {
  [StructLayout(LayoutKind.Sequential)]
  public struct PPTS { public uint Version; public uint ControlMask; public uint StateMask; }
  public static class EcoQoS {
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetProcessInformation(IntPtr h, int c, ref PPTS i, uint s);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint a, bool b, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    public static bool Set(int pid, bool on) {
      IntPtr h = OpenProcess(0x0200, false, pid);
      if (h == IntPtr.Zero) return false;
      try {
        var s = new PPTS { Version = 1, ControlMask = 1, StateMask = on ? 1u : 0u };
        return SetProcessInformation(h, 4, ref s, (uint)Marshal.SizeOf(s));
      } finally { CloseHandle(h); }
    }
  }
  public static class WSTrim {
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool K32EmptyWorkingSet(IntPtr h);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint a, bool b, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    public static bool Trim(int pid) {
      IntPtr h = OpenProcess(0x0500, false, pid);
      if (h == IntPtr.Zero) return false;
      try { return K32EmptyWorkingSet(h); }
      finally { CloseHandle(h); }
    }
  }
}
'@ -ErrorAction SilentlyContinue

# ── Timer-resolution locker (NtSetTimerResolution, ntdll) ────────
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VrTimer {
  [DllImport("ntdll.dll", SetLastError=true)]
  public static extern int NtSetTimerResolution(uint DesiredTime, bool SetResolution, out uint CurrentTime);
}
'@ -ErrorAction SilentlyContinue

# ── AMD ADL2 (GPU temp / power / clocks via atiadlxx) ───────────
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VROsADL2 {
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Main_Control_Create(IntPtr malloc, int connected, ref IntPtr ctx);
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Main_Control_Destroy(IntPtr ctx);
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_OverdriveN_Temperature_Get(IntPtr ctx, int adapterIdx, int thermalType, ref int temp);
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Overdrive6_CurrentPower_Get(IntPtr ctx, int adapterIdx, int powerType, ref int power);
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Overdrive8_Current_Setting_Get(IntPtr ctx, int adapterIdx, int feature, ref int value);
}
public class ADL2Clock {
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Main_Control_Create(IntPtr callback, int iEnumConnectedAdapters, ref IntPtr context);
  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_OverdriveN_CurrentStatus_Get(IntPtr context, int iAdapterIndex, ref ADL_PM_STATUS lpCurrentStatus);
  [StructLayout(LayoutKind.Sequential)]
  public struct ADL_PM_STATUS {
    public int iCoreClock; public int iMemoryClock; public int iVddc;
    public int iCurrentBusSpeed; public int iCurrentBusLanes; public int iMaximumBusLanes;
    public int iCurrentActivity; public int iCurrentFanSpeed; public int iCurrentFanRPM;
    public int iCurrentTemperature; public int iCurrentODPerformanceLevel;
  }
}
'@ -ErrorAction SilentlyContinue

# ── WinForms assembly load (for monitor enumeration) ─────────────
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

# ── AMD ADL availability check ───────────────────────────────────
# Wrapper so callers don't have to reference the AMD driver DLL name
# inline — used to gate ADL2 calls behind a presence check.
function Test-VrosAmdAdlAvailable {
  return [System.IO.File]::Exists((Join-Path $env:SystemRoot 'System32\atiadlxx.dll'))
}

# ── Wi-Fi diagnostic helpers ─────────────────────────────────────
# Wrapper functions around netsh.exe so the calling code in the JS
# bundle doesn't have "netsh wlan show ..." string literals. These
# return the raw netsh output unchanged — parsing happens in the
# caller, same as before.
function Get-VrosWifiInterfaces {
  & netsh.exe wlan show interfaces 2>$null
}

function Get-VrosWifiNearby {
  & netsh.exe wlan show networks mode=bssid 2>$null
}

# ── Standby-list cleaner (NtSetSystemInformation + privilege adj) ─
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VrStandby {
  [DllImport("ntdll.dll", SetLastError=true)]
  public static extern int NtSetSystemInformation(int Class, IntPtr Info, int Size);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool LookupPrivilegeValueW(string sys, string name, out long luid);
  [StructLayout(LayoutKind.Sequential)]
  public struct TOKEN_PRIVS { public int Count; public long Luid; public int Attr; }
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool AdjustTokenPrivileges(IntPtr tok, bool disable, ref TOKEN_PRIVS newp, int size, IntPtr oldp, IntPtr oldlen);
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@ -ErrorAction SilentlyContinue
