param([Parameter(Mandatory=$true)][string]$InstallDir,[string]$PreviousInstallDir='', [string]$StagedDir='', [string]$BaseManifest='', [string]$BlockPatch='', [switch]$StopOnly,[string]$RegistryId='RiftBuddy',[string]$ShortcutName='开黑搭子')
$ErrorActionPreference='Stop'
# Use Windows PowerShell's own modules even when launched from pwsh/Node.
$env:PSModulePath=Join-Path $PSHOME 'Modules'
function FileSha([string]$File){$Stream=[IO.File]::OpenRead($File);$Hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($Hash.ComputeHash($Stream)).Replace('-','').ToLowerInvariant()}finally{$Hash.Dispose();$Stream.Dispose()}}
function CheckedRoot([string]$Value) {
 $Resolved=[IO.Path]::GetFullPath($Value).TrimEnd('\')
 $Forbidden=@([IO.Path]::GetPathRoot($Resolved).TrimEnd('\'),$env:USERPROFILE,$env:WINDIR,$env:APPDATA,$env:LOCALAPPDATA,$env:ProgramFiles,${env:ProgramFiles(x86)},[Environment]::GetFolderPath('Desktop'))
 if(!$Resolved -or $Forbidden -contains $Resolved){throw 'Unsafe installation directory'}
 if(Test-Path -LiteralPath $Resolved){$Node=Get-Item -LiteralPath $Resolved;while($Node){if($Node.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Installation links are not supported'};$Node=$Node.Parent}}
 return $Resolved
}
function ChildPath([string]$Root,[string]$Name){
 if(!$Name -or $Name.Length -gt 500 -or $Name -match '[\x00-\x1f\\:*?"<>|]' -or $Name.StartsWith('/') -or @($Name.Split('/')|Where-Object {$_ -in @('','.','..') -or $_ -match '[. ]$' -or $_ -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)'}).Count){throw 'Invalid payload path'}
 $Full=[IO.Path]::GetFullPath((Join-Path $Root $Name));if(!$Full.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Payload escaped installation directory'}
 $Parent=Split-Path -Parent $Full;while($Parent -and $Parent.StartsWith($Root,[StringComparison]::OrdinalIgnoreCase)){if(Test-Path -LiteralPath $Parent){if((Get-Item -LiteralPath $Parent).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Payload links are not supported'}};if($Parent -eq $Root){break};$Parent=Split-Path -Parent $Parent}
 if((Test-Path -LiteralPath $Full) -and ((Get-Item -LiteralPath $Full).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Payload links are not supported'}
 return $Full
}
function ReadManifest([string]$File){
 $Value=Get-Content -LiteralPath $File -Raw -Encoding UTF8|ConvertFrom-Json
 if($Value.schema -ne 1 -or $Value.appId -ne 'rift-buddy' -or $Value.version -notmatch '^\d+\.\d+\.\d+$' -or !$Value.files -or $Value.files.Count -gt 20000){throw 'Invalid installation manifest'}
 $Seen=@{};foreach($Row in $Value.files){$null=ChildPath $Target $Row.name;if($Seen.ContainsKey($Row.name) -or $Row.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $Row.bytes -lt 0 -or $Row.bytes -gt 1073741824){throw 'Invalid installation file'};$Seen[$Row.name]=$true}
 return $Value
}
function VerifyFile([string]$File,$Row){
 if(!(Test-Path -LiteralPath $File -PathType Leaf) -or (Get-Item -LiteralPath $File).Length -ne $Row.bytes -or (FileSha $File) -ine $Row.sha256){throw 'Payload integrity check failed'}
}
function CopyExact([string]$From,[string]$To){$Parent=Split-Path -Parent $To;if(!(Test-Path -LiteralPath $Parent)){New-Item -ItemType Directory -Path $Parent -Force|Out-Null};Copy-Item -LiteralPath $From -Destination $To -Force}
function RestoreBlocks([string]$Descriptor,$Base,$Next,[string]$OriginalRoot,[string]$StageRoot){
 $Info=Get-Item -LiteralPath $Descriptor
 if($Info.PSIsContainer -or ($Info.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $Info.Length -gt 33554432){throw 'Invalid block patch descriptor'}
 $Patch=Get-Content -LiteralPath $Descriptor -Raw -Encoding UTF8|ConvertFrom-Json
 if($Patch.schema -ne 1 -or $Patch.files -isnot [array] -or $Patch.files.Count -lt 1 -or $Patch.files.Count -gt 200){throw 'Invalid block patch files'}
 $BaseFiles=@{};$NextFiles=@{};$Seen=@{}
 foreach($Row in $Base.files){$BaseFiles[$Row.name]=$Row};foreach($Row in $Next.files){$NextFiles[$Row.name]=$Row}
 foreach($Entry in $Patch.files){
  $Before=$BaseFiles[$Entry.name];$After=$NextFiles[$Entry.name]
  if(!$Before -or !$After -or $Seen.ContainsKey($Entry.name) -or $Entry.baseBytes -ne $Before.bytes -or $Entry.baseSha256 -cne $Before.sha256 -or $Entry.targetBytes -ne $After.bytes -or $Entry.targetSha256 -cne $After.sha256){throw 'Block patch identity differs from manifests'}
  $Seen[$Entry.name]=$true
  $Original=ChildPath $OriginalRoot $Entry.name;$Destination=ChildPath $StageRoot $Entry.name
  if(Test-Path -LiteralPath $Destination){throw 'Block patch conflicts with staged payload'}
  VerifyFile $Original $Before
  if($Entry.operations -isnot [array] -or $Entry.operations.Count -lt 1 -or $Entry.operations.Count -gt 100000){throw 'Invalid block patch operations'}
  $Parent=Split-Path -Parent $Destination;if(!(Test-Path -LiteralPath $Parent)){New-Item -ItemType Directory -Path $Parent -Force|Out-Null}
  $InputStream=[IO.File]::OpenRead($Original);$OutputStream=$null
  try {
   $OutputStream=[IO.File]::Open($Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $Buffer=New-Object byte[] 65536;$Written=0L
   foreach($Operation in $Entry.operations){
    $Count=[long]$Operation.bytes
    if($Count -le 0 -or $Count -ne $Operation.bytes -or $Count -gt $After.bytes-$Written){throw 'Invalid block patch length'}
    $Copy=$Operation.PSObject.Properties.Name -contains 'copy';$Literal=$Operation.PSObject.Properties.Name -contains 'data'
    if($Copy -eq $Literal){throw 'Ambiguous block patch operation'}
    if($Copy){
     $Offset=[long]$Operation.copy
     if($Offset -lt 0 -or $Offset -ne $Operation.copy -or $Offset -gt $Before.bytes -or $Count -gt $Before.bytes-$Offset){throw 'Invalid block patch source range'}
     $null=$InputStream.Seek($Offset,[IO.SeekOrigin]::Begin);$Remaining=$Count
     while($Remaining -gt 0){$Read=$InputStream.Read($Buffer,0,[int][Math]::Min(65536,$Remaining));if($Read -le 0){throw 'Block patch source ended early'};$OutputStream.Write($Buffer,0,$Read);$Remaining-=$Read}
    }else{
     if($Operation.data -isnot [string] -or $Count -gt 65536 -or $Operation.data.Length -gt 87384){throw 'Invalid block patch literal'}
     $Bytes=[Convert]::FromBase64String($Operation.data);if($Bytes.Length -ne $Count){throw 'Block patch literal length differs'};$OutputStream.Write($Bytes,0,$Bytes.Length)
    }
    $Written+=$Count
   }
   if($Written -ne $After.bytes){throw 'Block patch output is incomplete'}
  }finally{if($OutputStream){$OutputStream.Dispose()};$InputStream.Dispose()}
  VerifyFile $Destination $After
 }
}
function StopInstalled([string]$Root){
 $Allowed=@('开黑搭子.exe','resources/window-observer.exe','resources/connection/node.exe','resources/connection/connection-launcher.exe')|ForEach-Object {ChildPath $Root $_}
 $Processes=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -and $Allowed -contains $_.ExecutablePath})
 foreach($Entry in $Processes){$Proc=Get-Process -Id $Entry.ProcessId -ErrorAction SilentlyContinue;if($Proc -and $Proc.MainWindowHandle -ne 0){$null=$Proc.CloseMainWindow();$null=$Proc.WaitForExit(2000)}}
 foreach($Entry in $Processes){$Current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$Entry.ProcessId);if($Current -and $Current.ExecutablePath -eq $Entry.ExecutablePath){Stop-Process -Id $Entry.ProcessId -Force}}
}
function ClearBackup([string]$Root){
 if(!(Test-Path -LiteralPath $Root)){return}
 # Only this invocation's newly created backup; never follow links or recurse-delete.
 foreach($File in Get-ChildItem -LiteralPath $Root -Recurse -File){$Name=$File.FullName.Substring($Root.Length+1).Replace('\','/');Remove-Item -LiteralPath (ChildPath $Root $Name) -Force}
 foreach($Directory in Get-ChildItem -LiteralPath $Root -Recurse -Directory|Sort-Object { $_.FullName.Length } -Descending){Remove-Item -LiteralPath $Directory.FullName -ErrorAction SilentlyContinue}
 Remove-Item -LiteralPath $Root -ErrorAction SilentlyContinue
}
try {
 if($RegistryId -notmatch '^[A-Za-z0-9-]{1,80}$'){throw 'Invalid registry identity'}
 if(!$ShortcutName -or $ShortcutName -match '[\\/:*?"<>|\r\n$]'){throw 'Invalid shortcut identity'}
 $Target=CheckedRoot $InstallDir
 if($StopOnly){StopInstalled $Target;exit 0}
 $Stage=CheckedRoot $StagedDir
 if($Target -eq $Stage -or $Stage.StartsWith($Target+'\',[StringComparison]::OrdinalIgnoreCase) -or $Target.StartsWith($Stage+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Staging overlaps installation'}
 $Old=if($PreviousInstallDir){CheckedRoot $PreviousInstallDir}else{$Target}
 $Manifest=ReadManifest (Join-Path $Stage 'rift-buddy-install.json')
 if($BlockPatch -and !$BaseManifest){throw 'Block patch requires an incremental base'}
 if($BaseManifest){
  $Base=ReadManifest $BaseManifest
  $Installed=ReadManifest (Join-Path $Old 'rift-buddy-install.json')
  if($Installed.version -ne $Base.version -or (FileSha (Join-Path $Old 'rift-buddy-install.json')) -ne (FileSha $BaseManifest)){throw 'Incremental base changed; use full installer'}
  if($BlockPatch){RestoreBlocks $BlockPatch $Base $Manifest $Old $Stage}
  foreach($Row in $Manifest.files){$Destination=ChildPath $Stage $Row.name;if(!(Test-Path -LiteralPath $Destination)){$Original=ChildPath $Old $Row.name;VerifyFile $Original $Row;CopyExact $Original $Destination}}
 }
 foreach($Row in $Manifest.files){VerifyFile (ChildPath $Stage $Row.name) $Row}
 $StagedUninstaller=ChildPath $Stage '卸载开黑搭子.exe'
 if(!(Test-Path -LiteralPath $StagedUninstaller -PathType Leaf)){throw 'Staged uninstaller is missing'}
 $UninstallerRow=@{bytes=(Get-Item -LiteralPath $StagedUninstaller).Length;sha256=(FileSha $StagedUninstaller)}
 if($UninstallerRow.bytes -lt 1024){throw 'Staged uninstaller is invalid'}
 # Nothing has been stopped or removed before every target file is verified.
 $Uninstaller=Join-Path $Old '卸载开黑搭子.exe'
 $Existing=(Test-Path -LiteralPath $Uninstaller -PathType Leaf)
 $TargetNames=@($Manifest.files|ForEach-Object {$_.name})+@('rift-buddy-install.json','卸载开黑搭子.exe')
 if($Target -ne $Old -or !$Existing){foreach($Name in $TargetNames){if(Test-Path -LiteralPath (ChildPath $Target $Name)){throw ('Target contains an existing file: '+$Name)}}}
 if((Test-Path -LiteralPath (Join-Path $Old '开黑搭子.exe')) -and !$Existing){throw 'Previous uninstaller is missing; repair the existing installation first'}
 # Keep recovery outside the installer's ephemeral directory until restoration succeeds.
 $Backup=CheckedRoot ($Old+'.rollback-'+[Guid]::NewGuid().ToString('N'))
 $OldFiles=@();$Written=@();$Removed=$false
 $UninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\'+$RegistryId
 $OldRegistration=if(Test-Path -LiteralPath $UninstallKey){Get-ItemProperty -LiteralPath $UninstallKey}else{$null}
 $ShortcutFiles=@((Join-Path ([Environment]::GetFolderPath('Desktop')) ($ShortcutName+'.lnk')),(Join-Path ([Environment]::GetFolderPath('StartMenu')) ('Programs\'+$ShortcutName+'\开黑搭子.lnk')),(Join-Path ([Environment]::GetFolderPath('StartMenu')) ('Programs\'+$ShortcutName+'\卸载.lnk')))
 $ShortcutBackups=@()
 if($Existing){
  if(!(Test-Path -LiteralPath (Join-Path $Old 'resources\app.asar'))){throw 'Previous application identity is incomplete'}
  $OldFiles=@(Get-ChildItem -LiteralPath $Old -Recurse -File|ForEach-Object {$Relative=$_.FullName.Substring($Old.Length+1).Replace('\','/');$null=ChildPath $Old $Relative;$Relative})
  foreach($Name in $OldFiles){CopyExact (ChildPath $Old $Name) (ChildPath $Backup ('files/'+$Name))}
  for($Index=0;$Index -lt $ShortcutFiles.Count;$Index++){if(Test-Path -LiteralPath $ShortcutFiles[$Index] -PathType Leaf){$Copy=ChildPath $Backup ('shortcuts/'+$Index+'.lnk');CopyExact $ShortcutFiles[$Index] $Copy;$ShortcutBackups+=@{source=$Copy;target=$ShortcutFiles[$Index]}}}
  if($OldRegistration){$OldRegistration|Export-Clixml -LiteralPath (Join-Path $Backup 'registration.xml')}
 }
 try {
  StopInstalled $Old
  if($Existing){
   $Removed=$true
   $Process=Start-Process -FilePath $Uninstaller -ArgumentList @('/S',('_?='+$Old)) -Wait -PassThru -WindowStyle Hidden
   if($Process.ExitCode -ne 0){throw 'Previous uninstallation failed'}
   if(Test-Path -LiteralPath $Uninstaller){Remove-Item -LiteralPath $Uninstaller -Force}
   if(Test-Path -LiteralPath (Join-Path $Old 'resources\app.asar')){throw 'Previous application files are still present'}
  }
  # The old uninstaller must remove its own payload. A residual target is not ours to overwrite.
  foreach($Name in $TargetNames){if(Test-Path -LiteralPath (ChildPath $Target $Name)){throw ('Target file remains after uninstall: '+$Name)}}
  foreach($Row in $Manifest.files){$Destination=ChildPath $Target $Row.name;$Written+=$Destination;CopyExact (ChildPath $Stage $Row.name) $Destination;VerifyFile $Destination $Row}
  $Destination=ChildPath $Target 'rift-buddy-install.json';$Written+=$Destination;CopyExact (Join-Path $Stage 'rift-buddy-install.json') $Destination
  $Destination=ChildPath $Target '卸载开黑搭子.exe';$Written+=$Destination;CopyExact $StagedUninstaller $Destination;VerifyFile $Destination $UninstallerRow
 } catch {
  $Failure=$_.Exception.Message;$RestoreErrors=@()
  foreach($File in $Written){try{if(Test-Path -LiteralPath $File){Remove-Item -LiteralPath $File -Force}}catch{$RestoreErrors+=$_.Exception.Message}}
  if($Removed){
   foreach($Name in $OldFiles){try{$Source=ChildPath $Backup ('files/'+$Name);$Destination=ChildPath $Old $Name;if(!(Test-Path -LiteralPath $Destination -PathType Leaf) -or (FileSha $Destination) -ne (FileSha $Source)){CopyExact $Source $Destination}}catch{$RestoreErrors+=$_.Exception.Message}}
   foreach($Shortcut in $ShortcutBackups){try{CopyExact $Shortcut.source $Shortcut.target}catch{$RestoreErrors+=$_.Exception.Message}}
   try{if($OldRegistration){New-Item -Path $UninstallKey -Force|Out-Null;foreach($Property in $OldRegistration.PSObject.Properties|Where-Object {$_.Name -notlike 'PS*'}){Set-ItemProperty -LiteralPath $UninstallKey -Name $Property.Name -Value $Property.Value};New-Item -Path ('HKCU:\Software\'+$RegistryId) -Force|Out-Null;Set-ItemProperty -LiteralPath ('HKCU:\Software\'+$RegistryId) -Name InstallDir -Value $Old}}catch{$RestoreErrors+=$_.Exception.Message}
  }
  if($RestoreErrors.Count){throw ($Failure+'. Recovery requires attention; backup: '+$Backup+'. '+($RestoreErrors -join '; '))}
  try{ClearBackup $Backup}catch{[Console]::WriteLine('Restoration succeeded; temporary backup retained: '+$Backup)}
  throw ($Failure+'. Previous installation restored.')
 }
 try{ClearBackup $Backup}catch{[Console]::WriteLine('Installation succeeded; temporary backup retained: '+$Backup)}
 exit 0
} catch { Write-Error $_.Exception.Message;exit 1 }
