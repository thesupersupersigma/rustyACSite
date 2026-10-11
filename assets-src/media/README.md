# rustyAC media for the website

Made with rustyAC v0.23.1 (the code of that tag: `rustyac.exe` and the `site_clips` example), with rustyAC's own renderer and Assetto Corsa's own sound banks through the player's FMOD DLLs. The pictures show Assetto Corsa content (cars, tracks) and the clips are Assetto Corsa's sounds: check before publishing what may be shown.

How it was made, what was found in the sound banks and what is missing: `docs/site_media.md` in the rustyAC repo. To make everything again, from the rustyAC folder: `sh tools/site_media/shots.sh`, `sh tools/site_media/audio.sh`, `python tools/site_media/post.py re/scratch/site_media/raw <this folder>/audio <version>`.

## screenshots/

All PNG, drawn at twice the size (8 samples per pixel) and averaged down. Every command starts with `target\release\rustyac.exe`.

### renderer_core_spa.png

2560x1440, 5.8 MB. F2004 at Spa, 12 s into the automatic drive, AC's renderer.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --autodrive --at 12 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --screenshot renderer_core_spa.png
```

### renderer_core_spa_debug.png

2560x1440, 4.7 MB. the same frame, debug view.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --autodrive --at 12 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --debug-view --screenshot renderer_core_spa_debug.png
```

### renderer_core_monza.png

2560x1440, 6.2 MB. BMW 1M at Monza, 12 s, AC's renderer.

```
rustyac.exe --car bmw_1m --track monza --no-race-ini --autodrive --at 12 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --screenshot renderer_core_monza.png
```

### renderer_core_monza_debug.png

2560x1440, 5.4 MB. the same frame, debug view.

```
rustyac.exe --car bmw_1m --track monza --no-race-ini --autodrive --at 12 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --debug-view --screenshot renderer_core_monza_debug.png
```

### renderer_core_laguna_seca.png

2560x1440, 5.0 MB. BMW M3 E30 at Laguna Seca, 12 s, AC's renderer.

```
rustyac.exe --car bmw_m3_e30 --track ks_laguna_seca --no-race-ini --autodrive --at 12 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --screenshot renderer_core_laguna_seca.png
```

### renderer_core_laguna_seca_debug.png

2560x1440, 4.2 MB. the same frame, debug view.

```
rustyac.exe --car bmw_m3_e30 --track ks_laguna_seca --no-race-ini --autodrive --at 12 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --debug-view --screenshot renderer_core_laguna_seca_debug.png
```

### hero_burnout.png

2560x1440, 7.2 MB. F2004 burnout at Spa under the start gantry, 5 s in, from low at the front right.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --flat-out --flat-out-brake 0.6 --no-auto-clutch --at 5 --lead-in 5 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --free-camera 5,0.5,3/0,0.5,-1/50 --screenshot hero_burnout.png
```

### og_burnout.png

2400x1260, 6.3 MB. the same burnout for the share image: car and smoke on the left, the right third calm (track, wall, hillside).

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --flat-out --flat-out-brake 0.6 --no-auto-clutch --at 5 --lead-in 5 --width 2400 --height 1260 --graphics max --cube-size 2048 --aa 8 --motion-blur 0 --supersample 2 --no-hud --free-camera 5,0.5,3/-0.9,0.7,0.2/50 --screenshot og_burnout.png
```

### gallery_f2004_spa_chase.png

2560x1440, 5.7 MB. F2004 at 175 km/h at Spa, chase camera, motion blur 4.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --autodrive --at 21.6 --lead-in 1 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 4 --screenshot gallery_f2004_spa_chase.png
```

### gallery_f2004_spa_trackside.png

2560x1440, 6.6 MB. F2004 at 259 km/h past the Spa grandstand, from trackside.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --autodrive --at 19 --lead-in 1 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --free-camera 4,0.7,11/0,0.5,0/22 --screenshot gallery_f2004_spa_trackside.png
```

### gallery_f2004_cockpit.png

