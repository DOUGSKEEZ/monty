<div align="center">
  <img src="monty.png" alt="Monty the Owl" width="200"/>
  
  # 🦉 Monty Home Automation System
  
  **An intelligent home automation platform that makes everyday living smarter**
  
  [![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
  [![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-teal.svg)](https://fastapi.tiangolo.com/)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</div>

---

## 👋 Meet Monty!

Monty is my personal home automation assistant - my digital butler who helps orchestrate daily routines through intelligent control of shades, music, weather monitoring, and scheduled automation. Ask me about the double entendre at work in the naming convention, Monty brings a playful sophistication to smart home control.

## 🏠 What Does Monty Do?

### 🌅 Automated Shade Control
- Controls AM-25/35 motorized window shades via custom RF hardware
- Scene-based automation ("Good Morning", "Good Afternoon", "Good Evening", "Good Night", "Movie Time")
- Weather-responsive adjustments based on temperature and UV levels
- Fire-and-forget command system with intelligent retry logic

### 🎵 Music & Audio Management
- Integrates with Pianobar for Pandora streaming
- Bluetooth speaker connectivity with automatic connection management
- WebSocket-based real-time music status updates

### 🌤️ Weather Intelligence
- Real-time weather monitoring via OpenWeatherMap API
- Interactive weather radar maps
- Smart caching to minimize API costs
- Weather-based automation triggers

### ⏰ Intelligent Scheduling
- Timezone-aware scheduling system
- Configurable home/away modes
- Dynamic schedule adjustments based on conditions
- Dynamic Civil twilight & Sunrise/sunset-based automation

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React Web UI  │────▶│  Node.js Backend │────▶│ FastAPI Shade   │
│   (Port 3000)   │     │   (Port 3001)    │     │ Commander (8000)│
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                │                         │
                                │                         ▼
                        ┌───────▼────────┐         ┌──────────────┐
                        │ Service Layer  │         │ C++ PWM      │
                        │ • Weather API  │         │ Decoder & db │
                        │ • Scheduler    │         └──────┬───────┘
                        │ • Pianobar     │                │
                        │ • Bluetooth    │                ▼
                        │ • Settings     │         ┌──────────────┐
                        └────────────────┘         │   Arduino +  │
                                                   │ RF Hardware  │
                     [Metrics | Logs | APM]        └──────────────┘
                      ↕️ All Components ↕️
```

## 🚀 Key Features

- **Microservices Architecture**: Modular design with separate services for each domain
- **Self-Healing Systems**: Circuit breakers, retry logic, and automatic recovery
- **Real-time Updates**: WebSocket integration for live status updates
- **Comprehensive Monitoring**: Multi-vendor metrics support (Prometheus, Grafana, DataDog, etc.)
- **Hardware Integration**: Custom Arduino-based RF transmitter for shade control
- **Smart Retry Logic**: Exponential backoff and intelligent error handling
- **Dependency Injection**: Clean, testable code architecture

## 💻 Technologies

### Backend
- **Node.js + Express**: Main application server
- **FastAPI (Python)**: Hardware interface microservice
- **SQLite**: Lightweight database for configuration
- **node-cron**: Advanced scheduling
- **Winston**: Comprehensive logging
- **Prometheus**: Metrics and monitoring

### Frontend
- **React 18**: Modern UI framework
- **Tailwind CSS**: Utility-first styling
- **Recharts**: Data visualization
- **Socket.io**: Real-time communication
- **Axios**: HTTP client

### Hardware
- **Arduino**: RF signal transmission
- **Custom RF Protocol**: 433MHz shade control
- **Raspberry Pi**: System host

## 📊 Monitoring & Observability

Monty features enterprise-grade monitoring and observability across all services:

### 🎯 Metrics Collection
- **Prometheus + Grafana**: Real-time metrics dashboards with custom panels for:
  - HTTP request rates and latencies
  - Service health status and uptime
  - Weather API usage tracking (cost optimization)
  - Shade command success rates
  - System resource utilization
- **Multi-vendor Support**: Pluggable architecture supports DataDog, New Relic, Splunk, and more
- **Business Metrics**: Track home-specific KPIs like shade movements/day, music listening patterns, and automation efficiency

### 🔍 Application Performance Monitoring (APM)
- **Distributed Tracing**: Full request lifecycle visibility across microservices
- **Service Dependency Mapping**: Automatic discovery and health tracking
- **Performance Profiling**: Identify bottlenecks and optimize response times
- **Error Tracking**: Automatic error capture with stack traces and context
- **Custom Instrumentation**: Detailed timing for hardware operations and external API calls

### 📝 Comprehensive Logging
- **Structured Logging**: JSON-formatted logs with contextual metadata
- **Log Aggregation**: Centralized logging with search and filtering capabilities
- **Log Levels**: Environment-specific verbosity (debug/info/warn/error)
- **Rotating File Logs**: Automatic log rotation with configurable retention
- **Real-time Streaming**: WebSocket integration for live log viewing

### 🚨 Alerting & Incident Response
- **Smart Alerts**: Threshold-based and anomaly detection alerts
- **Multi-channel Notifications**: Email, SMS, and dashboard alerts
- **Self-healing Triggers**: Automatic recovery procedures for common issues
- **Incident Timeline**: Full audit trail of system events and responses

Access the monitoring dashboard at `/api/dashboard` for real-time system health visualization.

## 🛠️ Development Highlights

- **Test-Driven Development**: Comprehensive test coverage
- **Clean Architecture**: SOLID principles and dependency injection
- **API Documentation**: Auto-generated FastAPI docs
- **Error Recovery**: Self-healing services with automatic retry
- **Performance Optimized**: Caching, connection pooling, and efficient algorithms

## 🎯 Problem Solving Examples

1. **RF Reliability**: Implemented fire-and-forget command pattern with intelligent retry sequences
2. **API Cost Management**: Built smart caching system to minimize weather API calls
3. **Service Resilience**: Added circuit breakers and health monitoring for all external dependencies
4. **User Experience**: Created intuitive scene-based controls for complex multi-shade operations

## 📝 Future Enhancements

- [ ] Additional IoT device support
- [ ] Voice control integration
- [ ] Open to ideas!


---

<div align="center">
  <p><i>Built with ❤️ by a noob</i></p>
</div>
