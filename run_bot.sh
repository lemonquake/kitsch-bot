#!/bin/bash

# Kitsch Bot Launcher for macOS/Linux

# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "          Kitsch Bot Launcher"
echo "========================================"
echo ""

# Check if Node.js is installed
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif [ -f "tools/node/bin/node" ]; then
    echo "Using local Node.js found in tools/node..."
    # Add local node to PATH so bundled npm and other tools can find it
    export PATH="$DIR/tools/node/bin:$PATH"
    NODE_CMD="node"
else
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org or let me handle it."
    exit 1
fi

echo "Checking Node.js version..."
$NODE_CMD --version
echo ""

# Check if dependencies are installed (optional but helpful)
if [ ! -d "node_modules" ]; then
    echo "Dependencies not found. Running installer..."
    npm install
fi

echo "Starting Kitsch Bot..."
echo ""

# Run the bot
$NODE_CMD src/index.js

echo ""
echo "Bot has stopped."
read -p "Press enter to exit..."
