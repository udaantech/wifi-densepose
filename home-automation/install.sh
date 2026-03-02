#!/bin/bash
#
# WiFi DensePose Home Automation Installer
# 
# Usage: ./install.sh [options]
#   --with-mqtt       Include MQTT broker
#   --with-logging    Include InfluxDB + Grafana
#   --with-esp32      Setup ESP32 hardware support
#   --ha-path PATH    Path to Home Assistant config (default: ~/homeassistant)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
WITH_MQTT=false
WITH_LOGGING=false
WITH_ESP32=false
HA_PATH="${HOME}/homeassistant"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --with-mqtt)
            WITH_MQTT=true
            shift
            ;;
        --with-logging)
            WITH_LOGGING=true
            shift
            ;;
        --with-esp32)
            WITH_ESP32=true
            shift
            ;;
        --ha-path)
            HA_PATH="$2"
            shift 2
            ;;
        --help)
            echo "WiFi DensePose Home Automation Installer"
            echo ""
            echo "Options:"
            echo "  --with-mqtt       Include MQTT broker for Home Assistant"
            echo "  --with-logging    Include InfluxDB + Grafana for data logging"
            echo "  --with-esp32      Setup ESP32 hardware support"
            echo "  --ha-path PATH    Path to Home Assistant config (default: ~/homeassistant)"
            echo ""
            echo "Examples:"
            echo "  ./install.sh                          # Basic setup"
            echo "  ./install.sh --with-mqtt              # With MQTT for HA"
            echo "  ./install.sh --with-mqtt --with-esp32 # Full setup with hardware"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  WiFi DensePose Home Automation Setup${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    print_step "Checking Docker..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker not found. Please install Docker first:"
        echo "  https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose not found. Please install Docker Compose:"
        echo "  https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    print_success "Docker is installed"
}

check_ports() {
    print_step "Checking port availability..."
    
    local ports=("3000" "3001" "5005")
    
    if [ "$WITH_MQTT" = true ]; then
        ports+=("1883" "9001")
    fi
    
    if [ "$WITH_LOGGING" = true ]; then
        ports+=("8086" "3002")
    fi
    
    for port in "${ports[@]}"; do
        if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "Port $port is already in use"
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    done
    
    print_success "Ports checked"
}

setup_directories() {
    print_step "Creating directories..."
    
    mkdir -p "$PROJECT_ROOT/mqtt/data"
    mkdir -p "$PROJECT_ROOT/mqtt/log"
    mkdir -p "$PROJECT_ROOT/influxdb/data"
    mkdir -p "$PROJECT_ROOT/grafana/data"
    mkdir -p "$PROJECT_ROOT/grafana/provisioning"
    mkdir -p "$PROJECT_ROOT/nodered/data"
    
    print_success "Directories created"
}

start_services() {
    print_step "Starting WiFi DensePose services..."
    
    cd "$PROJECT_ROOT"
    
    local compose_args=""
    
    if [ "$WITH_MQTT" = true ]; then
        compose_args="$compose_args --profile mqtt"
    fi
    
    if [ "$WITH_LOGGING" = true ]; then
        compose_args="$compose_args --profile logging"
    fi
    
    if [ -n "$compose_args" ]; then
        # shellcheck disable=SC2086
        docker compose -f docker-compose.home.yml $compose_args up -d
    else
        docker compose -f docker-compose.home.yml up -d
    fi
    
    print_success "Services started"
}

setup_home_assistant() {
    print_step "Setting up Home Assistant integration..."
    
    if [ ! -d "$HA_PATH" ]; then
        print_warning "Home Assistant directory not found at $HA_PATH"
        echo "To manually add the configuration:"
        echo "  1. Copy the contents of home-automation/home-assistant/configuration.yaml"
        echo "  2. Paste into your Home Assistant configuration.yaml"
        return
    fi
    
    # Backup existing config
    if [ -f "$HA_PATH/configuration.yaml" ]; then
        cp "$HA_PATH/configuration.yaml" "$HA_PATH/configuration.yaml.backup.$(date +%Y%m%d%H%M%S)"
        print_success "Backup created"
    fi
    
    # Append our configuration
    echo "" >> "$HA_PATH/configuration.yaml"
    echo "# WiFi DensePose Integration (added by installer)" >> "$HA_PATH/configuration.yaml"
    echo "" >> "$HA_PATH/configuration.yaml"
    cat "$SCRIPT_DIR/home-assistant/configuration.yaml" >> "$HA_PATH/configuration.yaml"
    
    print_success "Home Assistant configuration updated"
    print_warning "Please restart Home Assistant to apply changes"
}

setup_python_monitor() {
    print_step "Setting up Python monitoring script..."
    
    if command -v pip3 &> /dev/null; then
        pip3 install -r "$SCRIPT_DIR/scripts/requirements.txt" --user
        print_success "Python dependencies installed"
    else
        print_warning "pip3 not found. Skipping Python setup."
        echo "To install manually: pip install -r home-automation/scripts/requirements.txt"
    fi
}

print_summary() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Access your WiFi DensePose system:"
    echo "  Web UI:        http://localhost:3000"
    echo "  REST API:      http://localhost:3000/api/v1/"
    echo "  WebSocket:     ws://localhost:3001/ws/sensing"
    echo ""
    
    if [ "$WITH_LOGGING" = true ]; then
        echo "Data Logging:"
        echo "  Grafana:       http://localhost:3002 (admin/wifisensing123)"
        echo "  InfluxDB:      http://localhost:8086"
        echo ""
    fi
    
    if [ "$WITH_MQTT" = true ]; then
        echo "MQTT Broker:"
        echo "  Host:          localhost:1883"
        echo "  WebSocket:     ws://localhost:9001"
        echo ""
    fi
    
    echo "Useful commands:"
    echo "  View logs:     docker logs -f wifi-densepose"
    echo "  Stop services: docker compose -f docker-compose.home.yml down"
    echo "  Restart:       docker compose -f docker-compose.home.yml restart"
    echo ""
    
    if [ "$WITH_ESP32" = true ]; then
        echo -e "${YELLOW}Next Steps for ESP32 Hardware:${NC}"
        echo "  1. Order 2-3x ESP32-S3-DevKitC-1 boards (~\$8 each)"
        echo "  2. Follow:     home-automation/esp32/SETUP.md"
        echo "  3. Flash with: python scripts/provision.py"
        echo ""
    fi
    
    echo -e "${BLUE}Start monitoring:${NC}"
    echo "  python home-automation/scripts/wifi_monitor.py"
    echo ""
}

# Main
main() {
    print_header
    
    check_docker
    check_ports
    setup_directories
    start_services
    
    if command -v pip3 &> /dev/null; then
        setup_python_monitor
    fi
    
    if [ -d "$HA_PATH" ]; then
        read -p "Set up Home Assistant integration? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            setup_home_assistant
        fi
    fi
    
    print_summary
}

main "$@"
