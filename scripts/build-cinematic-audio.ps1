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
$travelEngine = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Engine, Gritty Swirl*"
$growlyRiser = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Musical, Electronic, Growly, Intense 01*"
$electronicRiser = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Musical, Electronic, Intense 01*"
$bigHit = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Boom, Big Hit 01*"
$deepGrowl = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Deep, Growl, Frightening 01*"
$muffledGrowl = Get-ChildItem -LiteralPath $audioRoot -File | Where-Object Name -Like "*Deep, Growl, Frightening, Muffled*"
$score = Join-Path $musicRoot "BVRTS Soundtrack (2).wav"

foreach ($source in @($drop, $impact, $riser, $stinger, $rumble, $machinery, $chargePulse, $growlyImpact, $metallicSub, $travelEngine, $growlyRiser, $electronicRiser, $bigHit, $deepGrowl, $muffledGrowl)) {
  if ($null -eq $source -or -not (Test-Path -LiteralPath $source.FullName)) {
    throw "A required cinematic source is missing."
  }
}
if (-not (Test-Path -LiteralPath $score)) { throw "The selected score master is missing." }

New-Item -ItemType Directory -Force -Path $publicAudio | Out-Null

$jumpFilter = @"
[2:a]atrim=start=5.03:end=6.64,asetpts=PTS-STARTPTS,highpass=f=28,equalizer=f=90:t=q:w=0.9:g=2.2,equalizer=f=310:t=q:w=1.0:g=-2.4,equalizer=f=2600:t=q:w=0.8:g=2.8,acompressor=threshold=0.18:ratio=1.8:attack=24:release=180:makeup=1.15,afade=t=in:st=0:d=0.14,afade=t=out:st=1.49:d=0.12,volume=1.08,adelay=4050|4050[buildA];
[3:a]atrim=start=7.00:end=8.34,asetpts=PTS-STARTPTS,highpass=f=42,equalizer=f=210:t=q:w=1.1:g=-2.5,equalizer=f=1450:t=q:w=0.85:g=2.4,equalizer=f=5200:t=q:w=0.8:g=1.8,acompressor=threshold=0.2:ratio=1.7:attack=18:release=150:makeup=1.1,afade=t=in:st=0:d=0.16,afade=t=out:st=1.22:d=0.12,volume=0.72,adelay=4320|4320[buildB];
[1:a]asplit=2[launchImpactSource][launchPunchSource];
[launchImpactSource]atrim=start=0.47:end=6.7,asetpts=PTS-STARTPTS,highpass=f=22,volume=0.25,equalizer=f=48:t=q:w=0.72:g=7.0,equalizer=f=92:t=q:w=0.85:g=4.6,equalizer=f=285:t=q:w=1.0:g=-3.2,equalizer=f=2300:t=q:w=0.8:g=5.0,equalizer=f=6200:t=q:w=0.72:g=2.8,acompressor=threshold=0.18:ratio=1.55:attack=18:release=210:makeup=1.16,afade=t=out:st=1.10:d=1.60,volume=7.2,adelay=5765|5765[launchImpact];
[launchPunchSource]atrim=start=0.47:end=2.35,asetpts=PTS-STARTPTS,highpass=f=24,lowpass=f=240,volume=0.25,equalizer=f=43:t=q:w=0.7:g=7.8,equalizer=f=78:t=q:w=0.82:g=6.2,equalizer=f=138:t=q:w=0.9:g=3.8,acompressor=threshold=0.11:ratio=2.8:attack=19:release=220:makeup=1.3,afade=t=out:st=0.72:d=0.96,volume=4.5,adelay=5765|5765[launchPunch];
[4:a]atrim=start=27:end=36.2,asetpts=PTS-STARTPTS,highpass=f=24,lowpass=f=4200,equalizer=f=46:t=q:w=0.75:g=3.2,equalizer=f=88:t=q:w=0.9:g=1.8,equalizer=f=245:t=q:w=1.0:g=-3.4,equalizer=f=1100:t=q:w=0.8:g=0.8,acompressor=threshold=0.14:ratio=2.35:attack=35:release=260:makeup=1.18,afade=t=in:st=0:d=0.16,afade=t=out:st=8.15:d=1.0,volume=0.48,adelay=5850|5850[travelRumble];
[0:a]atrim=start=0:end=7.25,asetpts=PTS-STARTPTS,highpass=f=22,equalizer=f=52:t=q:w=0.76:g=4.0,equalizer=f=120:t=q:w=0.9:g=2.0,equalizer=f=330:t=q:w=1.0:g=-2.4,equalizer=f=1900:t=q:w=0.85:g=2.2,afade=t=out:st=6.35:d=0.9,volume=1.12,adelay=13850|13850[exitDrop];
[5:a]atrim=start=22.074:end=24.164,asetpts=PTS-STARTPTS,highpass=f=38,lowpass=f=9200,equalizer=f=92:t=q:w=0.9:g=-2.8,equalizer=f=340:t=q:w=1.0:g=-1.8,equalizer=f=1650:t=q:w=0.85:g=2.0,equalizer=f=4700:t=q:w=0.8:g=1.8,acompressor=threshold=0.2:ratio=1.8:attack=22:release=180:makeup=1.08,afade=t=in:st=0:d=0.18,afade=t=out:st=1.94:d=0.15,volume=0.38,adelay=3570|3570[machineryMid];
[6:a]asplit=2[chargeAirSource][exitCrystalSource];
[chargeAirSource]atrim=start=6.99:end=8.74,asetpts=PTS-STARTPTS,highpass=f=115,equalizer=f=320:t=q:w=1.0:g=-3.4,equalizer=f=2900:t=q:w=0.82:g=2.8,equalizer=f=7200:t=q:w=0.72:g=3.2,acompressor=threshold=0.22:ratio=1.65:attack=14:release=120:makeup=1.04,afade=t=in:st=0:d=0.16,afade=t=out:st=1.60:d=0.15,volume=0.30,adelay=3900|3900[chargeAir];
[7:a]atrim=start=0:end=5.7,asetpts=PTS-STARTPTS,highpass=f=24,lowpass=f=7600,equalizer=f=58:t=q:w=0.8:g=2.0,equalizer=f=180:t=q:w=1.0:g=-2.0,equalizer=f=2200:t=q:w=0.85:g=1.8,afade=t=out:st=1.40:d=1.80,volume=0.55,adelay=5790|5790[growlyHit];
[8:a]atrim=start=0:end=3.1,asetpts=PTS-STARTPTS,highpass=f=20,lowpass=f=340,equalizer=f=43:t=q:w=0.72:g=3.2,equalizer=f=88:t=q:w=0.85:g=1.6,equalizer=f=210:t=q:w=1.0:g=-2.5,afade=t=out:st=0.85:d=1.45,volume=0.42,adelay=5760|5760[metalSub];
[9:a]asplit=3[travelEngineSource][travelEngineSubSource][travelEnginePresenceSource];
[travelEngineSource]atrim=start=0.8:end=10.15,asetpts=PTS-STARTPTS,asetrate=84480,aresample=96000,atempo=1.136364,highpass=f=26,lowpass=f=7000,equalizer=f=55:t=q:w=0.82:g=3.4,equalizer=f=128:t=q:w=0.92:g=4.2,equalizer=f=460:t=q:w=0.9:g=1.6,equalizer=f=2120:t=q:w=0.82:g=1.6,acompressor=threshold=0.18:ratio=1.7:attack=38:release=240:makeup=1.18,afade=t=in:st=0:d=0.28,afade=t=out:st=8.30:d=1.05,volume=3.48,adelay=5880|5880[travelEngine];
[travelEngineSubSource]atrim=start=0.8:end=10.15,asetpts=PTS-STARTPTS,asetrate=84480,aresample=96000,atempo=1.136364,highpass=f=24,lowpass=f=195,equalizer=f=42:t=q:w=0.76:g=5.0,equalizer=f=72:t=q:w=0.86:g=4.4,equalizer=f=132:t=q:w=0.95:g=2.4,acompressor=threshold=0.14:ratio=1.9:attack=42:release=280:makeup=1.22,afade=t=in:st=0:d=0.34,afade=t=out:st=8.20:d=1.15,volume=1.71,adelay=5880|5880[travelEngineSub];
[travelEnginePresenceSource]atrim=start=0.8:end=10.15,asetpts=PTS-STARTPTS,asetrate=84480,aresample=96000,atempo=1.136364,highpass=f=92,lowpass=f=1500,equalizer=f=128:t=q:w=0.88:g=6.2,equalizer=f=280:t=q:w=0.9:g=4.7,equalizer=f=630:t=q:w=0.86:g=3.2,acompressor=threshold=0.12:ratio=1.35:attack=45:release=190:makeup=1.15,afade=t=in:st=0:d=0.25,afade=t=out:st=8.25:d=1.10,volume=3.00,adelay=5880|5880[travelEnginePresence];
[10:a]atrim=start=16.0:end=25.30,asetpts=PTS-STARTPTS,atempo=1.645,highpass=f=28,lowpass=f=11000,equalizer=f=58:t=q:w=0.78:g=3.2,equalizer=f=112:t=q:w=0.9:g=2.4,equalizer=f=330:t=q:w=1.0:g=-1.8,equalizer=f=1750:t=q:w=0.85:g=2.6,equalizer=f=5600:t=q:w=0.8:g=1.8,acompressor=threshold=0.16:ratio=1.65:attack=26:release=185:makeup=1.15,afade=t=in:st=0:d=0.22,afade=t=out:st=5.50:d=0.15,volume=0.62[growlyBuild];
[11:a]asplit=2[electronicBuildSource][exitSuctionSource];
[electronicBuildSource]atrim=start=8.27:end=14.77,asetpts=PTS-STARTPTS,atempo=2.0,highpass=f=72,lowpass=f=12000,equalizer=f=180:t=q:w=0.9:g=-2.4,equalizer=f=920:t=q:w=0.9:g=1.8,equalizer=f=3300:t=q:w=0.8:g=2.6,equalizer=f=7800:t=q:w=0.75:g=2.2,acompressor=threshold=0.2:ratio=1.7:attack=16:release=135:makeup=1.08,afade=t=in:st=0:d=0.2,afade=t=out:st=3.09:d=0.16,volume=0.44,adelay=2400|2400[electronicBuild];
[exitSuctionSource]atrim=start=7.45:end=10.45,asetpts=PTS-STARTPTS,areverse,atempo=1.24,highpass=f=52,lowpass=f=10500,equalizer=f=88:t=q:w=0.8:g=2.6,equalizer=f=420:t=q:w=1.0:g=-2.8,equalizer=f=1850:t=q:w=0.82:g=3.4,equalizer=f=6200:t=q:w=0.75:g=2.8,acompressor=threshold=0.18:ratio=1.55:attack=22:release=170:makeup=1.12,afade=t=in:st=0:d=0.10,afade=t=out:st=2.16:d=0.26,volume=0.62,adelay=12860|12860[exitSuction];
[exitCrystalSource]atrim=start=4.86:end=8.86,asetpts=PTS-STARTPTS,areverse,highpass=f=1450,lowpass=f=13800,equalizer=f=2600:t=q:w=0.9:g=2.8,equalizer=f=5200:t=q:w=0.76:g=5.4,equalizer=f=8700:t=q:w=0.72:g=4.2,acompressor=threshold=0.15:ratio=1.45:attack=8:release=150:makeup=1.16,tremolo=f=11.5:d=0.34,aecho=0.8:0.24:47|79:0.28|0.18,afade=t=in:st=0:d=0.16,afade=t=out:st=3.52:d=0.48,volume=0.38,adelay=13420|13420[exitCrystal];
[12:a]asplit=2[newAttackBodySource][newAttackCrackSource];
[newAttackBodySource]atrim=start=0:end=3.6,asetpts=PTS-STARTPTS,highpass=f=58,lowpass=f=12500,volume=0.20,equalizer=f=82:t=q:w=0.82:g=3.8,equalizer=f=230:t=q:w=1.0:g=-3.0,equalizer=f=1850:t=q:w=0.82:g=5.2,equalizer=f=4600:t=q:w=0.75:g=3.8,acompressor=threshold=0.13:ratio=2.2:attack=18:release=175:makeup=1.08,afade=t=out:st=1.25:d=1.55,volume=3.45,adelay=5775|5775[newAttack];
[newAttackCrackSource]atrim=start=0:end=0.42,asetpts=PTS-STARTPTS,highpass=f=260,lowpass=f=9200,volume=0.20,equalizer=f=1450:t=q:w=0.84:g=4.8,equalizer=f=3200:t=q:w=0.76:g=6.4,equalizer=f=6100:t=q:w=0.70:g=4.2,acompressor=threshold=0.11:ratio=2.8:attack=24:release=95:makeup=1.02,afade=t=out:st=0.10:d=0.28,volume=3.0,adelay=5770|5770[newCrack];
[13:a]atrim=start=0:end=4.9,asetpts=PTS-STARTPTS,highpass=f=22,lowpass=f=6800,volume=0.22,equalizer=f=46:t=q:w=0.74:g=5.2,equalizer=f=86:t=q:w=0.86:g=4.0,equalizer=f=285:t=q:w=1.0:g=-3.8,equalizer=f=980:t=q:w=0.84:g=3.2,equalizer=f=2450:t=q:w=0.82:g=2.0,acompressor=threshold=0.14:ratio=2.0:attack=12:release=235:makeup=1.12,afade=t=out:st=1.50:d=2.20,volume=2.85,adelay=5775|5775[newGrowl];
[14:a]atrim=start=0.10:end=5.8,asetpts=PTS-STARTPTS,highpass=f=20,lowpass=f=540,volume=0.22,equalizer=f=38:t=q:w=0.72:g=6.2,equalizer=f=66:t=q:w=0.84:g=5.0,equalizer=f=145:t=q:w=0.92:g=2.6,equalizer=f=285:t=q:w=1.0:g=-3.8,acompressor=threshold=0.12:ratio=2.4:attack=24:release=285:makeup=1.14,afade=t=out:st=1.65:d=2.55,volume=2.55,adelay=5755|5755[newPressure];
[growlyBuild][electronicBuild][machineryMid][chargeAir][buildA][buildB][launchImpact][launchPunch][growlyHit][metalSub][newAttack][newCrack][newGrowl][newPressure][travelRumble][travelEngine][travelEngineSub][travelEnginePresence][exitSuction][exitCrystal][exitDrop]amix=inputs=21:normalize=0:dropout_transition=0,highpass=f=20,equalizer=f=55:t=q:w=0.8:g=2.0,equalizer=f=125:t=q:w=0.9:g=1.0,equalizer=f=340:t=q:w=1.0:g=-2.0,equalizer=f=1800:t=q:w=0.8:g=1.0,equalizer=f=4800:t=q:w=0.75:g=1.3,acompressor=threshold=0.26:ratio=1.25:attack=32:release=260:makeup=1.0:knee=3.5,loudnorm=I=-12.5:TP=-1.0:LRA=8,atrim=end=21.3[master]
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
  -i $travelEngine.FullName `
  -i $growlyRiser.FullName `
  -i $electronicRiser.FullName `
  -i $bigHit.FullName `
  -i $deepGrowl.FullName `
  -i $muffledGrowl.FullName `
  -filter_complex $jumpFilter `
  -map "[master]" -ar 48000 -ac 2 -c:a libmp3lame -b:a 256k `
  -metadata title="Black Vector Hyperspace Theater Mix 18" `
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
