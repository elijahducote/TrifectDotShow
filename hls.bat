@echo off
setlocal EnableDelayedExpansion
REM ===============================================================================
REM HLS Adaptive Bitrate Encoding Script for Windows
REM Generates multi-resolution HLS streams with master playlist and thumbnail sprite
REM Handles videos with or without audio tracks
REM Requires: ffmpeg and ffprobe in PATH
REM ===============================================================================

REM Default values
set "INPUT="
set "OUTPUT_DIR=.\assets\hls"
set "SEGMENT_DURATION=4"
set "GENERATE_THUMBNAILS=1"
set "THUMB_WIDTH=160"
set "THUMB_HEIGHT=90"
set "THUMB_COLS=10"

REM Parse command line arguments
:parse_args
if "%~1"=="" goto :validate_input
if /i "%~1"=="-i" (
    set "INPUT=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="--input" (
    set "INPUT=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="-o" (
    set "OUTPUT_DIR=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="--output" (
    set "OUTPUT_DIR=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="-s" (
    set "SEGMENT_DURATION=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="--segment" (
    set "SEGMENT_DURATION=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="-t" (
    set "GENERATE_THUMBNAILS=0"
    shift
    goto :parse_args
)
if /i "%~1"=="--no-thumbnails" (
    set "GENERATE_THUMBNAILS=0"
    shift
    goto :parse_args
)
if /i "%~1"=="-h" goto :usage
if /i "%~1"=="--help" goto :usage
echo [ERROR] Unknown option: %~1
goto :usage

:usage
echo.
echo Usage: %~nx0 -i ^<input_file^> [-o ^<output_dir^>] [-s ^<segment_duration^>] [-t]
echo.
echo Options:
echo     -i, --input         Input video file (required)
echo     -o, --output        Output directory (default: .\assets\hls)
echo     -s, --segment       Segment duration in seconds (default: 10)
echo     -t, --no-thumbnails Disable thumbnail generation
echo     -h, --help          Show this help message
echo.
echo Example:
echo     %~nx0 -i source_video.mp4 -o .\output\hls -s 10
exit /b 1

:validate_input
if "%INPUT%"=="" (
    echo [ERROR] Input file is required
    goto :usage
)
if not exist "%INPUT%" (
    echo [ERROR] Input file does not exist: %INPUT%
    exit /b 1
)

REM Create output directories
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%OUTPUT_DIR%\thumbnails" mkdir "%OUTPUT_DIR%\thumbnails"

echo [INFO] Starting HLS encoding...
echo [INFO] Input: %INPUT%
echo [INFO] Output: %OUTPUT_DIR%
echo [INFO] Segment Duration: %SEGMENT_DURATION%s

REM ===============================================================================
REM Probe source video for metadata preservation
REM ===============================================================================
echo [INFO] Analyzing source video...

