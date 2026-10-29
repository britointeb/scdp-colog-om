@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "SCDP_BATCH_FILE=%~f0"
set "SCDP_BATCH_ARG=%~1"
set "SCDP_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "SCDP_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%SCDP_POWERSHELL%" -NoLogo -NoProfile -Command "$s=[IO.File]::ReadAllText($env:SCDP_BATCH_FILE,[Text.Encoding]::UTF8);$p=[regex]::Split($s,'(?m)^#<SCDP_POWERSHELL>\r?$',2);if($p.Count -ne 2){throw 'Conteudo do BAT incompleto.'};& ([scriptblock]::Create($p[1]))"
set "SCDP_EXIT=%ERRORLEVEL%"
if /i not "%SCDP_BATCH_ARG%"=="--ajuda" pause
exit /b %SCDP_EXIT%
#<SCDP_POWERSHELL>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Invoke-Captured {
    param([string]$File, [string[]]$Arguments = @(), [string]$Directory, [switch]$Show)
    $oldPreference = $ErrorActionPreference
    if ($Directory) { Push-Location -LiteralPath $Directory }
    try {
        $ErrorActionPreference = 'Continue'
        $lines = @(& $File @Arguments 2>&1 | ForEach-Object {
            if ($Show) { Write-Host $_.ToString() }
            $_
        })
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldPreference
        if ($Directory) { Pop-Location }
    }
    $message = ($lines | ForEach-Object { $_.ToString() }) -join "`n"
    return [pscustomobject]@{ Code = $code; Text = $message }
}

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments = @(), [string]$Directory)
    $result = Invoke-Captured -File $File -Arguments $Arguments -Directory $Directory -Show
    if ($result.Code -ne 0) { throw "Falha no comando $([IO.Path]::GetFileName($File)) (codigo $($result.Code))." }
}

function Get-ExistingTool {
    param([string[]]$Names, [string]$Cached, [string]$Minimum, [string]$Exact)
    $candidates = @()
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command -and $command.Source) { $candidates += $command.Source }
    }
    if ($Cached) { $candidates += $Cached }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $result = Invoke-Captured -File $candidate -Arguments @('--version')
        if ($result.Code -ne 0 -or $result.Text -notmatch '(\d+\.\d+\.\d+)') { continue }
        $version = $Matches[1]
        if ($Exact -and $version -ne $Exact) { continue }
        if ($Minimum -and [version]$version -lt [version]$Minimum) { continue }
        return $candidate
    }
    return $null
}

function Get-OfficialRelease {
    param([string]$Repository)
    return Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers @{ 'User-Agent' = 'SCDP-Installer'; Accept = 'application/vnd.github+json' }
}

function Get-VerifiedDownload {
    param([string]$Url, [string]$Destination, [string]$Sha256)
    if ($Url -notmatch '^https://' -or $Sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Endereco ou SHA-256 do instalador invalido.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Sha256) { return $Destination }
    $partial = $Destination + '.partial'
    Write-Host "Baixando $([IO.Path]::GetFileName($Destination))..."
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $partial -Headers @{ 'User-Agent' = 'SCDP-Installer' }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256) { throw 'SHA-256 divergente. O arquivo baixado nao sera executado.' }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
    return $Destination
}

