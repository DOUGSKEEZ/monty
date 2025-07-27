#!/bin/bash

# Monty Home Automation - Custom Tmux Layout
# Window 0: All services in one view
# Window 1: Monitor + console  
# Window 2: Dual consoles

SESSION_NAME="monty"

echo "🏠 Starting Monty Home Automation with YOUR custom layout..."

# Kill existing session if it exists
tmux kill-session -t $SESSION_NAME 2>/dev/null

# Create logs directory
mkdir -p ~/monty/logs

echo "🚀 Creating tmux session '$SESSION_NAME'..."

# ======================
# WINDOW 0: "Services" - All services in one window
# ======================
tmux new-session -d -s $SESSION_NAME -n "Services"

# Start with Backend in main pane
tmux send-keys -t $SESSION_NAME:Services "cd ~/monty/backend" C-m
tmux send-keys -t $SESSION_NAME:Services "echo '🚀 Starting Backend...'" C-m
tmux send-keys -t $SESSION_NAME:Services "./dev.sh" C-m

# Split vertically to create Middle panel (ShadeCommander)
tmux split-window -h -t $SESSION_NAME:Services
tmux send-keys -t $SESSION_NAME:Services.1 "cd ~/monty/shades/commander" C-m
tmux send-keys -t $SESSION_NAME:Services.1 "echo '🫡 Starting ShadeCommander...'" C-m
tmux send-keys -t $SESSION_NAME:Services.1 "./start-shadecommander.sh" C-m

# Split the right panel vertically to create Right-top (Frontend) and Right-bottom (Console)
tmux split-window -v -t $SESSION_NAME:Services.1
tmux send-keys -t $SESSION_NAME:Services.2 "cd ~/monty/frontend" C-m
tmux send-keys -t $SESSION_NAME:Services.2 "echo '⚛️ Starting Frontend...'" C-m
tmux send-keys -t $SESSION_NAME:Services.2 "npm start" C-m

# Split the right-bottom to create the console panel
tmux split-window -v -t $SESSION_NAME:Services.2
tmux send-keys -t $SESSION_NAME:Services.3 "cd ~/monty" C-m
tmux send-keys -t $SESSION_NAME:Services.3 "echo '💻 General Console Ready'" C-m
tmux send-keys -t $SESSION_NAME:Services.3 "echo 'Run: ./monitor-monty.sh to check service status'" C-m

# Resize panes to get the layout just right
# Make left panel (Backend) wider, right panels smaller
tmux resize-pane -t $SESSION_NAME:Services.0 -x 40%   # Backend gets 40% width
tmux resize-pane -t $SESSION_NAME:Services.1 -x 30%   # ShadeCommander gets 30% width
# Right side (Frontend + Console) gets remaining 30% width


# ======================
# FINAL SETUP
# ======================

# Start on the Services window
tmux select-window -t $SESSION_NAME:Services

echo "✅ Custom tmux session '$SESSION_NAME' created!"
echo ""
echo "🎨 YOUR CUSTOM LAYOUT:"
echo ""
echo "📺 Window 0: 'Services' - All services in view"
echo "   ┌─────────────┬─────────────┬─────────────┐"
echo "   │             │             │ Frontend    │"
echo "   │   Backend   │ShadeCommndr │ ⚛️          │"
echo "   │   🚀        │    🫡       ├─────────────┤"
echo "   │             │             │ Console 💻  │"
echo "   └─────────────┴─────────────┴─────────────┘"
echo ""
echo "📺 Window 1: 'Monitor' - Monitoring + console"
echo "   ┌─────────────────────────────────────────┐"
echo "   │ Monitor Commands (./monitor-monty.sh)   │"
echo "   ├─────────────────────────────────────────┤"
echo "   │ Console 💻                              │"
echo "   └─────────────────────────────────────────┘"
echo ""
echo "📺 Window 2: 'Console' - Dual terminals"
echo "   ┌─────────────────┬───────────────────────┐"
echo "   │ Left Console 💻 │ Right Console 💻      │"
echo "   │                 │                       │"
echo "   └─────────────────┴───────────────────────┘"
echo ""
echo "🔧 Navigation:"
echo "   Ctrl+b, 0    # Services window (all your apps)"
echo "   Ctrl+b, 1    # Monitor window"  
echo "   Ctrl+b, 2    # Console window"
echo "   Mouse click  # Switch between panes"
echo "   Ctrl+b, d    # Detach (everything keeps running)"
echo ""
echo "🚀 Attaching to session in 3 seconds..."
sleep 3
tmux attach -t $SESSION_NAME
