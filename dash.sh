#!/bin/bash
#===============================================================================
# DASH Adaptive Bitrate Encoding Script
# Generates multi-resolution DASH streams with MPD manifest and thumbnail sprite
# Handles videos with or without audio tracks
#===============================================================================

set -euo pipefail

# Default values
INPUT=""
OUTPUT_DIR="./assets/dash"
SEGMENT_DURATION=4
GENERATE_THUMBNAILS=true
THUMB_WIDTH=160
THUMB_HEIGHT=90
THUMB_COLS=10  # Thumbnails per row in sprite

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $(basename "$0") -i <input_file> [-o <output_dir>] [-s <segment_duration>] [-t]

Options:
    -i, --input         Input video file (required)
    -o, --output        Output directory (default: ./assets/dash)
    -s, --segment       Segment duration in seconds (default: 10)
    -t, --no-thumbnails Disable thumbnail generation
    -h, --help          Show this help message

Example:
    $(basename "$0") -i source_video.mp4 -o ./output/dash -s 10
EOF
    exit 1
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--input)
            INPUT="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -s|--segment)
            SEGMENT_DURATION="$2"
            shift 2
            ;;
        -t|--no-thumbnails)
            GENERATE_THUMBNAILS=false
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate input
if [[ -z "$INPUT" ]]; then
    log_error "Input file is required"
    usage
fi

if [[ ! -f "$INPUT" ]]; then
    log_error "Input file does not exist: $INPUT"
    exit 1
fi

# Create output directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/thumbnails"

log_info "Starting DASH encoding..."
log_info "Input: $INPUT"
log_info "Output: $OUTPUT_DIR"
log_info "Segment Duration: ${SEGMENT_DURATION}s"

#===============================================================================
# Probe source video for metadata preservation
#===============================================================================
log_info "Analyzing source video..."

# Get source properties
SRC_FRAMERATE=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "$INPUT" | bc -l | xargs printf "%.2f")
SRC_COLOR_SPACE=$(ffprobe -v error -select_streams v:0 -show_entries stream=color_space -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "bt709")
SRC_COLOR_PRIMARIES=$(ffprobe -v error -select_streams v:0 -show_entries stream=color_primaries -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "bt709")
SRC_COLOR_TRC=$(ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "bt709")
SRC_PIX_FMT=$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "yuv420p")
SRC_BIT_DEPTH=$(ffprobe -v error -select_streams v:0 -show_entries stream=bits_per_raw_sample -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "8")

# Check if audio stream exists
AUDIO_STREAM_COUNT=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$INPUT" 2>/dev/null | wc -l)
HAS_AUDIO=false
SRC_AUDIO_CHANNELS=""
SRC_AUDIO_SAMPLE_RATE=""

if [[ $AUDIO_STREAM_COUNT -gt 0 ]]; then
    HAS_AUDIO=true
    SRC_AUDIO_CHANNELS=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "2")
    SRC_AUDIO_SAMPLE_RATE=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "48000")
    
    # Validate audio properties
    [[ -z "$SRC_AUDIO_CHANNELS" || "$SRC_AUDIO_CHANNELS" == "N/A" ]] && SRC_AUDIO_CHANNELS="2"
    [[ -z "$SRC_AUDIO_SAMPLE_RATE" || "$SRC_AUDIO_SAMPLE_RATE" == "N/A" ]] && SRC_AUDIO_SAMPLE_RATE="48000"
fi

# Handle unknown values
[[ "$SRC_COLOR_SPACE" == "unknown" || -z "$SRC_COLOR_SPACE" ]] && SRC_COLOR_SPACE="bt709"
[[ "$SRC_COLOR_PRIMARIES" == "unknown" || -z "$SRC_COLOR_PRIMARIES" ]] && SRC_COLOR_PRIMARIES="bt709"
[[ "$SRC_COLOR_TRC" == "unknown" || -z "$SRC_COLOR_TRC" ]] && SRC_COLOR_TRC="bt709"
[[ "$SRC_PIX_FMT" == "unknown" || -z "$SRC_PIX_FMT" ]] && SRC_PIX_FMT="yuv420p"

