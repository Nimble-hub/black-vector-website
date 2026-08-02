$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot ".source-assets"
$audioRoot = Join-Path $sourceRoot "audio"
$musicRoot = Join-Path $sourceRoot "music"
$publicAudio = Join-Path $projectRoot "public\audio"

$drop = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Cinematic Drop*"
$impact = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Clean Impact*"
$riser = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Epic Build Up*"
$stinger = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Long Build Up*"
$rumble = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Rumble*"
$machinery = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Machinery, Start Up, Take Off 01*"
$chargePulse = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Pulsing, Eerie, Creepy, Horror 02*"
$growlyImpact = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Big, Powerful, Growly, Reverberant*"
$metallicSub = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Metallic Impact, Heavily Distorted Sub 01*"
$score = Join-Path $musicRoot "BVRTS Soundtrack (2).wav"

foreach ($source in @($drop, $impact, $riser, $stinger, $rumble, $machinery, $chargePulse, $growlyImpact, $metallicSub)) {
  if ($null -eq $source -or -not (Test-Path -LiteralPath $source.FullName)) {
    throw "A required cinematic source is missing."
  }
}
if (-not (Test-Path -LiteralPath $score)) { throw "The selected score master is missing." }

New-Item -ItemType Directory -Force -Path $publicAudio | Out-Null

$jumpFilter = @"
[2:a]atrim=start=2.45:end=6.75,asetpts=PTS-STARTPTS,highpass=f=28,equalizer=f=90:t=q:w=0.9:g=2.2,equalizer=f=310:t=q:w=1.0:g=-2.4,equalizer=f=2600:t=q:w=0.8:g=2.8,acompressor=threshold=0.18:ratio=1.8:attack=24:release=180:makeup=1.15,afade=t=in:st=0:d=0.18,afade=t=out:st=4.12:d=0.18,volume=1.08[buildA];
[3:a]atrim=start=3.65:end=8.45,asetpts=PTS-STARTPTS,highpass=f=42,equalizer=f=210:t=q:w=1.1:g=-2.5,equalizer=f=1450:t=q:w=0.85:g=2.4,equalizer=f=5200:t=q:w=0.8:g=1.8,acompressor=threshold=0.2:ratio=1.7:attack=18:release=150:makeup=1.1,afade=t=in:st=0:d=0.28,afade=t=out:st=4.25:d=0.5,volume=0.72[buildB];
[1:a]atrim=start=0.47:end=6.7,asetpts=PTS-STARTPTS,highpass=f=22,equalizer=f=48:t=q:w=0.72:g=5.2,equalizer=f=92:t=q:w=0.85:g=3.2,equalizer=f=285:t=q:w=1.0:g=-2.8,equalizer=f=2300:t=q:w=0.8:g=3.4,equalizer=f=6200:t=q:w=0.72:g=2.0,volume=1.58,adelay=3500|3500[launchImpact];
[4:a]atrim=start=27:end=36.2,asetpts=PTS-STARTPTS,highpass=f=24,lowpass=f=4200,equalizer=f=46:t=q:w=0.75:g=4.5,equalizer=f=88:t=q:w=0.9:g=3.0,equalizer=f=245:t=q:w=1.0:g=-2.2,equalizer=f=1100:t=q:w=0.8:g=1.3,acompressor=threshold=0.14:ratio=2.35:attack=35:release=260:makeup=1.35,afade=t=in:st=0:d=0.16,afade=t=out:st=8.15:d=1.0,volume=1.34,adelay=4350|4350[travelRumble];
[0:a]atrim=start=0:end=7.25,asetpts=PTS-STARTPTS,highpass=f=22,equalizer=f=52:t=q:w=0.76:g=4.0,equalizer=f=120:t=q:w=0.9:g=2.0,equalizer=f=330:t=q:w=1.0:g=-2.4,equalizer=f=1900:t=q:w=0.85:g=2.2,afade=t=out:st=6.35:d=0.9,volume=1.12,adelay=12600|12600[exitDrop];
[5:a]atrim=start=22.074:end=35.17,asetpts=PTS-STARTPTS,highpass=f=38,lowpass=f=9200,equalizer=f=92:t=q:w=0.9:g=-2.8,equalizer=f=340:t=q:w=1.0:g=-1.8,equalizer=f=1650:t=q:w=0.85:g=2.0,equalizer=f=4700:t=q:w=0.8:g=1.8,acompressor=threshold=0.2:ratio=1.8:attack=22:release=180:makeup=1.08,afade=t=in:st=0:d=0.32,afade=t=out:st=12.25:d=0.82,volume=0.25[machineryMid];
[6:a]atrim=start=4.59:end=9.2,asetpts=PTS-STARTPTS,highpass=f=115,equalizer=f=320:t=q:w=1.0:g=-3.4,equalizer=f=2900:t=q:w=0.82:g=2.8,equalizer=f=7200:t=q:w=0.72:g=3.2,acompressor=threshold=0.22:ratio=1.65:attack=14:release=120:makeup=1.04,afade=t=in:st=0:d=0.2,afade=t=out:st=4.15:d=0.46,volume=0.27[chargeAir];
[7:a]atrim=start=0:end=5.7,asetpts=PTS-STARTPTS,highpass=f=24,lowpass=f=7600,equalizer=f=58:t=q:w=0.8:g=2.0,equalizer=f=180:t=q:w=1.0:g=-2.0,equalizer=f=2200:t=q:w=0.85:g=1.8,afade=t=out:st=4.8:d=0.9,volume=0.62,adelay=4199|4199[growlyHit];
[8:a]atrim=start=0:end=3.1,asetpts=PTS-STARTPTS,highpass=f=20,lowpass=f=340,equalizer=f=43:t=q:w=0.72:g=3.2,equalizer=f=88:t=q:w=0.85:g=1.6,equalizer=f=210:t=q:w=1.0:g=-2.5,afade=t=out:st=2.35:d=0.75,volume=0.46,adelay=3930|3930[metalSub];
[buildA][buildB][launchImpact][travelRumble][exitDrop][machineryMid][chargeAir][growlyHit][metalSub]amix=inputs=9:normalize=0:dropout_transition=0,highpass=f=20,equalizer=f=55:t=q:w=0.8:g=2.0,equalizer=f=125:t=q:w=0.9:g=1.0,equalizer=f=340:t=q:w=1.0:g=-2.0,equalizer=f=1800:t=q:w=0.8:g=1.0,equalizer=f=4800:t=q:w=0.75:g=1.3,acompressor=threshold=0.18:ratio=1.85:attack=18:release=180:makeup=1.05:knee=2.5,loudnorm=I=-12.5:TP=-1.0:LRA=8,atrim=end=20[master]
"@ -replace "`r?`n", ""

