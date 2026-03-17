@echo off
setlocal EnableDelayedExpansion
REM ===============================================================================
REM DASH Adaptive Bitrate Encoding Script for Windows
REM Generates multi-resolution DASH streams with MPD manifest and thumbnail sprite
REM Handles videos with or without audio tracks
REM Requires: ffmpeg and ffprobe in PATH
REM ===============================================================================

REM Default values
set "INPUT="
set "OUTPUT_DIR=.\assets\dash"
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
echo     -o, --output        Output directory (default: .\assets\dash)
echo     -s, --segment       Segment duration in seconds (default: 10)
echo     -t, --no-thumbnails Disable thumbnail generation
echo     -h, --help          Show this help message
echo.
echo Example:
echo     %~nx0 -i source_video.mp4 -o .\output\dash -s 10
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

echo [INFO] Starting DASH encoding...
echo [INFO] Input: %INPUT%
echo [INFO] Output: %OUTPUT_DIR%
echo [INFO] Segment Duration: %SEGMENT_DURATION%s

REM ===============================================================================
REM Probe source video for metadata preservation
REM ===============================================================================
echo [INFO] Analyzing source video...

REM Get source framerate
for /f "delims=" %%a in ('ffprobe -v error -select_streams v:0 -show_entries stream^=r_frame_rate -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set "SRC_FRAMERATE_RAW=%%a"
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
REM Encoding Variants Configuration
REM ===============================================================================
set "NUM_VARIANTS=7"

set "WIDTH_0=1920"   & set "HEIGHT_0=1080"  & set "FPS_0=60"  & set "VBITRATE_0=8000k" & set "ABITRATE_0=192k" & set "CRF_0=18" & set "MAXRATE_0=9000k"  & set "BUFSIZE_0=18000k" & set "VNAME_0=1080p60"
set "WIDTH_1=1664"   & set "HEIGHT_1=936"   & set "FPS_1=30"  & set "VBITRATE_1=5000k" & set "ABITRATE_1=128k" & set "CRF_1=19" & set "MAXRATE_1=5500k"  & set "BUFSIZE_1=11000k" & set "VNAME_1=936p30"
set "WIDTH_2=1440"   & set "HEIGHT_2=810"   & set "FPS_2=30"  & set "VBITRATE_2=4000k" & set "ABITRATE_2=128k" & set "CRF_2=20" & set "MAXRATE_2=4500k"  & set "BUFSIZE_2=9000k"  & set "VNAME_2=810p30"
set "WIDTH_3=1280"   & set "HEIGHT_3=720"   & set "FPS_3=30"  & set "VBITRATE_3=2800k" & set "ABITRATE_3=128k" & set "CRF_3=20" & set "MAXRATE_3=3100k"  & set "BUFSIZE_3=6200k"  & set "VNAME_3=720p30"
set "WIDTH_4=1024"   & set "HEIGHT_4=576"   & set "FPS_4=30"  & set "VBITRATE_4=1800k" & set "ABITRATE_4=96k"  & set "CRF_4=21" & set "MAXRATE_4=2000k"  & set "BUFSIZE_4=4000k"  & set "VNAME_4=576p30"
set "WIDTH_5=854"    & set "HEIGHT_5=480"   & set "FPS_5=30"  & set "VBITRATE_5=1200k" & set "ABITRATE_5=96k"  & set "CRF_5=22" & set "MAXRATE_5=1400k"  & set "BUFSIZE_5=2800k"  & set "VNAME_5=480p30"
set "WIDTH_6=640"    & set "HEIGHT_6=360"   & set "FPS_6=30"  & set "VBITRATE_6=800k"  & set "ABITRATE_6=64k"  & set "CRF_6=23" & set "MAXRATE_6=900k"   & set "BUFSIZE_6=1800k"  & set "VNAME_6=360p30"

echo [INFO] Preparing DASH encoding with %NUM_VARIANTS% video variants...

REM ===============================================================================
REM Build filter_complex for multi-output encoding
REM ===============================================================================
echo [INFO] Building ffmpeg command...

set "FILTER_COMPLEX=[0:v]split=%NUM_VARIANTS%"
for /L %%i in (0,1,6) do (
    set "FILTER_COMPLEX=!FILTER_COMPLEX![v%%i]"
)
set "FILTER_COMPLEX=%FILTER_COMPLEX%;"

for /L %%i in (0,1,6) do (
    call set "W=%%WIDTH_%%i%%"
    call set "H=%%HEIGHT_%%i%%"
    call set "F=%%FPS_%%i%%"
    set "FILTER_COMPLEX=!FILTER_COMPLEX![v%%i]scale=!W!:!H!:flags=lanczos,fps=!F!,setpts=PTS-STARTPTS[v%%iout];"
)

REM Remove trailing semicolon
set "FILTER_COMPLEX=%FILTER_COMPLEX:~0,-1%"

REM ===============================================================================
REM Build and execute ffmpeg command for DASH output
REM Due to Windows command line limitations, we'll encode variants individually
REM then use MP4Box or create intermediate files
REM ===============================================================================

echo [INFO] Starting DASH encoding (this may take a while)...

REM Create temporary intermediate MP4 files for each variant
for /L %%i in (0,1,6) do (
    call :encode_dash_variant %%i
)

REM Now create DASH manifest using ffmpeg with all intermediate files
echo [INFO] Creating DASH manifest...

REM Build ffmpeg command for DASH packaging
set "DASH_INPUTS="
set "DASH_MAPS="
set "DASH_VIDEO_OPTS="

for /L %%i in (0,1,6) do (
    call set "VNAME=%%VNAME_%%i%%"
    set "DASH_INPUTS=!DASH_INPUTS! -i "%OUTPUT_DIR%\temp_!VNAME!.mp4""
)

REM Map all video streams
set "MAP_IDX=0"
for /L %%i in (0,1,6) do (
    set "DASH_MAPS=!DASH_MAPS! -map !MAP_IDX!:v"
    set /a "MAP_IDX+=1"
)

REM Map audio from first input if audio exists (already encoded in temp files)
REM Only map audio once for High Quality (128k) and once for Low Quality (64k)
if %HAS_AUDIO%==1 (
    REM Map audio from first input (High Quality 128k)
    set "DASH_MAPS=!DASH_MAPS! -map 0:a"
    REM Map audio from first input again (Low Quality 64k)
    set "DASH_MAPS=!DASH_MAPS! -map 0:a"
)

REM Video streams - copy since already encoded
set "DASH_VIDEO_OPTS=-c:v copy"

if %HAS_AUDIO%==1 (
    REM Encode two audio versions: High Quality (128k) and Low Quality (64k)
    set "DASH_AUDIO_OPTS=-c:a:0 aac -b:a:0 128k -ac:a:0 %SRC_AUDIO_CHANNELS% -ar:a:0 %SRC_AUDIO_SAMPLE_RATE% -c:a:1 aac -b:a:1 64k -ac:a:1 %SRC_AUDIO_CHANNELS% -ar:a:1 %SRC_AUDIO_SAMPLE_RATE%"
) else (
    set "DASH_AUDIO_OPTS="
)

REM Build adaptation sets
REM Video adaptation set has 7 streams (0-6)
REM Audio adaptation set has 2 streams (7-8): 128k and 64k
if %HAS_AUDIO%==1 (
    set "ADAPT_SETS=id=0,streams=0,1,2,3,4,5,6 id=1,streams=7,8"
) else (
    set "ADAPT_SETS=id=0,streams=0,1,2,3,4,5,6"
)

ffmpeg -y %DASH_INPUTS% %DASH_MAPS% ^
    %DASH_VIDEO_OPTS% %DASH_AUDIO_OPTS% ^
    -f dash ^
    -seg_duration %SEGMENT_DURATION% ^
    -use_timeline 1 ^
    -use_template 1 ^
    -init_seg_name "init_stream$RepresentationID$.m4s" ^
    -media_seg_name "chunk_stream$RepresentationID$_$Number%%05d$.m4s" ^
    -adaptation_sets "%ADAPT_SETS%" ^
    "%OUTPUT_DIR%\manifest.mpd"

REM Clean up temporary files
echo [INFO] Cleaning up temporary files...
for /L %%i in (0,1,6) do (
    call set "VNAME=%%VNAME_%%i%%"
    del "%OUTPUT_DIR%\temp_!VNAME!.mp4" 2>nul
)

echo [INFO] DASH encoding complete!
goto :generate_thumbnails_dash

:encode_dash_variant
set "IDX=%1"
call set "W=%%WIDTH_%IDX%%%"
call set "H=%%HEIGHT_%IDX%%%"
call set "F=%%FPS_%IDX%%%"
call set "VB=%%VBITRATE_%IDX%%%"
call set "AB=%%ABITRATE_%IDX%%%"
call set "CR=%%CRF_%IDX%%%"
call set "MR=%%MAXRATE_%IDX%%%"
call set "BS=%%BUFSIZE_%IDX%%%"
call set "VN=%%VNAME_%IDX%%%"

if %HAS_AUDIO%==1 (
    echo [INFO] Encoding !VN! (!W!x!H!@!F!fps, video: !VB!, audio: !AB!^)...
) else (
    echo [INFO] Encoding !VN! (!W!x!H!@!F!fps, video: !VB!^)...
)

set /a "KEYINT=SEGMENT_DURATION * F"

if %HAS_AUDIO%==1 (
    ffmpeg -y -i "%INPUT%" ^
        -vf "scale=!W!:!H!:flags=lanczos,fps=!F!" ^
        -c:v libx264 ^
        -preset %VIDEO_PRESET% ^
        -tune %VIDEO_TUNE% ^
        -profile:v %VIDEO_PROFILE% ^
        -level:v %VIDEO_LEVEL% ^
        -crf !CR! ^
        -maxrate !MR! ^
        -bufsize !BS! ^
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
        -b:a !AB! ^
        -ac %SRC_AUDIO_CHANNELS% ^
        -ar %SRC_AUDIO_SAMPLE_RATE% ^
        -movflags +faststart ^
        "%OUTPUT_DIR%\temp_!VN!.mp4"
) else (
    ffmpeg -y -i "%INPUT%" ^
        -vf "scale=!W!:!H!:flags=lanczos,fps=!F!" ^
        -c:v libx264 ^
        -preset %VIDEO_PRESET% ^
        -tune %VIDEO_TUNE% ^
        -profile:v %VIDEO_PROFILE% ^
        -level:v %VIDEO_LEVEL% ^
        -crf !CR! ^
        -maxrate !MR! ^
        -bufsize !BS! ^
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
        -movflags +faststart ^
        "%OUTPUT_DIR%\temp_!VN!.mp4"
)

echo [INFO] Completed !VN!
exit /b 0

REM ===============================================================================
REM Generate Thumbnail Sprite Sheet
REM ===============================================================================
:generate_thumbnails_dash
if %GENERATE_THUMBNAILS%==0 goto :generate_report_dash

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

:vtt_loop_dash
if %CURRENT_TIME% GEQ %DURATION_INT% goto :vtt_done_dash

set /a "END_TIME=CURRENT_TIME + SEGMENT_DURATION"
if %END_TIME% GTR %DURATION_INT% set "END_TIME=%DURATION_INT%"

set /a "COL=THUMB_INDEX %% THUMB_COLS"
set /a "ROW=THUMB_INDEX / THUMB_COLS"
set /a "X=COL * THUMB_WIDTH"
set /a "Y=ROW * THUMB_HEIGHT"

REM Format timestamps
call :format_time_dash %CURRENT_TIME% START_FMT
call :format_time_dash %END_TIME% END_FMT

(
    echo !START_FMT! --^> !END_FMT!
    echo %SPRITE_FILENAME%#xywh=!X!,!Y!,%THUMB_WIDTH%,%THUMB_HEIGHT%
    echo.
) >> "%THUMB_VTT%"

set /a "THUMB_INDEX+=1"
set /a "CURRENT_TIME+=SEGMENT_DURATION"
goto :vtt_loop_dash

:vtt_done_dash
echo [INFO] Sprite sheet generated: %THUMB_DIR%\sprite.jpg
echo [INFO] Thumbnail VTT created: %THUMB_VTT%
set /a "SPRITE_W=THUMB_COLS * THUMB_WIDTH"
set /a "SPRITE_H=THUMB_ROWS * THUMB_HEIGHT"
echo [INFO] Sprite dimensions: %SPRITE_W%x%SPRITE_H% pixels
echo [INFO] Total thumbnails: %NUM_THUMBS% (grid: %THUMB_COLS%x%THUMB_ROWS%)
goto :generate_report_dash

:format_time_dash
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
:generate_report_dash
set "REPORT_FILE=%OUTPUT_DIR%\encoding_report.txt"

(
    echo ===============================================================================
    echo DASH Encoding Report
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
    call :report_variant_dash %%i
)

(
    echo.
    echo FILES GENERATED:
    echo   - MPD Manifest: manifest.mpd
    echo   - Init Segments: init_stream*.m4s
    echo   - Media Segments: chunk_stream*_*.m4s
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
    echo   Use manifest.mpd with any DASH-compatible player ^(dash.js, Shaka Player, etc.^)
    echo   Players will automatically select appropriate quality based on bandwidth.
    echo.
    echo   For thumbnail previews, load thumbnails.vtt and sprite.jpg
    echo   Compatible with Video.js, JW Player, Shaka Player, and other players
    echo   that support WebVTT thumbnail tracks with sprite sheets.
    echo.
    echo ADAPTATION SETS:
    echo   - id=0: Video representations ^(all resolutions^)
) >> "%REPORT_FILE%"

if %HAS_AUDIO%==1 (
    echo   - id=1: Audio representations ^(all bitrates^) >> "%REPORT_FILE%"
) else (
    echo   - ^(No audio adaptation set - source has no audio^) >> "%REPORT_FILE%"
)

echo =============================================================================== >> "%REPORT_FILE%"

echo [INFO] Encoding report saved: %REPORT_FILE%
echo [INFO] DASH encoding complete!
echo [INFO] MPD manifest: %OUTPUT_DIR%\manifest.mpd
echo.
echo [INFO] Generated files summary:
dir /b "%OUTPUT_DIR%\*.mpd" 2>nul
dir /b "%OUTPUT_DIR%\thumbnails\" 2>nul
echo.
echo [INFO] Segment files:
dir /b "%OUTPUT_DIR%\*.m4s" 2>nul | more +0 /e /c /p
for /f %%a in ('dir /b "%OUTPUT_DIR%\*.m4s" 2^>nul ^| find /c /v ""') do echo [INFO] Total segment files: %%a
goto :eof

:report_variant_dash
set "IDX=%1"
call set "VN=%%VNAME_%IDX%%%"
call set "W=%%WIDTH_%IDX%%%"
call set "H=%%HEIGHT_%IDX%%%"
call set "F=%%FPS_%IDX%%%"
call set "VB=%%VBITRATE_%IDX%%%"
call set "AB=%%ABITRATE_%IDX%%%"
call set "CR=%%CRF_%IDX%%%"
call set "MR=%%MAXRATE_%IDX%%%"

(
    echo   !VN!:
    echo     - Resolution: !W!x!H!
    echo     - Framerate: !F!fps
    echo     - Video Bitrate: !VB! ^(CRF: !CR!, Max: !MR!^)
) >> "%REPORT_FILE%"

if %HAS_AUDIO%==1 (
    echo     - Audio: Shared across all variants ^(2 streams: 128k and 64k^) >> "%REPORT_FILE%"
    echo     - Stream Index: Video=%IDX% >> "%REPORT_FILE%"
) else (
    echo     - Stream Index: Video=%IDX% >> "%REPORT_FILE%"
)

exit /b 0

endlocal
