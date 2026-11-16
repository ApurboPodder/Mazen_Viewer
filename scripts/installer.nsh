!macro customInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\shell\register-shell-extensions.ps1" -Action Install'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Could not register MAZEN Viewer Explorer previews for this user."
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\shell\register-shell-extensions.ps1" -Action Uninstall'
  Pop $0
!macroend
