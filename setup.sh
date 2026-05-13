#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║     Gmail Automation Extension — Auto Setup Script          ║
# ║     Run: bash setup.sh                                      ║
# ╚══════════════════════════════════════════════════════════════╝

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_step() { echo -e "\n${BLUE}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✅ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_err()  { echo -e "${RED}❌ $1${NC}"; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════╗"
echo "║   📧 Gmail Automation Extension Setup        ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Check Node.js ──────────────────────────────────────────────
print_step "Checking Node.js..."
if ! command -v node &> /dev/null; then
  print_err "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v)
print_ok "Node.js $NODE_VER found"

# ── Check npm ─────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
  print_err "npm is not installed"
  exit 1
fi
print_ok "npm $(npm -v) found"

# ── Install server dependencies ───────────────────────────────
print_step "Installing server dependencies..."
cd server
npm install
print_ok "Server dependencies installed"

# ── Create server .env ────────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  print_warn "Created server/.env from template — please edit it with your credentials!"
else
  print_ok "server/.env already exists"
fi
cd ..

# ── Install client dependencies ───────────────────────────────
print_step "Installing client dependencies..."
cd client
npm install
print_ok "Client dependencies installed"

# ── Create client .env ────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "REACT_APP_API_URL=http://localhost:5000/api" > .env
  print_ok "Created client/.env"
else
  print_ok "client/.env already exists"
fi
cd ..

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗"
echo "║   🎉 Setup Complete!                         ║"
echo "╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  1. Edit server/.env with your Gmail credentials:"
echo "     GMAIL_USER=your@gmail.com"
echo "     GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx"
echo "     MONGODB_URI=mongodb+srv://..."
echo ""
echo "  2. Start the backend:"
echo "     cd server && npm run dev"
echo ""
echo "  3. Start the frontend (new terminal):"
echo "     cd client && npm start"
echo ""
echo "  4. Load Chrome Extension:"
echo "     - Open chrome://extensions"
echo "     - Enable Developer Mode"
echo "     - Click 'Load unpacked'"
echo "     - Select the /extension folder"
echo ""
echo -e "  📖 Full guide: ${BLUE}README.md${NC}"
echo ""