log_info "Source framerate: $SRC_FRAMERATE fps"
log_info "Source color space: $SRC_COLOR_SPACE"
log_info "Source pixel format: $SRC_PIX_FMT"

if [[ "$HAS_AUDIO" == true ]]; then
    log_info "Source audio channels: $SRC_AUDIO_CHANNELS"
    log_info "Source audio sample rate: $SRC_AUDIO_SAMPLE_RATE Hz"
else
    log_warn "No audio track detected in source video"
fi

#===============================================================================
# Quality Presets - Optimized for minimal perceptible quality loss
#===============================================================================

VIDEO_PRESET="slow"
VIDEO_TUNE="film"
VIDEO_PROFILE="high"
VIDEO_LEVEL="4.2"

#===============================================================================
# Encoding Variants Configuration
# Format: width:height:fps:video_bitrate:crf:maxrate:bufsize
#===============================================================================

# Define variants as arrays for DASH multi-output encoding
declare -a WIDTHS=(1920 1664 1440 1280 1024 854 640)
declare -a HEIGHTS=(1080 936 810 720 576 480 360)
declare -a FPS=(60 30 30 30 30 30 30)
declare -a VBITRATES=(8000k 5000k 4000k 2800k 1800k 1200k 800k)
declare -a ABITRATES=(192k 128k 128k 128k 96k 96k 64k)
declare -a CRFS=(18 19 20 20 21 22 23)
declare -a MAXRATES=(9000k 5500k 4500k 3100k 2000k 1400k 900k)
declare -a BUFSIZES=(18000k 11000k 9000k 6200k 4000k 2800k 1800k)
declare -a VARIANT_NAMES=("1080p60" "936p30" "810p30" "720p30" "576p30" "480p30" "360p30")

