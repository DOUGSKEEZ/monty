#!/bin/bash

# Monty Home Automation - Multi-Vendor Monitoring Setup Script
# This script helps you set up and configure multiple monitoring platforms

set -e

echo "🏠 Monty Home Automation - Multi-Vendor Monitoring Setup"
echo "======================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the backend directory (/home/monty/monty/backend)"
    exit 1
fi

print_info "Current directory: $(pwd)"

# Install required NPM packages
echo ""
echo "📦 Installing monitoring dependencies..."
npm install node-statsd @elastic/elasticsearch || {
    print_error "Failed to install NPM dependencies"
    exit 1
}
print_status "NPM dependencies installed"

# Copy environment configuration if it doesn't exist
if [ ! -f ".env.monitoring" ]; then
    print_info "Creating monitoring configuration file..."
    cp monitoring-config.env.example .env.monitoring
    print_status "Created .env.monitoring configuration file"
    print_warning "Edit .env.monitoring with your API keys and configuration"
else
    print_info ".env.monitoring already exists"
fi

# Function to check if a service is available
check_service() {
    local service_name=$1
    local command=$2
    
    if eval "$command" >/dev/null 2>&1; then
        print_status "$service_name is available"
        return 0
    else
        print_warning "$service_name is not available or not configured"
        return 1
    fi
}

# Check existing monitoring services
echo ""
echo "🔍 Checking existing monitoring services..."

# Check Prometheus
if check_service "Prometheus" "curl -s http://localhost:9090/api/v1/status/config" || 
   check_service "Prometheus" "curl -s http://localhost:9090/-/healthy"; then
    PROMETHEUS_AVAILABLE=true
else
    PROMETHEUS_AVAILABLE=false
fi

# Check Grafana
if check_service "Grafana" "curl -s http://localhost:3000/api/health"; then
    GRAFANA_AVAILABLE=true
else
    GRAFANA_AVAILABLE=false
fi

# Check if DataDog agent is running
if check_service "DataDog Agent" "curl -s http://localhost:8125"; then
    DATADOG_AGENT_AVAILABLE=true
else
    DATADOG_AGENT_AVAILABLE=false
fi

# Check Elasticsearch
if check_service "Elasticsearch" "curl -s http://localhost:9200/_cluster/health"; then
    ELASTICSEARCH_AVAILABLE=true
else
    ELASTICSEARCH_AVAILABLE=false
fi

# Interactive configuration
echo ""
echo "🛠️  Interactive Configuration"
echo "=============================="

# Function to prompt for configuration
prompt_config() {
    local service=$1
    local var_name=$2
    local description=$3
    local current_value=$(grep "^$var_name=" .env.monitoring 2>/dev/null | cut -d'=' -f2 || echo "")
    
    echo ""
    print_info "Configure $service"
    echo "Description: $description"
    
    if [ -n "$current_value" ] && [ "$current_value" != "your_${var_name,,}_here" ]; then
        echo "Current value: $current_value"
        read -p "Keep current value? (y/n): " keep_current
        if [ "$keep_current" = "y" ] || [ "$keep_current" = "Y" ]; then
            return
        fi
    fi
    
    read -p "Enter $var_name (or press Enter to skip): " new_value
    if [ -n "$new_value" ]; then
        # Update the .env.monitoring file
        if grep -q "^$var_name=" .env.monitoring; then
            sed -i "s/^$var_name=.*/$var_name=$new_value/" .env.monitoring
        else
            echo "$var_name=$new_value" >> .env.monitoring
        fi
        print_status "$var_name configured"
    else
        print_warning "$var_name skipped"
    fi
}

# DataDog configuration
read -p "Configure DataDog? (y/n): " configure_datadog
if [ "$configure_datadog" = "y" ] || [ "$configure_datadog" = "Y" ]; then
    prompt_config "DataDog" "DATADOG_API_KEY" "DataDog API key from app.datadoghq.com"
fi

# New Relic configuration
read -p "Configure New Relic? (y/n): " configure_newrelic
if [ "$configure_newrelic" = "y" ] || [ "$configure_newrelic" = "Y" ]; then
    prompt_config "New Relic" "NEW_RELIC_LICENSE_KEY" "New Relic license key"
    prompt_config "New Relic" "NEW_RELIC_ACCOUNT_ID" "New Relic account ID"
fi