REM Get source framerate
for /f "delims=" %%a in ('ffprobe -v error -select_streams v:0 -show_entries stream^=r_frame_rate -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_FRAMERATE_RAW=%%a"
REM Parse fraction (e.g., 30000/1001)
for /f "tokens=1,2 delims=/" %%a in ("%SRC_FRAMERATE_RAW%") do (
    set /a "FR_NUM=%%a"
    set /a "FR_DEN=%%b" 2>nul
    if "%%b"=="" set "FR_DEN=1"
)
if %FR_DEN% EQU 0 set "FR_DEN=1"
set /a "SRC_FRAMERATE=FR_NUM/FR_DEN"

REM Get color properties with defaults
for /f "delims=" %%a in ('ffprobe -v error -select_streams v:0 -show_entries stream^=color_space -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_COLOR_SPACE=%%a"
if "%SRC_COLOR_SPACE%"=="" set "SRC_COLOR_SPACE=bt709"
if "%SRC_COLOR_SPACE%"=="unknown" set "SRC_COLOR_SPACE=bt709"

for /f "delims=" %%a in ('ffprobe -v error -select_streams v:0 -show_entries stream^=color_primaries -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_COLOR_PRIMARIES=%%a"
if "%SRC_COLOR_PRIMARIES%"=="" set "SRC_COLOR_PRIMARIES=bt709"
if "%SRC_COLOR_PRIMARIES%"=="unknown" set "SRC_COLOR_PRIMARIES=bt709"

for /f "delims=" %%a in ('ffprobe -v error -select_streams v:0 -show_entries stream^=color_transfer -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_COLOR_TRC=%%a"
if "%SRC_COLOR_TRC%"=="" set "SRC_COLOR_TRC=bt709"
if "%SRC_COLOR_TRC%"=="unknown" set "SRC_COLOR_TRC=bt709"

for /f "delims=" %%a in ('ffprobe -v error -select_streams v:0 -show_entries stream^=pix_fmt -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_PIX_FMT=%%a"
if "%SRC_PIX_FMT%"=="" set "SRC_PIX_FMT=yuv420p"
if "%SRC_PIX_FMT%"=="unknown" set "SRC_PIX_FMT=yuv420p"

REM Check if audio stream exists
set "HAS_AUDIO=0"
set "AUDIO_COUNT=0"
for /f %%a in ('ffprobe -v error -select_streams a -show_entries stream^=index -of csv^=p^=0 "%INPUT%" 2^>nul ^| find /c /v ""') do set "AUDIO_COUNT=%%a"
if %AUDIO_COUNT% GTR 0 set "HAS_AUDIO=1"

if %HAS_AUDIO%==1 (
    for /f "delims=" %%a in ('ffprobe -v error -select_streams a:0 -show_entries stream^=channels -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_AUDIO_CHANNELS=%%a"
    if "!SRC_AUDIO_CHANNELS!"=="" set "SRC_AUDIO_CHANNELS=2"
    if "!SRC_AUDIO_CHANNELS!"=="N/A" set "SRC_AUDIO_CHANNELS=2"
    
    for /f "delims=" %%a in ('ffprobe -v error -select_streams a:0 -show_entries stream^=sample_rate -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_AUDIO_SAMPLE_RATE=%%a"
    if "!SRC_AUDIO_SAMPLE_RATE!"=="" set "SRC_AUDIO_SAMPLE_RATE=48000"
    if "!SRC_AUDIO_SAMPLE_RATE!"=="N/A" set "SRC_AUDIO_SAMPLE_RATE=48000"
)

echo [INFO] Source framerate: %SRC_FRAMERATE% fps
echo [INFO] Source color space: %SRC_COLOR_SPACE%
echo [INFO] Source pixel format: %SRC_PIX_FMT%

if %HAS_AUDIO%==1 (
    echo [INFO] Source audio channels: %SRC_AUDIO_CHANNELS%
    echo [INFO] Source audio sample rate: %SRC_AUDIO_SAMPLE_RATE% Hz
) else (
    echo [WARN] No audio track detected in source video
)

REM ===============================================================================
REM Quality Presets
REM ===============================================================================
set "VIDEO_PRESET=slow"
set "VIDEO_TUNE=film"
set "VIDEO_PROFILE=high"
set "VIDEO_LEVEL=4.2"

REM ===============================================================================
REM Encoding Variants - Define arrays
REM Format: width:height:fps:video_bitrate:audio_bitrate:crf:maxrate:bufsize
REM ===============================================================================
set "VARIANT_0=1080p60:1920:1080:60:8000k:192k:18:9000k:18000k"
set "VARIANT_1=936p30:1664:936:30:5000k:128k:19:5500k:11000k"
set "VARIANT_2=810p30:1440:810:30:4000k:128k:20:4500k:9000k"
set "VARIANT_3=720p30:1280:720:30:2800k:128k:20:3100k:6200k"
set "VARIANT_4=576p30:1024:576:30:1800k:96k:21:2000k:4000k"
set "VARIANT_5=480p30:854:480:30:1200k:96k:22:1400k:2800k"
set "VARIANT_6=360p30:640:360:30:800k:64k:23:900k:1800k"
set "NUM_VARIANTS=7"

REM ===============================================================================
REM Encode each variant
REM ===============================================================================
for /L %%i in (0,1,6) do (
    call :encode_variant %%i
)

goto :generate_master

:encode_variant
set "IDX=%1"
call set "VARIANT=%%VARIANT_%IDX%%%"

for /f "tokens=1-9 delims=:" %%a in ("%VARIANT%") do (
    set "VNAME=%%a"
    set "WIDTH=%%b"
    set "HEIGHT=%%c"
    set "FPS=%%d"
    set "VBITRATE=%%e"
    set "ABITRATE=%%f"
    set "CRF=%%g"
    set "MAXRATE=%%h"
    set "BUFSIZE=%%i"
)

if %HAS_AUDIO%==1 (
    echo [INFO] Encoding !VNAME! (!WIDTH!x!HEIGHT!@!FPS!fps, video: !VBITRATE!, audio: !ABITRATE!^)...
) else (
    echo [INFO] Encoding !VNAME! (!WIDTH!x!HEIGHT!@!FPS!fps, video: !VBITRATE!^)...
)

set /a "KEYINT=SEGMENT_DURATION * FPS"

if %HAS_AUDIO%==1 (
    ffmpeg -y -i "%INPUT%" ^
        -vf "scale=!WIDTH!:!HEIGHT!:flags=lanczos,fps=!FPS!" ^
        -c:v libx264 ^
        -preset %VIDEO_PRESET% ^
        -tune %VIDEO_TUNE% ^
        -profile:v %VIDEO_PROFILE% ^
        -level:v %VIDEO_LEVEL% ^
        -crf !CRF! ^
        -maxrate !MAXRATE! ^
        -bufsize !BUFSIZE! ^
        -colorspace %SRC_COLOR_SPACE% ^
        -color_primaries %SRC_COLOR_PRIMARIES% ^
        -color_trc %SRC_COLOR_TRC% ^
        -pix_fmt %SRC_PIX_FMT% ^
        -g !KEYINT! ^
        -keyint_min !KEYINT! ^
        -sc_threshold 0 ^
        -bf 3 ^
        -b_strategy 2 ^
        -refs 4 ^
        -c:a aac ^
        -b:a !ABITRATE! ^
        -ac %SRC_AUDIO_CHANNELS% ^
        -ar %SRC_AUDIO_SAMPLE_RATE% ^
        -hls_time %SEGMENT_DURATION% ^
        -hls_playlist_type vod ^
        -hls_flags independent_segments ^
        -hls_segment_filename "%OUTPUT_DIR%\!VNAME!_%%d.ts" ^
        "%OUTPUT_DIR%\!VNAME!.m3u8"
) else (
    ffmpeg -y -i "%INPUT%" ^
        -vf "scale=!WIDTH!:!HEIGHT!:flags=lanczos,fps=!FPS!" ^
        -c:v libx264 ^
        -preset %VIDEO_PRESET% ^
        -tune %VIDEO_TUNE% ^
        -profile:v %VIDEO_PROFILE% ^
        -level:v %VIDEO_LEVEL% ^
        -crf !CRF! ^
        -maxrate !MAXRATE! ^
        -bufsize !BUFSIZE! ^
        -colorspace %SRC_COLOR_SPACE% ^
        -color_primaries %SRC_COLOR_PRIMARIES% ^
        -color_trc %SRC_COLOR_TRC% ^
        -pix_fmt %SRC_PIX_FMT% ^
        -g !KEYINT! ^
        -keyint_min !KEYINT! ^
        -sc_threshold 0 ^
        -bf 3 ^
        -b_strategy 2 ^
        -refs 4 ^
        -an ^
        -hls_time %SEGMENT_DURATION% ^
        -hls_playlist_type vod ^
        -hls_flags independent_segments ^
        -hls_segment_filename "%OUTPUT_DIR%\!VNAME!_%%d.ts" ^
        "%OUTPUT_DIR%\!VNAME!.m3u8"
)

echo [INFO] Completed !VNAME!
exit /b 0

REM ===============================================================================
REM Generate Master Playlist
REM ===============================================================================
:generate_master
echo [INFO] Generating master playlist...

set "MASTER_PLAYLIST=%OUTPUT_DIR%\master.m3u8"

(
    echo #EXTM3U
    echo #EXT-X-VERSION:6
    echo ## Generated HLS Master Playlist
    echo ## Adaptive Bitrate Streaming with multiple quality levels
    echo.
) > "%MASTER_PLAYLIST%"

for /L %%i in (0,1,6) do (
    call :add_variant_to_master %%i
)

echo [INFO] Master playlist created: %MASTER_PLAYLIST%
goto :generate_thumbnails

:add_variant_to_master
set "IDX=%1"
call set "VARIANT=%%VARIANT_%IDX%%%"

for /f "tokens=1-9 delims=:" %%a in ("%VARIANT%") do (
    set "VNAME=%%a"
    set "WIDTH=%%b"
    set "HEIGHT=%%c"
    set "FPS=%%d"
    set "VBITRATE=%%e"
    set "ABITRATE=%%f"
)

REM Convert bitrates to bits/second (remove 'k' and multiply by 1000)
set "VBITS=!VBITRATE:k=!"
set /a "VBITS=VBITS * 1000"

if %HAS_AUDIO%==1 (
    set "ABITS=!ABITRATE:k=!"
    set /a "ABITS=ABITS * 1000"
    set /a "BANDWIDTH=VBITS + ABITS"
    set "CODECS=avc1.640028,mp4a.40.2"
) else (
    set "BANDWIDTH=!VBITS!"
    set "CODECS=avc1.640028"
)

set /a "AVG_BANDWIDTH=BANDWIDTH * 85 / 100"

(
    echo #EXT-X-STREAM-INF:BANDWIDTH=!BANDWIDTH!,AVERAGE-BANDWIDTH=!AVG_BANDWIDTH!,RESOLUTION=!WIDTH!x!HEIGHT!,FRAME-RATE=!FPS!.000,CODECS="!CODECS!",CLOSED-CAPTIONS=NONE
    echo !VNAME!.m3u8
) >> "%MASTER_PLAYLIST%"

exit /b 0

REM ===============================================================================
REM Generate Thumbnail Sprite Sheet
REM ===============================================================================
:generate_thumbnails
if %GENERATE_THUMBNAILS%==0 goto :generate_report

echo [INFO] Generating thumbnail sprite sheet (every %SEGMENT_DURATION%s)...

set "THUMB_DIR=%OUTPUT_DIR%\thumbnails"

REM Get video duration
for /f "delims=" %%a in ('ffprobe -v error -show_entries format^=duration -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%"') do set "DURATION_RAW=%%a"
for /f "tokens=1 delims=." %%a in ("%DURATION_RAW%") do set "DURATION_INT=%%a"

set /a "NUM_THUMBS=(DURATION_INT + SEGMENT_DURATION - 1) / SEGMENT_DURATION"
if %NUM_THUMBS% LSS 1 set "NUM_THUMBS=1"

set /a "THUMB_ROWS=(NUM_THUMBS + THUMB_COLS - 1) / THUMB_COLS"

echo [INFO] Generating %NUM_THUMBS% thumbnails in %THUMB_COLS%x%THUMB_ROWS% grid...

ffmpeg -y -i "%INPUT%" ^
    -vf "fps=1/%SEGMENT_DURATION%,scale=%THUMB_WIDTH%:%THUMB_HEIGHT%:flags=lanczos,tile=%THUMB_COLS%x%THUMB_ROWS%" ^
    -frames:v 1 ^
    -q:v 2 ^
    "%THUMB_DIR%\sprite.jpg"

REM Generate thumbnail VTT file
set "THUMB_VTT=%OUTPUT_DIR%\thumbnails.vtt"
set "SPRITE_FILENAME=thumbnails/sprite.jpg"

(
    echo WEBVTT
    echo.
) > "%THUMB_VTT%"

set "THUMB_INDEX=0"
set "CURRENT_TIME=0"

:vtt_loop
if %CURRENT_TIME% GEQ %DURATION_INT% goto :vtt_done

set /a "END_TIME=CURRENT_TIME + SEGMENT_DURATION"
if %END_TIME% GTR %DURATION_INT% set "END_TIME=%DURATION_INT%"

set /a "COL=THUMB_INDEX %% THUMB_COLS"
set /a "ROW=THUMB_INDEX / THUMB_COLS"
set /a "X=COL * THUMB_WIDTH"
set /a "Y=ROW * THUMB_HEIGHT"

REM Format timestamps
call :format_time %CURRENT_TIME% START_FMT
call :format_time %END_TIME% END_FMT

(
    echo !START_FMT! --^> !END_FMT!
    echo %SPRITE_FILENAME%#xywh=!X!,!Y!,%THUMB_WIDTH%,%THUMB_HEIGHT%
    echo.
) >> "%THUMB_VTT%"

set /a "THUMB_INDEX+=1"
set /a "CURRENT_TIME+=SEGMENT_DURATION"
goto :vtt_loop

:vtt_done
echo [INFO] Sprite sheet generated: %THUMB_DIR%\sprite.jpg
echo [INFO] Thumbnail VTT created: %THUMB_VTT%
set /a "SPRITE_W=THUMB_COLS * THUMB_WIDTH"
set /a "SPRITE_H=THUMB_ROWS * THUMB_HEIGHT"
echo [INFO] Sprite dimensions: %SPRITE_W%x%SPRITE_H% pixels
echo [INFO] Total thumbnails: %NUM_THUMBS% (grid: %THUMB_COLS%x%THUMB_ROWS%)
goto :generate_report

:format_time
set "SECS=%1"
set /a "HH=SECS / 3600"
set /a "MM=(SECS %% 3600) / 60"
set /a "SS=SECS %% 60"
if %HH% LSS 10 set "HH=0%HH%"
if %MM% LSS 10 set "MM=0%MM%"
if %SS% LSS 10 set "SS=0%SS%"
set "%2=%HH%:%MM%:%SS%.000"
exit /b 0

REM ===============================================================================
REM Generate encoding report
REM ===============================================================================
:generate_report
set "REPORT_FILE=%OUTPUT_DIR%\encoding_report.txt"

(
    echo ===============================================================================
    echo HLS Encoding Report
    echo Generated: %DATE% %TIME%
    echo ===============================================================================
    echo.
    echo SOURCE FILE: %INPUT%
    echo OUTPUT DIRECTORY: %OUTPUT_DIR%
    echo SEGMENT DURATION: %SEGMENT_DURATION%s
    echo.
    echo SOURCE PROPERTIES:
    echo   - Framerate: %SRC_FRAMERATE% fps
    echo   - Color Space: %SRC_COLOR_SPACE%
    echo   - Color Primaries: %SRC_COLOR_PRIMARIES%
    echo   - Transfer Characteristics: %SRC_COLOR_TRC%
    echo   - Pixel Format: %SRC_PIX_FMT%
) > "%REPORT_FILE%"

if %HAS_AUDIO%==1 (
    echo   - Audio: Yes ^(%SRC_AUDIO_CHANNELS% channels, %SRC_AUDIO_SAMPLE_RATE% Hz^) >> "%REPORT_FILE%"
) else (
    echo   - Audio: None >> "%REPORT_FILE%"
)

echo. >> "%REPORT_FILE%"
echo ENCODED VARIANTS: >> "%REPORT_FILE%"

for /L %%i in (0,1,6) do (
    call :report_variant %%i
)

(
    echo.
    echo FILES GENERATED:
    echo   - Master Playlist: master.m3u8
    echo   - 1080p60.m3u8 + segments
    echo   - 936p40.m3u8 + segments
    echo   - 810p50.m3u8 + segments
    echo   - 720p60.m3u8 + segments
    echo   - 576p48.m3u8 + segments
    echo   - 480p30.m3u8 + segments
    echo   - 360p30.m3u8 + segments
) >> "%REPORT_FILE%"

if %GENERATE_THUMBNAILS%==1 (
    (
        echo   - thumbnails/sprite.jpg ^(single sprite sheet with all thumbnails^)
        echo   - thumbnails.vtt ^(WebVTT with Media Fragment URIs for player scrubbing^)
        echo.
        echo THUMBNAIL SPRITE INFO:
        echo   - Individual thumbnail size: %THUMB_WIDTH%x%THUMB_HEIGHT% pixels
        echo   - Grid layout: %THUMB_COLS% columns
        echo   - VTT format uses #xywh= Media Fragment URIs for efficient single-request loading
    ) >> "%REPORT_FILE%"
)

(
    echo.
    echo PLAYBACK:
    echo   Use master.m3u8 with any HLS-compatible player.
    echo   Players will automatically select appropriate quality based on bandwidth.
    echo.
    echo   For thumbnail previews, load thumbnails.vtt and sprite.jpg
    echo   Compatible with Video.js, JW Player, Shaka Player, and other players
    echo   that support WebVTT thumbnail tracks with sprite sheets.
    echo ===============================================================================
) >> "%REPORT_FILE%"

echo [INFO] Encoding report saved: %REPORT_FILE%
echo [INFO] HLS encoding complete!
echo [INFO] Master playlist: %OUTPUT_DIR%\master.m3u8
echo.
echo [INFO] Generated files:
dir /b "%OUTPUT_DIR%\*.m3u8" 2>nul
dir /b "%OUTPUT_DIR%\thumbnails\" 2>nul
goto :eof

:report_variant
set "IDX=%1"
call set "VARIANT=%%VARIANT_%IDX%%%"

for /f "tokens=1-9 delims=:" %%a in ("%VARIANT%") do (
    set "VNAME=%%a"
    set "WIDTH=%%b"
    set "HEIGHT=%%c"
    set "FPS=%%d"
    set "VBITRATE=%%e"
    set "ABITRATE=%%f"
    set "CRF=%%g"
    set "MAXRATE=%%h"
)

(
    echo   !VNAME!:
    echo     - Resolution: !WIDTH!x!HEIGHT!
    echo     - Framerate: !FPS!fps
    echo     - Video Bitrate: !VBITRATE! ^(CRF: !CRF!, Max: !MAXRATE!^)
) >> "%REPORT_FILE%"

if %HAS_AUDIO%==1 (
    echo     - Audio Bitrate: !ABITRATE! >> "%REPORT_FILE%"
)

echo     - Playlist: !VNAME!.m3u8 >> "%REPORT_FILE%"
exit /b 0

endlocal
