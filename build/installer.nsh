!macro preInit
  ; Terminate any running instance of EXR Converter before process check runs
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  nsExec::Exec 'taskkill /F /IM "EXR Converter.exe" /T'
  nsExec::Exec 'taskkill /F /IM "exr-converter.exe" /T'
!macroend

!macro customInit
  ; Terminate any running instance of EXR Converter so setup never blocks with 'cannot be closed'
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  nsExec::Exec 'taskkill /F /IM "EXR Converter.exe" /T'
  nsExec::Exec 'taskkill /F /IM "exr-converter.exe" /T'
!macroend

!macro customUnInstallCheck
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  nsExec::Exec 'taskkill /F /IM "EXR Converter.exe" /T'
  nsExec::Exec 'taskkill /F /IM "exr-converter.exe" /T'
!macroend

!macro customInstall
  DetailPrint "Registering EXR Converter Windows Explorer Context Menus..."
  
  ; 1. Right click on Folder: Convert to MOV
  WriteRegStr HKCR "Directory\shell\EXRConverterMOV" "" "Convert to MOV"
  WriteRegStr HKCR "Directory\shell\EXRConverterMOV" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\shell\EXRConverterMOV\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --format mov --mode sequence "%1"'

  ; 2. Right click on Folder: Convert to JPEG
  WriteRegStr HKCR "Directory\shell\EXRConverterJPEG" "" "Convert to JPEG"
  WriteRegStr HKCR "Directory\shell\EXRConverterJPEG" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\shell\EXRConverterJPEG\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --format jpg "%1"'

  ; 3. Right click on Folder background: Convert to MOV
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterMOV" "" "Convert to MOV"
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterMOV" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterMOV\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --format mov --mode sequence "%V"'

  ; 4. Right click on Folder background: Convert to JPEG
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterJPEG" "" "Convert to JPEG"
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterJPEG" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterJPEG\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --format jpg "%V"'

  ; 5. Right click on .exr file: Convert to MOV
  WriteRegStr HKCR "SystemFileAssociations\.exr\shell\EXRConverterMOV" "" "Convert to MOV"
  WriteRegStr HKCR "SystemFileAssociations\.exr\shell\EXRConverterMOV" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.exr\shell\EXRConverterMOV\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --format mov --mode sequence "%1"'

  ; 6. Right click on .exr file: Convert to JPEG
  WriteRegStr HKCR "SystemFileAssociations\.exr\shell\EXRConverterJPEG" "" "Convert to JPEG"
  WriteRegStr HKCR "SystemFileAssociations\.exr\shell\EXRConverterJPEG" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.exr\shell\EXRConverterJPEG\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --format jpg "%1"'

  ; 7. Right click on Folder: Compare Folders
  WriteRegStr HKCR "Directory\shell\EXRConverterCompare" "" "Compare Folders"
  WriteRegStr HKCR "Directory\shell\EXRConverterCompare" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\shell\EXRConverterCompare\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --compare "%1"'

  ; 8. Right click on Folder background: Compare Folders
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterCompare" "" "Compare Folders"
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterCompare" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\Background\shell\EXRConverterCompare\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --compare "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "Directory\shell\EXRConverterMOV"
  DeleteRegKey HKCR "Directory\shell\EXRConverterJPEG"
  DeleteRegKey HKCR "Directory\shell\EXRConverterCompare"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverterMOV"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverterJPEG"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverterCompare"
  DeleteRegKey HKCR "SystemFileAssociations\.exr\shell\EXRConverterMOV"
  DeleteRegKey HKCR "SystemFileAssociations\.exr\shell\EXRConverterJPEG"
  DeleteRegKey HKCR "Directory\shell\EXRConverter"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverter"
  DeleteRegKey HKCR "SystemFileAssociations\.exr\shell\EXRConverter"
!macroend