2560x1440, 4.8 MB. F2004 cockpit at Spa.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --autodrive --at 21.6 --lead-in 1 --camera cockpit --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --screenshot gallery_f2004_cockpit.png
```

### gallery_night_lights.png

2560x1440, 7.2 MB. BMW 1M at Spa after sunset (sun angle 86, as dark as plain AC gets), headlights on.

```
rustyac.exe --car bmw_1m --track spa --no-race-ini --sun 86 --show-lights --autodrive --at 12 --lead-in 1 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --free-camera -3.5,0.9,7/0,0.6,0/40 --screenshot gallery_night_lights.png
```

### gallery_heavy_clouds.png

2560x1440, 5.1 MB. F2004 at Spa under the 7_heavy_clouds weather.

```
rustyac.exe --car ks_ferrari_f2004 --track spa --no-race-ini --autodrive --at 30 --lead-in 1 --camera chase2 --weather 7_heavy_clouds --sun 30 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --screenshot gallery_heavy_clouds.png
```

### gallery_crash_damage.png

2560x1440, 5.9 MB. BMW 1M with crash damage drawn (scratches, bent panels).

```
rustyac.exe --car bmw_1m --track spa --no-race-ini --show-damage 70,65,80,75,80 --at 2 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --free-camera -3,1.0,5/0,0.6,0.5/40 --screenshot gallery_crash_damage.png
```

### gallery_f40_monza.png

2560x1440, 5.2 MB. Ferrari F40 at Monza.

```
rustyac.exe --car ferrari_f40 --track monza --no-race-ini --autodrive --at 12 --lead-in 1 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --free-camera -4,0.7,7/0,0.6,0/38 --screenshot gallery_f40_monza.png
```

### gallery_488_gt3_laguna_seca.png

2560x1440, 4.5 MB. Ferrari 488 GT3 at Laguna Seca.

```
rustyac.exe --car ks_ferrari_488_gt3 --track ks_laguna_seca --no-race-ini --autodrive --at 14 --lead-in 1 --width 2560 --height 1440 --graphics max --cube-size 2048 --aa 8 --supersample 2 --no-hud --motion-blur 0 --free-camera -4.5,0.9,8/0,0.6,0/35 --screenshot gallery_488_gt3_laguna_seca.png
```

## audio/

All WAV, 48 kHz, 16 bit, stereo. One gain for every clip (8.38 dB over the raw FMOD output at master level 0.12; the loudest clip, burnout_reference.wav, peaks at -1 dBFS): the levels between the clips are the game's. `manifest.json` has every clip's length, peak, loop points and FMOD events. A loop is the whole file (loop start 0, loop end = the number of samples): the last 0.5 s is crossfaded into what came before the cut, so the last sample runs into the first.

Each raw clip is one run of `target\release\examples\site_clips.exe` (`cargo build --release -p rustyac-game --example site_clips`), then `tools/site_media/post.py` cuts, loops and scales them.

### engine_on_idle.wav

7.75 s, peak -11.99 dBFS. loop, 4000 rpm, throttle 1.

```
site_clips steady --rpm 4000 --gas 1 --seconds 14 --volume 0.12 --out engine_on_idle.wav
```

### engine_off_idle.wav

7.75 s, peak -13.94 dBFS. loop, 4000 rpm, throttle 0.

```
site_clips steady --rpm 4000 --gas 0 --seconds 14 --volume 0.12 --out engine_off_idle.wav
```

### engine_on_4000.wav

7.75 s, peak -12.07 dBFS. loop, 4000 rpm, throttle 1.

```
site_clips steady --rpm 4000 --gas 1 --seconds 14 --volume 0.12 --out engine_on_4000.wav
```

### engine_off_4000.wav

7.75 s, peak -13.94 dBFS. loop, 4000 rpm, throttle 0.

```
site_clips steady --rpm 4000 --gas 0 --seconds 14 --volume 0.12 --out engine_off_4000.wav
```

### engine_on_7000.wav

7.80 s, peak -5.8 dBFS. loop, 7000 rpm, throttle 1.

```
site_clips steady --rpm 7000 --gas 1 --seconds 14 --volume 0.12 --out engine_on_7000.wav
```

### engine_off_7000.wav

7.76 s, peak -8.42 dBFS. loop, 7000 rpm, throttle 0.

```
site_clips steady --rpm 7000 --gas 0 --seconds 14 --volume 0.12 --out engine_off_7000.wav
```

### engine_on_10000.wav

8.03 s, peak -3.01 dBFS. loop, 10000 rpm, throttle 1.

```
site_clips steady --rpm 10000 --gas 1 --seconds 14 --volume 0.12 --out engine_on_10000.wav
```

### engine_off_10000.wav

7.99 s, peak -4.43 dBFS. loop, 10000 rpm, throttle 0.

```
site_clips steady --rpm 10000 --gas 0 --seconds 14 --volume 0.12 --out engine_off_10000.wav
```

### engine_on_13000.wav

8.22 s, peak -3.0 dBFS. loop, 13000 rpm, throttle 1.

```
site_clips steady --rpm 13000 --gas 1 --seconds 14 --volume 0.12 --out engine_on_13000.wav
```

### engine_off_13000.wav

7.78 s, peak -7.62 dBFS. loop, 13000 rpm, throttle 0.

```
site_clips steady --rpm 13000 --gas 0 --seconds 14 --volume 0.12 --out engine_off_13000.wav
```

### engine_on_16000.wav

8.25 s, peak -3.38 dBFS. loop, 16000 rpm, throttle 1.

```
site_clips steady --rpm 16000 --gas 1 --seconds 14 --volume 0.12 --out engine_on_16000.wav
```

### engine_off_16000.wav

7.76 s, peak -3.89 dBFS. loop, 16000 rpm, throttle 0.

```
site_clips steady --rpm 16000 --gas 0 --seconds 14 --volume 0.12 --out engine_off_16000.wav
```

### limiter.wav

7.75 s, peak -3.54 dBFS. loop, 18800 rpm, throttle 1.

```
site_clips drive --neutral --seconds 16 --volume 0.12 --out limiter.wav
```

### wheelspin.wav

7.83 s, peak -15.85 dBFS. loop.

```
site_clips steady --rpm 18500 --gas 1 --spin 110 --slip 1 --speed 5.56 --engine-level 0 --seconds 14 --volume 0.12 --out wheelspin.wav
```

### pit_wheelgun.wav

1.02 s, peak -18.83 dBFS. oneshot.

```
site_clips event --path event:/common/screw --seconds 6 --volume 0.12 --out pit_wheelgun.wav
```

### pit_wheelgun_off.wav

1.23 s, peak -20.83 dBFS. oneshot.

```
site_clips event --path event:/common/unscrew --seconds 6 --volume 0.12 --out pit_wheelgun_off.wav
```

### backfire_1.wav

0.48 s, peak -12.15 dBFS. oneshot.

```
site_clips event --path event:/cars/ks_ferrari_f2004/backfire_ext --param throttle=0 --at exhaust --base-volume 2.5 --seconds 4 --volume 0.12 --out backfire_1.wav
```

### burnout_reference.wav

32.10 s, peak -1.0 dBFS. oneshot.

```
site_clips drive --track spa --brake 0.6 --after-pop 2 --seconds 60 --volume 0.12 --out burnout_reference.wav
```
