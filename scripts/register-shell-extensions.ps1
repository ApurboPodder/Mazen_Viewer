param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Install', 'Uninstall')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$shellDirectory = $PSScriptRoot
$extensionDll = Join-Path $shellDirectory 'MAZEN.ShellExtensions.dll'
$previewClsid = '{9E287A25-187A-4E1E-AB41-79392D3A9E63}'
$thumbnailClsid = '{82D1D3FC-EC7F-495A-9288-5A3DF4C4E032}'
$previewKey = 'Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
$previewHandlerKey = '{8895B1C6-B41F-4C1C-A562-0D564250836F}'
$thumbnailHandlerKey = '{E357FCCD-A995-4576-B01F-234630154E96}'
$systemAssociations = 'Software\Classes\SystemFileAssociations'
$extensions = @('.glb', '.stl', '.fbx', '.3dm', '.stp', '.step', '.igs', '.iges', '.obj', '.ply', '.dae', '.3ds', '.3mf', '.amf', '.pdf', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.cdr', '.cmx')

function Remove-OwnedRegistration {
  foreach ($extension in $extensions) {
    $extensionPaths = @(
      "Registry::HKEY_CURRENT_USER\Software\Classes\$extension\ShellEx",
      "Registry::HKEY_CURRENT_USER\$systemAssociations\$extension\ShellEx"
    )
    foreach ($handlerKey in @($previewHandlerKey, $thumbnailHandlerKey)) {
      foreach ($extensionPath in $extensionPaths) {
        $keyPath = Join-Path $extensionPath $handlerKey
        if (Test-Path $keyPath) {
          $key = Get-Item $keyPath
          if (($key.GetValue('') -as [string]) -in @($previewClsid, $thumbnailClsid)) {
            Remove-Item $keyPath -Recurse -Force
          }
        }
      }
    }
  }
  Remove-Item "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$previewClsid" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$thumbnailClsid" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-ItemProperty "Registry::HKEY_CURRENT_USER\$previewKey" -Name $previewClsid -ErrorAction SilentlyContinue
}

if ($Action -eq 'Uninstall') {
  Remove-OwnedRegistration
  exit 0
}

if (-not (Test-Path $extensionDll)) { throw "Shell extension assembly not found: $extensionDll" }
Remove-OwnedRegistration
$assembly = [Reflection.AssemblyName]::GetAssemblyName($extensionDll).FullName
$codeBase = ([Uri]$extensionDll).AbsoluteUri

function Register-ComClass([string]$clsid, [string]$className, [string]$displayName) {
  $inproc = "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$clsid\InprocServer32"
  New-Item $inproc -Force | Out-Null
  Set-Item $inproc 'mscoree.dll'
  New-ItemProperty $inproc -Name 'ThreadingModel' -Value 'Both' -PropertyType String -Force | Out-Null
  New-ItemProperty $inproc -Name 'Class' -Value $className -PropertyType String -Force | Out-Null
  New-ItemProperty $inproc -Name 'Assembly' -Value $assembly -PropertyType String -Force | Out-Null
  New-ItemProperty $inproc -Name 'RuntimeVersion' -Value 'v4.0.30319' -PropertyType String -Force | Out-Null
  New-ItemProperty $inproc -Name 'CodeBase' -Value $codeBase -PropertyType String -Force | Out-Null
  if ($clsid -eq $previewClsid) {
    New-ItemProperty "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$clsid" -Name 'AppID' -Value '{6D2B5079-2F0B-48F0-B58B-36CBED287C7C}' -PropertyType String -Force | Out-Null
    New-Item "Registry::HKEY_CURRENT_USER\$previewKey" -Force | Out-Null
    New-ItemProperty "Registry::HKEY_CURRENT_USER\$previewKey" -Name $clsid -Value $displayName -PropertyType String -Force | Out-Null
  }
}

Register-ComClass $previewClsid 'MAZEN.ShellExtensions.MAZENPreviewHandler' 'MAZEN Viewer Preview Handler'
Register-ComClass $thumbnailClsid 'MAZEN.ShellExtensions.MAZENThumbnailHandler' 'MAZEN Viewer Thumbnail Provider'

foreach ($extension in $extensions) {
  foreach ($root in @('Software\Classes', $systemAssociations)) {
    $shellEx = "Registry::HKEY_CURRENT_USER\$root\$extension\ShellEx"
    New-Item (Join-Path $shellEx $previewHandlerKey) -Force | Out-Null
    Set-Item (Join-Path $shellEx $previewHandlerKey) $previewClsid
    New-Item (Join-Path $shellEx $thumbnailHandlerKey) -Force | Out-Null
    Set-Item (Join-Path $shellEx $thumbnailHandlerKey) $thumbnailClsid
  }
}

exit 0
