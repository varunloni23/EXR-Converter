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

  ; 9. Right click on Folder(s): Remove Watermark
  WriteRegStr HKCR "Directory\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "Directory\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "Directory\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  ; 10. Right click on Folder background: Remove Watermark
  WriteRegStr HKCR "Directory\Background\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "Directory\Background\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "Directory\Background\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%V"'

  ; 11. Right click on Image & Video File(s) (PerceivedType image/video + explicit extensions): Remove Watermark
  WriteRegStr HKCR "SystemFileAssociations\image\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\image\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\image\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\image\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\video\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\video\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\video\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\video\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.png\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.png\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.png\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.png\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.jpg\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.jpg\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.jpg\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.jpg\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.jpeg\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.jpeg\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.jpeg\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.jpeg\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.webp\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.webp\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.webp\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.webp\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.mp4\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.mp4\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.mp4\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.mp4\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.mov\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.mov\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.mov\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.mov\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.webm\shell\GeminiWatermarkRemover" "" "Remove Watermark"
  WriteRegStr HKCR "SystemFileAssociations\.webm\shell\GeminiWatermarkRemover" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "SystemFileAssociations\.webm\shell\GeminiWatermarkRemover" "MultiSelectModel" "Player"
  WriteRegStr HKCR "SystemFileAssociations\.webm\shell\GeminiWatermarkRemover\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background --watermark "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "Directory\shell\EXRConverterMOV"
  DeleteRegKey HKCR "Directory\shell\EXRConverterJPEG"
  DeleteRegKey HKCR "Directory\shell\EXRConverterCompare"
  DeleteRegKey HKCR "Directory\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverterMOV"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverterJPEG"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverterCompare"
  DeleteRegKey HKCR "Directory\Background\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.exr\shell\EXRConverterMOV"
  DeleteRegKey HKCR "SystemFileAssociations\.exr\shell\EXRConverterJPEG"
  DeleteRegKey HKCR "SystemFileAssociations\image\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\video\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.png\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.jpg\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.jpeg\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.webp\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.mp4\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.mov\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "SystemFileAssociations\.webm\shell\GeminiWatermarkRemover"
  DeleteRegKey HKCR "Directory\shell\EXRConverter"
  DeleteRegKey HKCR "Directory\Background\shell\EXRConverter"
  DeleteRegKey HKCR "SystemFileAssociations\.exr\shell\EXRConverter"
!macroend

