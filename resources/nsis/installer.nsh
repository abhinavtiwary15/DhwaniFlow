!macro customHeader
  ManifestDPIAware true
!macroend

; Electron writes the launch-at-login entry itself, so nothing in the generated
; uninstaller knows to remove it, and Windows keeps listing a startup item that
; points at a deleted executable. The Run value is named after the
; AppUserModelId main.js sets, which appends the release channel for non-
; production builds (keep in sync with BASE_WINDOWS_APP_ID and VALID_CHANNELS
; there). Disabling an item leaves a second value behind under StartupApproved,
; so both have to go.
!define OW_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define OW_STARTUP_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

!macro DeleteAutoStartEntry NAME
  DeleteRegValue HKCU "${OW_RUN_KEY}" "${NAME}"
  DeleteRegValue HKCU "${OW_STARTUP_APPROVED_KEY}" "${NAME}"
!macroend

!macro customInstall
!macroend

!macro customUnInstall
  ; Guarded by isUpdated so an in-place update does not silently turn launch at
  ; login off for a user who had enabled it.
  ${ifNot} ${isUpdated}
    !insertmacro DeleteAutoStartEntry "io.github.abhinavtiwary15.dhwaniflow"
    !insertmacro DeleteAutoStartEntry "com.gizmolabs.openwhispr"
    !insertmacro DeleteAutoStartEntry "com.gizmolabs.openwhispr.staging"
    !insertmacro DeleteAutoStartEntry "com.gizmolabs.openwhispr.development"
  ${endIf}
!macroend
