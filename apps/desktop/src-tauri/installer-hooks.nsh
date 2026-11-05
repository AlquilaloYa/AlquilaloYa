!define MUI_WELCOMEPAGE_TITLE "Tu hogar, en buenas manos."
!define MUI_WELCOMEPAGE_TEXT "Instala AlquilaYa ERP y gestiona clientes, departamentos, contratos y mantenimiento desde un solo lugar.$\r$\n$\r$\nPresiona Siguiente para continuar."
!define MUI_FINISHPAGE_TITLE "AlquilaYa ERP está listo"
!define MUI_FINISHPAGE_TEXT "La instalación terminó correctamente. Ya puedes iniciar sesión y gestionar el sistema desde tu equipo."
!define MUI_FINISHPAGE_RUN_TEXT "Abrir AlquilaYa ERP"

!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
