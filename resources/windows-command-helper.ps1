# windows-command-helper.ps1
#
# Hardened, parameter-validated native input helper for DhwaniFlow voice commands.
# Invoked via spawn with argument arrays ONLY (no -Command and no shell string execution).

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [Parameter(Mandatory=$false)][string]$Param1 = "",
    [Parameter(Mandatory=$false)][string]$Param2 = ""
)

$ErrorActionPreference = "Stop"

# Strict allowlist of permitted actions
$ALLOWED_ACTIONS = @(
    "press",
    "scroll",
    "volume",
    "media",
    "snap",
    "minimize",
    "maximize",
    "show_desktop",
    "new_tab",
    "close_tab",
    "next_tab",
    "previous_tab",
    "copy",
    "paste",
    "undo",
    "select_all",
    "screenshot",
    "switch_app"
)

if ($Action -notin $ALLOWED_ACTIONS) {
    Write-Error "Invalid action: $Action"
    exit 1
}

Add-Type -MemberDefinition @"
[DllImport("user32.dll")]
public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);
"@ -Name "WinInputApi" -Namespace "DhwaniFlowInput"

function Send-KeyChord([byte[]]$downKeys, [byte[]]$upKeys) {
    foreach ($k in $downKeys) {
        [DhwaniFlowInput.WinInputApi]::keybd_event($k, 0, 0, [UIntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 20
    foreach ($k in $upKeys) {
        [DhwaniFlowInput.WinInputApi]::keybd_event($k, 0, 2, [UIntPtr]::Zero)
    }
}

switch ($Action) {
    "press" {
        $allowedKeys = @("enter", "escape", "tab", "backspace")
        if ($Param1 -notin $allowedKeys) {
            Write-Error "Invalid key for press: $Param1"
            exit 1
        }
        $vk = switch ($Param1) {
            "enter" { 0x0D }
            "escape" { 0x1B }
            "tab" { 0x09 }
            "backspace" { 0x08 }
        }
        Send-KeyChord @($vk) @($vk)
    }
    "scroll" {
        $allowedDirections = @("up", "down")
        if ($Param1 -notin $allowedDirections) {
            Write-Error "Invalid scroll direction: $Param1"
            exit 1
        }
        $amount = 1
        if ($Param2 -match '^\d+$') {
            $amount = [Math]::Max(1, [Math]::Min(10, [int]$Param2))
        }
        $delta = if ($Param1 -eq "up") { 120 * $amount } else { -120 * $amount }
        [DhwaniFlowInput.WinInputApi]::mouse_event(0x0800, 0, 0, $delta, [UIntPtr]::Zero)
    }
    "volume" {
        $allowedVol = @("up", "down", "mute")
        if ($Param1 -notin $allowedVol) {
            Write-Error "Invalid volume action: $Param1"
            exit 1
        }
        $vk = switch ($Param1) {
            "up" { 0xAF }
            "down" { 0xAE }
            "mute" { 0xAD }
        }
        Send-KeyChord @($vk) @($vk)
    }
    "media" {
        $allowedMedia = @("play_pause", "next", "previous")
        if ($Param1 -notin $allowedMedia) {
            Write-Error "Invalid media action: $Param1"
            exit 1
        }
        $vk = switch ($Param1) {
            "play_pause" { 0xB3 }
            "next" { 0xB0 }
            "previous" { 0xB1 }
        }
        Send-KeyChord @($vk) @($vk)
    }
    "snap" {
        $allowedSides = @("left", "right")
        if ($Param1 -notin $allowedSides) {
            Write-Error "Invalid snap side: $Param1"
            exit 1
        }
        $arrow = if ($Param1 -eq "left") { 0x25 } else { 0x27 }
        Send-KeyChord @(0x5B, $arrow) @($arrow, 0x5B)
    }
    "minimize" {
        Send-KeyChord @(0x5B, 0x28) @(0x28, 0x5B)
    }
    "maximize" {
        Send-KeyChord @(0x5B, 0x26) @(0x26, 0x5B)
    }
    "show_desktop" {
        Send-KeyChord @(0x5B, 0x44) @(0x44, 0x5B)
    }
    "new_tab" {
        Send-KeyChord @(0x11, 0x54) @(0x54, 0x11)
    }
    "close_tab" {
        Send-KeyChord @(0x11, 0x57) @(0x57, 0x11)
    }
    "next_tab" {
        Send-KeyChord @(0x11, 0x09) @(0x09, 0x11)
    }
    "previous_tab" {
        Send-KeyChord @(0x11, 0x10, 0x09) @(0x09, 0x10, 0x11)
    }
    "copy" {
        Send-KeyChord @(0x11, 0x43) @(0x43, 0x11)
    }
    "paste" {
        Send-KeyChord @(0x11, 0x56) @(0x56, 0x11)
    }
    "undo" {
        Send-KeyChord @(0x11, 0x5A) @(0x5A, 0x11)
    }
    "select_all" {
        Send-KeyChord @(0x11, 0x41) @(0x41, 0x11)
    }
    "screenshot" {
        Send-KeyChord @(0x5B, 0x10, 0x53) @(0x53, 0x10, 0x5B)
    }
    "switch_app" {
        $commandProcessNames = @{
            chrome='chrome'; firefox='firefox'; edge='msedge'; vscode='Code';
            notepad='notepad'; calculator='CalculatorApp'; explorer='explorer';
            terminal='WindowsTerminal'; spotify='Spotify'; discord='Discord'; slack='slack';
            settings='SystemSettings'; whatsapp='WhatsApp'; cursor='Cursor'
        }
        if (-not $commandProcessNames.ContainsKey($Param1)) { throw 'Unsupported application target' }
        $commandTarget = Get-Process -Name $commandProcessNames[$Param1] -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if (-not $commandTarget) { throw 'Application has no open window' }
        Add-Type -Namespace DhwaniFlow -Name FocusWindow -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetForegroundWindow(System.IntPtr handle);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr handle, int command);
'@
        [DhwaniFlow.FocusWindow]::ShowWindowAsync($commandTarget.MainWindowHandle, 9) | Out-Null
        if (-not [DhwaniFlow.FocusWindow]::SetForegroundWindow($commandTarget.MainWindowHandle)) {
            throw 'Application could not receive focus'
        }
    }
}