NUM_VARIANTS=${#VARIANT_NAMES[@]}

log_info "Preparing DASH encoding with $NUM_VARIANTS video variants..."

#===============================================================================
# Build complex filter for multi-output encoding with different framerates
# Since each variant has a different framerate, we need split + individual fps filters
#===============================================================================

# Build filter_complex string
FILTER_COMPLEX="[0:v]split=${NUM_VARIANTS}"
for i in $(seq 0 $((NUM_VARIANTS - 1))); do
    FILTER_COMPLEX="${FILTER_COMPLEX}[v${i}]"
done
FILTER_COMPLEX="${FILTER_COMPLEX};"

for i in $(seq 0 $((NUM_VARIANTS - 1))); do
    w=${WIDTHS[$i]}
    h=${HEIGHTS[$i]}
    f=${FPS[$i]}
    keyint=$((SEGMENT_DURATION * f))
    FILTER_COMPLEX="${FILTER_COMPLEX}[v${i}]scale=${w}:${h}:flags=lanczos,fps=${f},setpts=PTS-STARTPTS[v${i}out];"
done

# Remove trailing semicolon
FILTER_COMPLEX="${FILTER_COMPLEX%;}"

log_info "Building ffmpeg command..."

#===============================================================================
# Build ffmpeg command for DASH output
#===============================================================================

FFMPEG_CMD="ffmpeg -y -i \"$INPUT\" -filter_complex \"$FILTER_COMPLEX\""

# Add video stream mappings and encoding parameters
for i in $(seq 0 $((NUM_VARIANTS - 1))); do
    f=${FPS[$i]}
    vb=${VBITRATES[$i]}
    crf=${CRFS[$i]}
    mr=${MAXRATES[$i]}
    bs=${BUFSIZES[$i]}
    keyint=$((SEGMENT_DURATION * f))
    
    FFMPEG_CMD="${FFMPEG_CMD} -map \"[v${i}out]\""
    FFMPEG_CMD="${FFMPEG_CMD} -c:v:${i} libx264"
    FFMPEG_CMD="${FFMPEG_CMD} -preset:v:${i} $VIDEO_PRESET"
    FFMPEG_CMD="${FFMPEG_CMD} -tune:v:${i} $VIDEO_TUNE"
    FFMPEG_CMD="${FFMPEG_CMD} -profile:v:${i} $VIDEO_PROFILE"
    FFMPEG_CMD="${FFMPEG_CMD} -level:v:${i} $VIDEO_LEVEL"
    FFMPEG_CMD="${FFMPEG_CMD} -crf:v:${i} $crf"
    FFMPEG_CMD="${FFMPEG_CMD} -maxrate:v:${i} $mr"
    FFMPEG_CMD="${FFMPEG_CMD} -bufsize:v:${i} $bs"
    FFMPEG_CMD="${FFMPEG_CMD} -g:v:${i} $keyint"
    FFMPEG_CMD="${FFMPEG_CMD} -keyint_min:v:${i} $keyint"
    FFMPEG_CMD="${FFMPEG_CMD} -sc_threshold:v:${i} 0"
    FFMPEG_CMD="${FFMPEG_CMD} -bf:v:${i} 3"
    FFMPEG_CMD="${FFMPEG_CMD} -refs:v:${i} 4"
done

# Color space preservation (applied globally)
FFMPEG_CMD="${FFMPEG_CMD} -colorspace $SRC_COLOR_SPACE"
FFMPEG_CMD="${FFMPEG_CMD} -color_primaries $SRC_COLOR_PRIMARIES"
FFMPEG_CMD="${FFMPEG_CMD} -color_trc $SRC_COLOR_TRC"
FFMPEG_CMD="${FFMPEG_CMD} -pix_fmt $SRC_PIX_FMT"

# Add audio stream mappings ONLY if audio exists
# Only create TWO audio streams (High Quality 128k and Low Quality 64k)
if [[ "$HAS_AUDIO" == true ]]; then
    # High Quality Audio (128k)
    FFMPEG_CMD="${FFMPEG_CMD} -map 0:a:0 -c:a:0 aac -b:a:0 128k -ac:a:0 $SRC_AUDIO_CHANNELS -ar:a:0 $SRC_AUDIO_SAMPLE_RATE"
    # Low Quality Audio (64k)
    FFMPEG_CMD="${FFMPEG_CMD} -map 0:a:0 -c:a:1 aac -b:a:1 64k -ac:a:1 $SRC_AUDIO_CHANNELS -ar:a:1 $SRC_AUDIO_SAMPLE_RATE"
fi

# DASH specific options
FFMPEG_CMD="${FFMPEG_CMD} -f dash"
FFMPEG_CMD="${FFMPEG_CMD} -seg_duration $SEGMENT_DURATION"
FFMPEG_CMD="${FFMPEG_CMD} -use_timeline 1"
FFMPEG_CMD="${FFMPEG_CMD} -use_template 1"
FFMPEG_CMD="${FFMPEG_CMD} -init_seg_name 'init_stream\$RepresentationID\$.m4s'"
FFMPEG_CMD="${FFMPEG_CMD} -media_seg_name 'chunk_stream\$RepresentationID\$_\$Number%05d\$.m4s'"

# Build adaptation sets string - video streams first, then audio (if present)
VIDEO_STREAMS=$(seq -s, 0 $((NUM_VARIANTS - 1)))

if [[ "$HAS_AUDIO" == true ]]; then
    # Audio streams are 7 (128k) and 8 (64k)
    AUDIO_STREAMS="$NUM_VARIANTS,$((NUM_VARIANTS + 1))"
    FFMPEG_CMD="${FFMPEG_CMD} -adaptation_sets \"id=0,streams=${VIDEO_STREAMS} id=1,streams=${AUDIO_STREAMS}\""
else
    # Video only - single adaptation set
    FFMPEG_CMD="${FFMPEG_CMD} -adaptation_sets \"id=0,streams=${VIDEO_STREAMS}\""
fi

# Output manifest
FFMPEG_CMD="${FFMPEG_CMD} \"$OUTPUT_DIR/manifest.mpd\""

log_info "Starting DASH encoding (this may take a while)..."

# Execute ffmpeg command
eval $FFMPEG_CMD 2>&1 | grep -E "(frame|fps|time|bitrate|speed|Output)" || true

log_info "DASH encoding complete!"

#===============================================================================
# Generate Thumbnail Sprite Sheet (single image with all thumbnails)
#===============================================================================
if [[ "$GENERATE_THUMBNAILS" == true ]]; then
    log_info "Generating thumbnail sprite sheet (every ${SEGMENT_DURATION}s)..."
    
    THUMB_DIR="$OUTPUT_DIR/thumbnails"
    
    # Get video duration
    DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT")
    DURATION_INT=${DURATION%.*}
    
    # Calculate number of thumbnails
    NUM_THUMBS=$(( (DURATION_INT + SEGMENT_DURATION - 1) / SEGMENT_DURATION ))
    
    # Ensure at least 1 thumbnail
    [[ $NUM_THUMBS -lt 1 ]] && NUM_THUMBS=1
    
    # Calculate grid dimensions
    THUMB_ROWS=$(( (NUM_THUMBS + THUMB_COLS - 1) / THUMB_COLS ))
    
    log_info "Generating $NUM_THUMBS thumbnails in ${THUMB_COLS}x${THUMB_ROWS} grid..."
    
    # Generate sprite sheet directly with ffmpeg using tile filter
    # This creates a single image with all thumbnails arranged in a grid
    ffmpeg -y -i "$INPUT" \
        -vf "fps=1/${SEGMENT_DURATION},scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:flags=lanczos,tile=${THUMB_COLS}x${THUMB_ROWS}" \
        -frames:v 1 \
        -q:v 2 \
        "$THUMB_DIR/sprite.jpg" \
        2>&1 | grep -E "(frame|fps|time)" || true
    
    # Generate thumbnail VTT file with sprite coordinates
    THUMB_VTT="$OUTPUT_DIR/thumbnails.vtt"
    SPRITE_FILENAME="thumbnails/sprite.jpg"
    
    echo "WEBVTT" > "$THUMB_VTT"
    echo "" >> "$THUMB_VTT"
    
    thumb_index=0
    current_time=0
    
    while [[ $current_time -lt $DURATION_INT ]]; do
        end_time=$((current_time + SEGMENT_DURATION))
        [[ $end_time -gt $DURATION_INT ]] && end_time=$DURATION_INT
        
        # Calculate position in sprite grid
        col=$((thumb_index % THUMB_COLS))
        row=$((thumb_index / THUMB_COLS))
        x=$((col * THUMB_WIDTH))
        y=$((row * THUMB_HEIGHT))
        
        # Format timestamps as HH:MM:SS.mmm
        start_formatted=$(printf "%02d:%02d:%02d.000" $((current_time/3600)) $(((current_time%3600)/60)) $((current_time%60)))
        end_formatted=$(printf "%02d:%02d:%02d.000" $((end_time/3600)) $(((end_time%3600)/60)) $((end_time%60)))
        
        # Write VTT cue with sprite coordinates using Media Fragments URI
        echo "${start_formatted} --> ${end_formatted}" >> "$THUMB_VTT"
        echo "${SPRITE_FILENAME}#xywh=${x},${y},${THUMB_WIDTH},${THUMB_HEIGHT}" >> "$THUMB_VTT"
        echo "" >> "$THUMB_VTT"
        
        thumb_index=$((thumb_index + 1))
        current_time=$((current_time + SEGMENT_DURATION))
    done
    
    log_info "Sprite sheet generated: $THUMB_DIR/sprite.jpg"
    log_info "Thumbnail VTT created: $THUMB_VTT"
    log_info "Sprite dimensions: $((THUMB_COLS * THUMB_WIDTH))x$((THUMB_ROWS * THUMB_HEIGHT)) pixels"
    log_info "Total thumbnails: $NUM_THUMBS (grid: ${THUMB_COLS}x${THUMB_ROWS})"
fi

#===============================================================================
# Generate encoding report
#===============================================================================
REPORT_FILE="$OUTPUT_DIR/encoding_report.txt"

cat > "$REPORT_FILE" << EOF
===============================================================================
DASH Encoding Report
Generated: $(date)
===============================================================================

SOURCE FILE: $INPUT
OUTPUT DIRECTORY: $OUTPUT_DIR
SEGMENT DURATION: ${SEGMENT_DURATION}s

SOURCE PROPERTIES:
  - Framerate: $SRC_FRAMERATE fps
  - Color Space: $SRC_COLOR_SPACE
  - Color Primaries: $SRC_COLOR_PRIMARIES
  - Transfer Characteristics: $SRC_COLOR_TRC
  - Pixel Format: $SRC_PIX_FMT
  - Audio: $(if [[ "$HAS_AUDIO" == true ]]; then echo "Yes ($SRC_AUDIO_CHANNELS channels, ${SRC_AUDIO_SAMPLE_RATE} Hz)"; else echo "None"; fi)

ENCODED VARIANTS:
EOF

for i in $(seq 0 $((NUM_VARIANTS - 1))); do
    name=${VARIANT_NAMES[$i]}
    w=${WIDTHS[$i]}
    h=${HEIGHTS[$i]}
    f=${FPS[$i]}
    vb=${VBITRATES[$i]}
    ab=${ABITRATES[$i]}
    crf=${CRFS[$i]}
    mr=${MAXRATES[$i]}
    
    if [[ "$HAS_AUDIO" == true ]]; then
        cat >> "$REPORT_FILE" << EOF
  $name:
    - Resolution: ${w}x${h}
    - Framerate: ${f}fps
    - Video Bitrate: ${vb} (CRF: $crf, Max: $mr)
    - Audio: Shared across all variants (2 streams: 128k and 64k)
    - Stream Index: Video=$i
EOF
    else
        cat >> "$REPORT_FILE" << EOF
  $name:
    - Resolution: ${w}x${h}
    - Framerate: ${f}fps
    - Video Bitrate: ${vb} (CRF: $crf, Max: $mr)
    - Stream Index: Video=$i
EOF
    fi
done

cat >> "$REPORT_FILE" << EOF

FILES GENERATED:
  - MPD Manifest: manifest.mpd
  - Init Segments: init_stream*.m4s
  - Media Segments: chunk_stream*_*.m4s
EOF

if [[ "$GENERATE_THUMBNAILS" == true ]]; then
    cat >> "$REPORT_FILE" << EOF
  - thumbnails/sprite.jpg (single sprite sheet with all thumbnails)
  - thumbnails.vtt (WebVTT with Media Fragment URIs for player scrubbing)

THUMBNAIL SPRITE INFO:
  - Individual thumbnail size: ${THUMB_WIDTH}x${THUMB_HEIGHT} pixels
  - Grid layout: ${THUMB_COLS} columns
  - VTT format uses #xywh= Media Fragment URIs for efficient single-request loading
EOF
fi

cat >> "$REPORT_FILE" << EOF

PLAYBACK:
  Use manifest.mpd with any DASH-compatible player (dash.js, Shaka Player, etc.)
  Players will automatically select appropriate quality based on bandwidth.

  For thumbnail previews, load thumbnails.vtt and sprite.jpg
  Compatible with Video.js, JW Player, Shaka Player, and other players
  that support WebVTT thumbnail tracks with sprite sheets.

ADAPTATION SETS:
  - id=0: Video representations (all resolutions)
EOF

if [[ "$HAS_AUDIO" == true ]]; then
    echo "  - id=1: Audio representations (2 streams: 128k and 64k)" >> "$REPORT_FILE"
else
    echo "  - (No audio adaptation set - source has no audio)" >> "$REPORT_FILE"
fi

echo "===============================================================================" >> "$REPORT_FILE"

log_info "Encoding report saved: $REPORT_FILE"
log_info "DASH encoding complete!"
log_info "MPD manifest: $OUTPUT_DIR/manifest.mpd"

# List generated files summary
echo ""
log_info "Generated files summary:"
ls -lh "$OUTPUT_DIR"/*.mpd 2>/dev/null || true
ls -lh "$OUTPUT_DIR"/thumbnails/ 2>/dev/null || true
echo ""
log_info "Segment files:"
ls "$OUTPUT_DIR"/*.m4s 2>/dev/null | head -20 || true
echo "..."
log_info "Total segment files: $(ls "$OUTPUT_DIR"/*.m4s 2>/dev/null | wc -l)"