function Install-ReleaseTool {
    param([string]$Kind, [string]$Architecture, [string]$ToolsRoot)
    $repository = if ($Kind -eq 'git') { 'git-for-windows/git' } else { 'cli/cli' }
    $release = Get-OfficialRelease -Repository $repository
    $pattern = if ($Kind -eq 'git') {
        if ($Architecture -eq 'arm64') { '^PortableGit-.+-arm64\.7z\.exe$' } else { '^PortableGit-.+-64-bit\.7z\.exe$' }
    } else {
        if ($Architecture -eq 'arm64') { '^gh_.+_windows_arm64\.zip$' } else { '^gh_.+_windows_amd64\.zip$' }
    }
    $assets = @($release.assets | Where-Object { $_.name -match $pattern })
    if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw "A fonte oficial nao informou instalador/hash valido para $Kind." }
    $digest = $Matches[1]
    $asset = $assets[0]
    $archive = Get-VerifiedDownload -Url $asset.browser_download_url -Destination (Join-Path $ToolsRoot ('downloads\' + $asset.name)) -Sha256 $digest
    $tag = $release.tag_name -replace '[^A-Za-z0-9._-]', '_'
    $target = Join-Path $ToolsRoot "$Kind-$tag-$Architecture"
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    if ($Kind -eq 'git') {
        $extract = Start-Process -FilePath $archive -ArgumentList @('-y', ('-o"' + $target + '"')) -Wait -PassThru -WindowStyle Hidden
        if ($extract.ExitCode -ne 0) { throw 'Falha ao extrair Git portatil.' }
        $executable = Join-Path $target 'cmd\git.exe'
    } else {
        Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
        $matchesExe = @(Get-ChildItem -LiteralPath $target -Filter gh.exe -File -Recurse)
        if ($matchesExe.Count -ne 1) { throw 'gh.exe nao encontrado no pacote oficial.' }
        $executable = $matchesExe[0].FullName
    }
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Instalacao de $Kind incompleta." }
    return $executable
}

function Install-PortableNode {
    param([string]$Architecture, [string]$ToolsRoot)
    $base = 'https://nodejs.org/dist/latest-v24.x/'
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt')).Content
    $pattern = '(?m)^([0-9a-fA-F]{64})\s+(node-v24\.\d+\.\d+-win-' + $Architecture + '\.zip)\s*$'
    if ($checksums -notmatch $pattern) { throw 'Pacote Node.js 24 LTS nao localizado na fonte oficial.' }
    $digest = $Matches[1]; $filename = $Matches[2]
    $archive = Get-VerifiedDownload -Url ($base + $filename) -Destination (Join-Path $ToolsRoot ('downloads\' + $filename)) -Sha256 $digest
    Expand-Archive -LiteralPath $archive -DestinationPath $ToolsRoot -Force
    return Join-Path $ToolsRoot ($filename.Substring(0, $filename.Length - 4) + '\node.exe')
}

function Get-ScdpTools {
    param([switch]$Runtime)
    if (-not $script:ToolsRoot) { throw 'Pasta de ferramentas nao configurada.' }
    $stateFile = Join-Path $script:ToolsRoot 'tools.json'
    $state = @{}
    if (Test-Path -LiteralPath $stateFile) {
        $object = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        foreach ($property in $object.PSObject.Properties) { $state[$property.Name] = [string]$property.Value }
    }
    $architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
    $architecture = switch ($architecture.ToUpperInvariant()) { 'AMD64' { 'x64' }; 'ARM64' { 'arm64' }; default { throw 'Este BAT requer Windows 10/11 de 64 bits (x64 ou ARM64).' } }
    if (-not $Runtime) {
        foreach ($kind in @('git','gh')) {
            $minimum = if ($kind -eq 'git') { '2.38.0' } else { '2.40.0' }
            $tool = Get-ExistingTool -Names @("$kind.exe") -Cached $state[$kind] -Minimum $minimum
            if (-not $tool) { Write-Host "Preparando $kind na pasta do usuario..."; $tool = Install-ReleaseTool -Kind $kind -Architecture $architecture -ToolsRoot $script:ToolsRoot }
            $state[$kind] = $tool
            $env:PATH = (Split-Path -Parent $tool) + ';' + $env:PATH
        }
    } else {
        $node = Get-ExistingTool -Names @('node.exe') -Cached $state['node'] -Minimum '22.13.0'
        if (-not $node) { Write-Host 'Preparando Node.js 24 LTS...'; $node = Install-PortableNode -Architecture $architecture -ToolsRoot $script:ToolsRoot }
        $state['node'] = $node
        $env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
        $pnpm = Get-ExistingTool -Names @('pnpm.cmd','pnpm.exe') -Cached $state['pnpm'] -Exact '11.25.0'
        if (-not $pnpm) {
            $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
            if (-not (Test-Path -LiteralPath $npm)) {
                $node = Install-PortableNode -Architecture $architecture -ToolsRoot $script:ToolsRoot
                $state['node'] = $node
                $env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
                $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
            }
            $prefix = Join-Path $script:ToolsRoot 'pnpm-11.25.0'
            Write-Host 'Preparando pnpm 11.25.0...'
            Invoke-Checked -File $npm -Arguments @('install','--prefix',$prefix,'--no-audit','--no-fund','--ignore-scripts','pnpm@11.25.0')
            $pnpm = Join-Path $prefix 'node_modules\.bin\pnpm.cmd'
            if (-not (Test-Path -LiteralPath $pnpm)) { throw 'Instalacao do pnpm incompleta.' }
        }
        $state['pnpm'] = $pnpm
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    return $state
}

function Ensure-GithubLogin {
    param([string]$Gh)
    Write-Host 'Preparando autenticacao do GitHub...'
    # PortableGit pode abrir o helper-selector durante o login. Configure o gh
    # antes da autenticacao para evitar a espera por uma janela de selecao.
    Invoke-Checked -File $Gh -Arguments @('auth','setup-git','--hostname','github.com','--force')
    $login = Invoke-Captured -File $Gh -Arguments @('api','user','--jq','.login')
    if ($login.Code -ne 0 -or $login.Text.Trim() -ne 'britointeb') {
        $switch = Invoke-Captured -File $Gh -Arguments @('auth','switch','--hostname','github.com','--user','britointeb')
        $login = Invoke-Captured -File $Gh -Arguments @('api','user','--jq','.login')
        if ($login.Code -ne 0 -or $login.Text.Trim() -ne 'britointeb') {
            Write-Host 'Entre no GitHub com a conta britointeb (britointeb@gmail.com).'
            Write-Host 'Conclua o codigo de acesso mostrado abaixo no navegador.'
            & $Gh auth login --hostname github.com --git-protocol https --web
            if ($LASTEXITCODE -ne 0) { throw 'Login do GitHub nao concluido.' }
            $login = Invoke-Captured -File $Gh -Arguments @('api','user','--jq','.login')
            if ($login.Code -ne 0 -or $login.Text.Trim() -ne 'britointeb') { throw 'A conta autenticada deve ser britointeb.' }
        }
    }
    Invoke-Checked -File $Gh -Arguments @('auth','setup-git','--hostname','github.com')
    Write-Host 'Login confirmado: britointeb.' -ForegroundColor Green
}

function Test-ScdpProject {
    param([string]$Directory)
    $package = Join-Path $Directory 'package.json'
    if (-not (Test-Path -LiteralPath $package -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $Directory 'app.jsx') -PathType Leaf)) { return $false }
    try { return ((Get-Content -LiteralPath $package -Raw | ConvertFrom-Json).name -eq 'scdp-painel') } catch { return $false }
}

function Test-PublishablePath {
    param([string]$Path)
    $name = $Path.Replace('\','/')
    if ($name -match '(^|/)(backups|node_modules|\.pnpm-store|dist|offline|relatorios)/' -or $name -match '^DADOS/' -or $name -match '(^|/)\.env($|\.)' -and $name -ne '.env.example') { return $false }
    if ($name -in @('.gitignore','.gitattributes','.env.example','README.md','GUIA_GIT.md','THIRD_PARTY_NOTICES.md','LICENSE','LICENSE.md','INICIAR_DASH.bat','PUBLICAR_SCDP.bat','app.jsx','index.html','dev.html','painel.css','tema.css','styles.css','package.json','pnpm-lock.yaml','vite.config.js','scdp.local.example.json','assets/colog.png','public/dados/.gitkeep','public/dados/tesgen.csv','public/dados/bilhetes.csv','public/dados/teto_orcamentario.csv','public/dados/manifesto.json','geografia/cidades.json','geografia/mundo.json','geografia/LEIA_ME.md')) { return $true }
    return $name -match '^(componentes|paginas|servicos|scripts|tests)/.+\.(js|mjs|cjs|jsx|ts|tsx|css|json|md)$' -or $name -match '^\.github/.+\.(yml|yaml|md|json)$'
}

function Protect-ScdpFiles {
    param([string]$Directory)
    $ignoreFile = Join-Path $Directory '.gitignore'
    $lines = @()
    if (Test-Path -LiteralPath $ignoreFile) { $lines = @([IO.File]::ReadAllLines($ignoreFile)) }
    $lines = @($lines | ForEach-Object { if ($_ -eq 'dados.js') { '/dados.js' } elseif ($_ -eq 'dados.js.tmp') { '/dados.js.tmp' } else { $_ } })
    foreach ($pattern in @('/dados.js','/dados.js.tmp','/public/dados/*','!/public/dados/.gitkeep','backups/','node_modules/','.pnpm-store/','dist/','offline/','scdp.local.json','.env','.env.*','!.env.example','*.log','relatorios/','/DADOS/')) { if ($lines -notcontains $pattern) { $lines += $pattern } }
    # Estas sao as bases consolidadas autorizadas para o painel publicado.
    $publishedData = @('!/public/dados/tesgen.csv','!/public/dados/bilhetes.csv','!/public/dados/teto_orcamentario.csv','!/public/dados/manifesto.json')
    $lines = @($lines | Where-Object { $_ -notin $publishedData }) + $publishedData
    [IO.File]::WriteAllLines($ignoreFile, $lines, (New-Object Text.UTF8Encoding($false)))
    $attributesFile = Join-Path $Directory '.gitattributes'
    $attributes = @()
    if (Test-Path -LiteralPath $attributesFile) { $attributes = @([IO.File]::ReadAllLines($attributesFile)) }
    if ($attributes -notcontains '/public/dados/*.csv -text') { $attributes += '/public/dados/*.csv -text' }
    [IO.File]::WriteAllLines($attributesFile, $attributes, (New-Object Text.UTF8Encoding($false)))
    New-Item -ItemType Directory -Path (Join-Path $Directory 'public\dados') -Force | Out-Null
    $keep = Join-Path $Directory 'public\dados\.gitkeep'
    if (-not (Test-Path -LiteralPath $keep)) { [IO.File]::WriteAllText($keep, '') }
}

function Assert-GitOk {
    param([string]$Git, [string]$Directory, [string[]]$Arguments)
    $result = Invoke-Captured -File $Git -Arguments $Arguments -Directory $Directory
    if ($result.Code -ne 0) { throw $result.Text }
    return $result.Text.Trim()
}

function Initialize-ScdpRepository {
    param([string]$Git, [string]$Directory, [string]$Remote)
    $existing = Invoke-Captured -File $Git -Arguments @('rev-parse','--show-toplevel') -Directory $Directory
    $fresh = $existing.Code -ne 0
    if (-not $fresh -and [IO.Path]::GetFullPath($existing.Text.Trim()) -ne [IO.Path]::GetFullPath($Directory)) { throw 'A pasta pertence a outro repositorio Git. Use uma pasta/clonagem propria do painel.' }
    if ($fresh -and (Test-Path -LiteralPath (Join-Path $Directory '.git'))) { throw ('Git nao conseguiu abrir o repositorio existente: ' + $existing.Text) }
    if ($fresh) { Invoke-Checked -File $Git -Arguments @('init','-b','main') -Directory $Directory }
    $origin = Invoke-Captured -File $Git -Arguments @('remote','get-url','origin') -Directory $Directory
    if ($origin.Code -ne 0) { Invoke-Checked -File $Git -Arguments @('remote','add','origin',$Remote) -Directory $Directory }
    elseif ($origin.Text.Trim().TrimEnd('/') -ne $Remote.TrimEnd('/')) {
        if ($Remote -eq 'https://github.com/britointeb/scdp-colog-om.git' -and $origin.Text.Trim() -in @('https://github.com/britointeb/scdp-colog-om','git@github.com:britointeb/scdp-colog-om.git')) { Invoke-Checked -File $Git -Arguments @('remote','set-url','origin',$Remote) -Directory $Directory }
        else { throw 'O origin aponta para outro repositorio. Nenhum envio foi feito.' }
    }
    $branch = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('branch','--show-current')
    if ($branch -ne 'main') { throw 'Execute este BAT na branch main; a branch atual foi preservada.' }
    foreach ($state in @('MERGE_HEAD','rebase-merge','rebase-apply','CHERRY_PICK_HEAD')) {
        $gitPath = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('rev-parse','--git-path',$state)
        if (-not [IO.Path]::IsPathRooted($gitPath)) { $gitPath = Join-Path $Directory $gitPath }
        if (Test-Path -LiteralPath $gitPath) { throw 'Ha uma operacao Git pendente. Conclua-a antes de publicar.' }
    }
    Invoke-Checked -File $Git -Arguments @('config','--local','user.name','britointeb') -Directory $Directory
    Invoke-Checked -File $Git -Arguments @('config','--local','user.email','britointeb@gmail.com') -Directory $Directory
    Invoke-Checked -File $Git -Arguments @('fetch','origin','--prune') -Directory $Directory
    $remoteHead = Invoke-Captured -File $Git -Arguments @('show-ref','--verify','--quiet','refs/remotes/origin/main') -Directory $Directory
    if ($fresh -and $remoteHead.Code -eq 0) {
        # Only on a newly created repository: adopt remote history without overwriting local files.
        Invoke-Checked -File $Git -Arguments @('reset','--mixed','origin/main') -Directory $Directory
        $missing = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('-c','core.quotepath=false','ls-files','--deleted')
        foreach ($file in ($missing -split "`n" | Where-Object { $_ })) {
            if (Test-PublishablePath $file) { Invoke-Checked -File $Git -Arguments @('restore','--source=origin/main','--worktree','--',$file) -Directory $Directory }
        }
    }
}

function Assert-PublishableIndex {
    param([string]$Git, [string]$Directory)
    $tracked = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('-c','core.quotepath=false','ls-files')
    $blocked = @($tracked -split "`n" | Where-Object { $_ -and -not (Test-PublishablePath $_) })
    if ($blocked.Count) { throw ('Arquivos fora do codigo ja estao no indice Git. Retire-os do versionamento antes de publicar: ' + ($blocked -join ', ')) }
}

function Stage-ScdpCode {
    param([string]$Git, [string]$Directory)
    Assert-PublishableIndex -Git $Git -Directory $Directory
    $candidates = @('.gitignore','.gitattributes','.env.example','README.md','GUIA_GIT.md','THIRD_PARTY_NOTICES.md','LICENSE','LICENSE.md','INICIAR_DASH.bat','PUBLICAR_SCDP.bat','app.jsx','index.html','dev.html','painel.css','tema.css','styles.css','package.json','pnpm-lock.yaml','vite.config.js','scdp.local.example.json','assets/colog.png','public/dados/.gitkeep','public/dados/tesgen.csv','public/dados/bilhetes.csv','public/dados/teto_orcamentario.csv','public/dados/manifesto.json','geografia/cidades.json','geografia/mundo.json','geografia/LEIA_ME.md','componentes','paginas','servicos','scripts','tests','.github')
    $paths = @($candidates | Where-Object { Test-Path -LiteralPath (Join-Path $Directory $_) })
    $deleted = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('-c','core.quotepath=false','ls-files','--deleted')
    $paths += @($deleted -split "`n" | Where-Object { $_ -and (Test-PublishablePath $_) })
    Invoke-Checked -File $Git -Arguments (@('add','--all','--') + @($paths | Select-Object -Unique)) -Directory $Directory
    Assert-PublishableIndex -Git $Git -Directory $Directory
    $modelIgnored = Invoke-Captured -File $Git -Arguments @('check-ignore','--no-index','--quiet','servicos/dados.js') -Directory $Directory
    if ($modelIgnored.Code -ne 1) { throw 'O .gitignore esta excluindo um arquivo essencial: servicos/dados.js.' }
    $changes = Invoke-Captured -File $Git -Arguments @('diff','--cached','--quiet') -Directory $Directory
    if ($changes.Code -eq 1) {
        Invoke-Checked -File $Git -Arguments @('diff','--cached','--stat') -Directory $Directory
        Invoke-Checked -File $Git -Arguments @('commit','-m',('Atualiza painel SCDP - ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))) -Directory $Directory
    } elseif ($changes.Code -ne 0) { throw 'Nao foi possivel conferir as alteracoes preparadas.' }
}

function Assert-OutgoingHistory {
    param([string]$Git, [string]$Directory)
    $range = 'HEAD'
    $remoteHead = Invoke-Captured -File $Git -Arguments @('show-ref','--verify','--quiet','refs/remotes/origin/main') -Directory $Directory
    if ($remoteHead.Code -eq 0) { $range = 'origin/main..HEAD' }
    $names = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('-c','core.quotepath=false','log','--format=','--name-only','--diff-filter=ACMR',$range)
    $blocked = @($names -split "`n" | Where-Object { $_ -and -not (Test-PublishablePath $_) } | Select-Object -Unique)
    if ($blocked.Count) { throw ('O historico ainda nao enviado contem arquivos fora do codigo: ' + ($blocked -join ', ') + '. O envio foi interrompido para preservar os dados.') }
}

function Merge-ScdpRemote {
    param([string]$Git, [string]$Directory)
    $remoteHead = Invoke-Captured -File $Git -Arguments @('show-ref','--verify','--quiet','refs/remotes/origin/main') -Directory $Directory
    if ($remoteHead.Code -ne 0) { return $false }
    $before = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('rev-parse','HEAD')
    $merge = Invoke-Captured -File $Git -Arguments @('merge','--no-edit','origin/main') -Directory $Directory -Show
    if ($merge.Code -ne 0) {
        $pending = Invoke-Captured -File $Git -Arguments @('rev-parse','--verify','MERGE_HEAD') -Directory $Directory
        if ($pending.Code -eq 0) { Invoke-Checked -File $Git -Arguments @('merge','--abort') -Directory $Directory }
        throw 'As versoes local e remota exigem conciliacao. O commit local foi preservado; nenhum push foi executado.'
    }
    $after = Assert-GitOk -Git $Git -Directory $Directory -Arguments @('rev-parse','HEAD')
    return $before -ne $after
}

function Prepare-ScdpProject {
    param([string]$Pnpm, [string]$Directory)
    $store = if ($script:ToolsRoot) { Join-Path $script:ToolsRoot 'pnpm-store' } else { Join-Path $env:LOCALAPPDATA 'SCDP-Tools\pnpm-store' }
    # Mantenha o mesmo store e o modo automatico ate o fim. pnpm run/test
    # pode iniciar outra instalacao ao validar dependencias com outro store.
    $settings = @{
        CI = 'true'
        PNPM_CONFIG_STORE_DIR = $store
        PNPM_CONFIG_CONFIRM_MODULES_PURGE = 'false'
        PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
        PNPM_CONFIG_UPDATE_NOTIFIER = 'false'
    }
    $previous = @{}
    foreach ($key in $settings.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    try {
        Write-Host 'Instalando as dependencias do painel...'
        Invoke-Checked -File $Pnpm -Arguments @('install','--frozen-lockfile','--ignore-scripts','--store-dir',$store,'--package-import-method','copy','--reporter','append-only') -Directory $Directory
        Write-Host 'Executando os testes...'
        Invoke-Checked -File $Pnpm -Arguments @('test') -Directory $Directory
        Write-Host 'Atualizando as bases e compilando o painel...'
        Invoke-Checked -File $Pnpm -Arguments @('run','preparar') -Directory $Directory
    } finally {
        foreach ($key in $settings.Keys) {
            if ($null -eq $previous[$key]) {
                Remove-Item -LiteralPath ('Env:\' + $key) -ErrorAction SilentlyContinue
            } else {
                [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
            }
        }
    }
}

function Invoke-ScdpMain {
    $remote = 'https://github.com/britointeb/scdp-colog-om.git'
    $batch = [IO.Path]::GetFullPath($env:SCDP_BATCH_FILE)
    $base = Split-Path -Parent $batch
    if ($env:SCDP_BATCH_ARG -eq '--ajuda') {
        Write-Host 'PUBLICAR_SCDP.bat - britointeb/scdp-colog-om'
        Write-Host 'Execute na pasta DASH_SCDP para enviar o codigo. Em outra pasta, o BAT baixa o repositorio para scdp-colog-om.'
        Write-Host 'Verifica/prepara Git, GitHub CLI, Node.js e pnpm na pasta do usuario, instala dependencias, testa, compila e publica.'
        Write-Host 'Requer Windows 10/11 x64 ou ARM64, internet e login na conta britointeb. Bases e backups nao sao publicados.'
        return
    }
    if ($env:SCDP_BATCH_ARG) { throw 'Argumento desconhecido. Use sem argumentos ou --ajuda.' }
    Write-Host '=== SCDP | Preparar computador e publicar codigo ===' -ForegroundColor Cyan
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA indisponivel neste Windows.' }
    $script:ToolsRoot = Join-Path $env:LOCALAPPDATA 'SCDP-Tools'
    New-Item -ItemType Directory -Path $script:ToolsRoot -Force | Out-Null
    $tools = Get-ScdpTools
    Ensure-GithubLogin -Gh $tools['gh']
    $project = $null
    foreach ($candidate in @($base,(Join-Path $base 'DASH_SCDP'),(Join-Path $base 'scdp-colog-om'))) {
        if (Test-ScdpProject -Directory $candidate) { $project = [IO.Path]::GetFullPath($candidate); break }
    }
    if (-not $project) {
        $project = Join-Path $base 'scdp-colog-om'
        if (Test-Path -LiteralPath $project) { throw 'A subpasta scdp-colog-om existe, mas nao contem o painel esperado. Coloque o BAT na pasta correta.' }
        Invoke-Checked -File $tools['git'] -Arguments @('clone',$remote,$project) -Directory $base
        if (-not (Test-ScdpProject -Directory $project)) { throw 'O repositorio ainda nao contem o painel. No primeiro computador, coloque este BAT dentro da pasta DASH_SCDP e execute novamente.' }
    }
    $targetBat = Join-Path $project 'PUBLICAR_SCDP.bat'
    if ([IO.Path]::GetFullPath($batch) -ne [IO.Path]::GetFullPath($targetBat)) { Copy-Item -LiteralPath $batch -Destination $targetBat -Force }
    Protect-ScdpFiles -Directory $project
    Write-Host 'Preparando o repositorio Git...'
    Initialize-ScdpRepository -Git $tools['git'] -Directory $project -Remote $remote
    Assert-PublishableIndex -Git $tools['git'] -Directory $project
    $runtime = Get-ScdpTools -Runtime
    Write-Host "Projeto: $project"
    Prepare-ScdpProject -Pnpm $runtime['pnpm'] -Directory $project
    Stage-ScdpCode -Git $tools['git'] -Directory $project
    $merged = Merge-ScdpRemote -Git $tools['git'] -Directory $project
    if ($merged) { Prepare-ScdpProject -Pnpm $runtime['pnpm'] -Directory $project }
    Assert-PublishableIndex -Git $tools['git'] -Directory $project
    Assert-OutgoingHistory -Git $tools['git'] -Directory $project
    Write-Host 'Enviando os arquivos para o GitHub...'
    Invoke-Checked -File $tools['git'] -Arguments @('push','-u','origin','HEAD:main') -Directory $project
    Write-Host 'Concluido: https://github.com/britointeb/scdp-colog-om' -ForegroundColor Green
    Write-Host "Painel local: $(Join-Path $project 'index.html')"
    Write-Host 'As tres bases consolidadas foram publicadas. Backups e configuracoes locais permanecem no computador.'
}

try { Invoke-ScdpMain; exit 0 }
catch { Write-Host ''; Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red; Write-Host 'Corrija a causa informada e execute este mesmo BAT novamente.'; exit 1 }
