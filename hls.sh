#!/bin/bash
#===============================================================================
# HLS Adaptive Bitrate Encoding Script
# Generates multi-resolution HLS streams with master playlist and thumbnail sprite
# Handles videos with or without audio tracks
#===============================================================================

set -euo pipefail

# Default values
INPUT=""
OUTPUT_DIR="./assets/hls"
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
    -o, --output        Output directory (default: ./assets/hls)
    -s, --segment       Segment duration in seconds (default: 10)
    -t, --no-thumbnails Disable thumbnail generation
    -h, --help          Show this help message

Example:
    $(basename "$0") -i source_video.mp4 -o ./output/hls -s 10
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

log_info "Starting HLS encoding..."
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
# Using CRF for consistent quality with maxrate/bufsize for bandwidth control
#===============================================================================

# Video encoding base parameters for quality preservation
VIDEO_PRESET="slow"  # Better compression efficiency
VIDEO_TUNE="film"    # Optimize for high-quality source material
VIDEO_PROFILE="high"
VIDEO_LEVEL="4.2"    # Supports up to 1080p60

# HLS specific options
HLS_OPTS="-hls_time $SEGMENT_DURATION -hls_playlist_type vod -hls_flags independent_segments"

#===============================================================================
# Encoding Variants - Resolution@Framerate with optimized bitrates
# Using CRF with maxrate/bufsize for quality-constrained ABR
#===============================================================================

declare -A VARIANTS=(
    # [name]="width:height:fps:video_bitrate:audio_bitrate:crf:maxrate:bufsize"
    ["1080p60"]="1920:1080:60:8000k:192k:18:9000k:18000k"
    ["936p30"]="1664:936:30:5000k:128k:19:5500k:11000k"
    ["810p30"]="1440:810:30:4000k:128k:20:4500k:9000k"
    ["720p30"]="1280:720:30:2800k:128k:20:3100k:6200k"
    ["576p30"]="1024:576:30:1800k:96k:21:2000k:4000k"
    ["480p30"]="854:480:30:1200k:96k:22:1400k:2800k"
    ["360p30"]="640:360:30:800k:64k:23:900k:1800k"
)

# Ordered list for master playlist (highest to lowest)
VARIANT_ORDER=("1080p60" "936p30" "810p30" "720p30" "576p30" "480p30" "360p30")

#===============================================================================
# Encode each variant
#===============================================================================

for variant in "${VARIANT_ORDER[@]}"; do
    IFS=':' read -r width height fps vbitrate abitrate crf maxrate bufsize <<< "${VARIANTS[$variant]}"
    
    log_info "Encoding $variant (${width}x${height}@${fps}fps, video: ${vbitrate}$(if [[ "$HAS_AUDIO" == true ]]; then echo ", audio: ${abitrate}"; fi))..."
    
    # Calculate keyframe interval based on target fps
    keyint=$((SEGMENT_DURATION * fps))
    
    # Build ffmpeg command based on whether audio exists
    if [[ "$HAS_AUDIO" == true ]]; then
        ffmpeg -y -i "$INPUT" \
            -vf "scale=${width}:${height}:flags=lanczos,fps=${fps}" \
            -c:v libx264 \
            -preset "$VIDEO_PRESET" \
            -tune "$VIDEO_TUNE" \
            -profile:v "$VIDEO_PROFILE" \
            -level:v "$VIDEO_LEVEL" \
            -crf "$crf" \
            -maxrate "$maxrate" \
            -bufsize "$bufsize" \
            -colorspace "$SRC_COLOR_SPACE" \
            -color_primaries "$SRC_COLOR_PRIMARIES" \
            -color_trc "$SRC_COLOR_TRC" \
            -pix_fmt "$SRC_PIX_FMT" \
            -g "$keyint" \
            -keyint_min "$keyint" \
            -sc_threshold 0 \
            -bf 3 \
            -b_strategy 2 \
            -refs 4 \
            -c:a aac \
            -b:a "$abitrate" \
            -ac "$SRC_AUDIO_CHANNELS" \
            -ar "$SRC_AUDIO_SAMPLE_RATE" \
            $HLS_OPTS \
            -hls_segment_filename "$OUTPUT_DIR/${variant}_%d.ts" \
            "$OUTPUT_DIR/${variant}.m3u8" \
            2>&1 | grep -E "(frame|fps|time|bitrate|speed)" || true
    else
        # Video only - no audio encoding
        ffmpeg -y -i "$INPUT" \
            -vf "scale=${width}:${height}:flags=lanczos,fps=${fps}" \
            -c:v libx264 \
            -preset "$VIDEO_PRESET" \
            -tune "$VIDEO_TUNE" \
            -profile:v "$VIDEO_PROFILE" \
            -level:v "$VIDEO_LEVEL" \
            -crf "$crf" \
            -maxrate "$maxrate" \
            -bufsize "$bufsize" \
            -colorspace "$SRC_COLOR_SPACE" \
            -color_primaries "$SRC_COLOR_PRIMARIES" \
            -color_trc "$SRC_COLOR_TRC" \
            -pix_fmt "$SRC_PIX_FMT" \
            -g "$keyint" \
            -keyint_min "$keyint" \
            -sc_threshold 0 \
            -bf 3 \
            -b_strategy 2 \
            -refs 4 \
            -an \
            $HLS_OPTS \
            -hls_segment_filename "$OUTPUT_DIR/${variant}_%d.ts" \
            "$OUTPUT_DIR/${variant}.m3u8" \
            2>&1 | grep -E "(frame|fps|time|bitrate|speed)" || true
    fi
    
    log_info "Completed $variant"
