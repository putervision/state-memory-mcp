#!/usr/bin/env bash
set -e

# Load NVM if present
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
    . "/usr/local/opt/nvm/nvm.sh"
fi

VERSIONS=("18" "20" "22")
ORIGINAL_VER=$(node -v 2>/dev/null || echo "")

echo "=========================================="
echo "🧪 Running Multi-Node Matrix Test Suite"
echo "=========================================="

FAILED_VERSIONS=()

for VER in "${VERSIONS[@]}"; do
    echo ""
    echo "------------------------------------------"
    echo "▶️ Testing under Node.js $VER"
    echo "------------------------------------------"
    if command -v nvm >/dev/null 2>&1; then
        if nvm use "$VER" >/dev/null 2>&1; then
            echo "Using Node $(node -v) via NVM"
            npm rebuild better-sqlite3 >/dev/null 2>&1
            if npm test; then
                echo "✅ Node $VER tests passed!"
            else
                echo "❌ Node $VER tests FAILED!"
                FAILED_VERSIONS+=("$VER")
            fi
        else
            echo "⚠️ Node $VER is not installed in NVM. Run 'nvm install $VER' to test."
        fi
    else
        echo "⚠️ NVM not found. Running tests under active Node ($(node -v))."
        npm test
        break
    fi
done

# Restore original Node version
if [ -n "$ORIGINAL_VER" ] && command -v nvm >/dev/null 2>&1; then
    nvm use "$ORIGINAL_VER" >/dev/null 2>&1 || true
    npm rebuild better-sqlite3 >/dev/null 2>&1 || true
fi

echo ""
echo "=========================================="
if [ ${#FAILED_VERSIONS[@]} -eq 0 ]; then
    echo "🎉 Multi-Node Matrix Test Suite PASSED!"
    exit 0
else
    echo "❌ Tests failed on Node version(s): ${FAILED_VERSIONS[*]}"
    exit 1
fi