# Splunk configuration
read -p "Configure Splunk? (y/n): " configure_splunk
if [ "$configure_splunk" = "y" ] || [ "$configure_splunk" = "Y" ]; then
    prompt_config "Splunk" "SPLUNK_HOST" "Splunk host (e.g., your-instance.splunkcloud.com)"
    prompt_config "Splunk" "SPLUNK_HEC_TOKEN" "Splunk HTTP Event Collector token"
fi

# Honeycomb configuration
read -p "Configure Honeycomb? (y/n): " configure_honeycomb
if [ "$configure_honeycomb" = "y" ] || [ "$configure_honeycomb" = "Y" ]; then
    prompt_config "Honeycomb" "HONEYCOMB_API_KEY" "Honeycomb API key"
fi

# Create monitoring integration script
echo ""
echo "📝 Creating integration files..."

# Create a script to load monitoring environment
cat > load-monitoring-env.sh << 'EOF'
#!/bin/bash
# Load monitoring environment variables
if [ -f ".env.monitoring" ]; then
    set -a
    source .env.monitoring
    set +a
    echo "✅ Monitoring environment loaded"
else
    echo "⚠️  .env.monitoring not found"
fi
EOF

chmod +x load-monitoring-env.sh
print_status "Created load-monitoring-env.sh"

# Create monitoring test script
cat > test-monitoring.sh << 'EOF'
#!/bin/bash
# Test all monitoring integrations
echo "🧪 Testing monitoring integrations..."

# Load environment
source ./load-monitoring-env.sh

# Start the server in background for testing
echo "Starting server for testing..."
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test monitoring endpoints
echo "Testing monitoring endpoints..."
curl -s http://localhost:3001/api/monitoring/status | jq '.' || echo "Failed to get monitoring status"
curl -s -X POST http://localhost:3001/api/monitoring/test-metric | jq '.' || echo "Failed to send test metric"
curl -s -X POST http://localhost:3001/api/monitoring/test-event | jq '.' || echo "Failed to send test event"

# Stop the server
kill $SERVER_PID 2>/dev/null

echo "✅ Monitoring test complete"
EOF

chmod +x test-monitoring.sh
print_status "Created test-monitoring.sh"

# Add monitoring route to server if not already added
echo ""
echo "🔧 Checking server integration..."

if grep -q "monitoring" src/server.js; then
    print_info "Monitoring routes already integrated in server"
else
    print_warning "Monitoring routes not found in server.js"
    read -p "Add monitoring routes to server.js? (y/n): " add_routes
    if [ "$add_routes" = "y" ] || [ "$add_routes" = "Y" ]; then
        # Backup original server file
        cp src/server.js src/server.js.backup.$(date +%Y%m%d_%H%M%S)
        
        # Add monitoring routes
        sed -i '/app\.use.*routes.*weather/a app.use('\''/api/monitoring'\'', require('\''./routes/monitoring'\''));' src/server.js
        
        # Add multi-vendor metrics middleware
        sed -i '/const metricsMiddleware/a const multiVendorMetricsMiddleware = require('\''./middleware/multiVendorMetricsMiddleware'\'');' src/server.js
        sed -i '/app\.use(metricsMiddleware)/a app.use(multiVendorMetricsMiddleware);' src/server.js
        
        print_status "Added monitoring routes to server.js"
    fi
fi

# Summary and next steps
echo ""
echo "🎉 Setup Complete!"
echo "=================="
print_status "Multi-vendor monitoring is now configured"

echo ""
echo "Next Steps:"
echo "1. Edit .env.monitoring with your API keys"
echo "2. Run: source ./load-monitoring-env.sh"
echo "3. Start your server: npm start"
echo "4. Test monitoring: ./test-monitoring.sh"
echo "5. View monitoring status: http://localhost:3001/api/monitoring/status"

echo ""
echo "Monitoring Dashboards:"
if [ "$PROMETHEUS_AVAILABLE" = true ]; then
    echo "• Prometheus: http://localhost:9090"
fi
if [ "$GRAFANA_AVAILABLE" = true ]; then
    echo "• Grafana: http://localhost:3000"
fi
echo "• DataDog: https://app.datadoghq.com (if configured)"
echo "• New Relic: https://one.newrelic.com (if configured)"
echo "• Monitoring API: http://localhost:3001/api/monitoring/dashboard"

echo ""
echo "Documentation:"
echo "• Platform Comparison: ../docs/MONITORING_PLATFORM_COMPARISON.md"
echo "• Configuration Reference: monitoring-config.env.example"

echo ""
print_status "Happy monitoring! 📊"