$jumpOutput = Join-Path $publicAudio "hyperspace-jump.mp3"
& ffmpeg -y `
  -i $drop.FullName `
  -i $impact.FullName `
  -i $riser.FullName `
  -i $stinger.FullName `
  -i $rumble.FullName `
  -i $machinery.FullName `
  -i $chargePulse.FullName `
  -i $growlyImpact.FullName `
  -i $metallicSub.FullName `
  -filter_complex $jumpFilter `
  -map "[master]" -ar 48000 -ac 2 -c:a libmp3lame -b:a 256k `
  -metadata title="Black Vector Hyperspace Theater Mix 04" `
  -metadata comment="Licensed source masters preserved locally" `
  $jumpOutput
if ($LASTEXITCODE -ne 0) { throw "Hyperspace soundtrack build failed." }

$scoreDuration = [double](& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- $score)
$crossfadeDuration = 6.0
$tailStart = $scoreDuration - $crossfadeDuration
$scoreFilter = @"
[0:a]asplit=3[bodySource][tailSource][headSource];
[bodySource]atrim=start=$crossfadeDuration`:end=$tailStart,asetpts=PTS-STARTPTS[body];
[tailSource]atrim=start=$tailStart`:end=$scoreDuration,asetpts=PTS-STARTPTS[tail];
[headSource]atrim=start=0:end=$crossfadeDuration,asetpts=PTS-STARTPTS[head];
[tail][head]acrossfade=d=$crossfadeDuration`:c1=qsin:c2=qsin[seam];
[body][seam]concat=n=2:v=0:a=1,highpass=f=27,equalizer=f=72:t=q:w=0.85:g=1.6,equalizer=f=285:t=q:w=1.0:g=-1.4,equalizer=f=2500:t=q:w=0.8:g=1.0,lowpass=f=17000,loudnorm=I=-15.0:TP=-2.0:LRA=7[scoreLoop]
"@ -replace "`r?`n", ""

$scoreOutput = Join-Path $publicAudio "black-vector-score-loop.mp3"
& ffmpeg -y -i $score -filter_complex $scoreFilter -map "[scoreLoop]" `
  -ar 48000 -ac 2 -c:a libmp3lame -b:a 224k `
  -metadata title="Black Vector Score Loop 02" `
  $scoreOutput
if ($LASTEXITCODE -ne 0) { throw "Score loop build failed." }

Write-Host "Built $jumpOutput"
Write-Host "Built $scoreOutput"
