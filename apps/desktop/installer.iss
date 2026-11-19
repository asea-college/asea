#define MyAppName "아세아 이음"
#define MyAppVersion "0.1.0"
[Setup]
AppId={{F587272E-6133-4D92-BB1E-B1577A48751D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\ASEA Notice
DefaultGroupName=아세아 이음
OutputBaseFilename=ASEA-IEUM-Setup-0.1.0-UNSIGNED
OutputDir=installer-output
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
[Files]
Source: "bin\Release\ASEA.Notice.exe"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\아세아 이음"; Filename: "{app}\ASEA.Notice.exe"
Name: "{autodesktop}\아세아 이음"; Filename: "{app}\ASEA.Notice.exe"; Tasks: desktopicon
[Tasks]
Name: desktopicon; Description: "바탕화면 바로가기 만들기"; Flags: unchecked
[Run]
Filename: "{app}\ASEA.Notice.exe"; Description: "아세아 이음 실행"; Flags: nowait postinstall skipifsilent