done

#===============================================================================
# Generate Master Playlist
#===============================================================================
log_info "Generating master playlist..."

MASTER_PLAYLIST="$OUTPUT_DIR/master.m3u8"

cat > "$MASTER_PLAYLIST" << 'EOF'
#EXTM3U
#EXT-X-VERSION:6
## Generated HLS Master Playlist
## Adaptive Bitrate Streaming with multiple quality levels

EOF

# Add variants to master playlist (bandwidth in bits/sec)
for variant in "${VARIANT_ORDER[@]}"; do
    IFS=':' read -r width height fps vbitrate abitrate crf maxrate bufsize <<< "${VARIANTS[$variant]}"
    
    # Convert bitrates to bits/second for playlist
    vbits=$(echo "$vbitrate" | sed 's/k/000/')
    
    if [[ "$HAS_AUDIO" == true ]]; then
        abits=$(echo "$abitrate" | sed 's/k/000/')
        bandwidth=$((vbits + abits))
        codecs="avc1.640028,mp4a.40.2"
    else
        bandwidth=$vbits
        codecs="avc1.640028"
    fi
    
    avg_bandwidth=$((bandwidth * 85 / 100))  # Average is typically ~85% of max
    
    cat >> "$MASTER_PLAYLIST" << EOF
#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${avg_bandwidth},RESOLUTION=${width}x${height},FRAME-RATE=${fps}.000,CODECS="${codecs}",CLOSED-CAPTIONS=NONE
${variant}.m3u8
EOF
done

log_info "Master playlist created: $MASTER_PLAYLIST"

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
HLS Encoding Report
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

for variant in "${VARIANT_ORDER[@]}"; do
    IFS=':' read -r width height fps vbitrate abitrate crf maxrate bufsize <<< "${VARIANTS[$variant]}"
    
    if [[ "$HAS_AUDIO" == true ]]; then
        cat >> "$REPORT_FILE" << EOF
  $variant:
    - Resolution: ${width}x${height}
    - Framerate: ${fps}fps
    - Video Bitrate: ${vbitrate} (CRF: $crf, Max: $maxrate)
    - Audio Bitrate: ${abitrate}
    - Playlist: ${variant}.m3u8
EOF
    else
        cat >> "$REPORT_FILE" << EOF
  $variant:
    - Resolution: ${width}x${height}
    - Framerate: ${fps}fps
    - Video Bitrate: ${vbitrate} (CRF: $crf, Max: $maxrate)
    - Playlist: ${variant}.m3u8
EOF
    fi
done

cat >> "$REPORT_FILE" << EOF

FILES GENERATED:
  - Master Playlist: master.m3u8
EOF

for variant in "${VARIANT_ORDER[@]}"; do
    echo "  - ${variant}.m3u8 + segments" >> "$REPORT_FILE"
done

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
  Use master.m3u8 with any HLS-compatible player.
  Players will automatically select appropriate quality based on bandwidth.
  
  For thumbnail previews, load thumbnails.vtt and sprite.jpg
  Compatible with Video.js, JW Player, Shaka Player, and other players
  that support WebVTT thumbnail tracks with sprite sheets.
===============================================================================
EOF

log_info "Encoding report saved: $REPORT_FILE"
log_info "HLS encoding complete!"
log_info "Master playlist: $OUTPUT_DIR/master.m3u8"

# List generated files
echo ""
log_info "Generated files:"
ls -lh "$OUTPUT_DIR"/*.m3u8 2>/dev/null || true
ls -lh "$OUTPUT_DIR"/thumbnails/ 2>/dev/null || true
