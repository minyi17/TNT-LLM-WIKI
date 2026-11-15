[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$wikiRoot = Join-Path $root 'wiki'
$outputPath = Join-Path $root 'content.js'

if (-not (Test-Path -LiteralPath $wikiRoot -PathType Container)) {
    throw "Wiki directory not found: $wikiRoot"
}

$markdownFiles = Get-ChildItem -LiteralPath $wikiRoot -Recurse -File -Filter '*.md' |
    Where-Object { $_.BaseName -notin @('index', 'log') } |
    Sort-Object FullName

$pages = @(
    foreach ($file in $markdownFiles) {
        $relativePath = $file.FullName.Substring($wikiRoot.Length + 1).Replace('\', '/')
        $id = $relativePath.Substring(0, $relativePath.Length - 3)
        $markdown = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        $title = $file.BaseName
        $titleMatch = [regex]::Match($markdown, '(?m)^title:\s*(.+?)\s*$')
        if ($titleMatch.Success) {
            $title = $titleMatch.Groups[1].Value.Trim().Trim('"', "'")
        }

        [pscustomobject]@{
            id       = $id
            title    = $title
            category = ($id -split '/')[0]
            markdown = $markdown
        }
    }
)

$json = ConvertTo-Json -InputObject $pages -Depth 4 -Compress
$generated = "// Generated from Wiki Markdown by build-site.ps1. Do not edit by hand.`nwindow.WIKI_PAGES = $json;`n"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $generated, $utf8WithoutBom)

Write-Output "Generated $($pages.Count) pages into content.js"
