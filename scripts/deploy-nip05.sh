#!/bin/bash
# Quick deployment script for NIP-05 verification system
# Run this after reviewing all changes

set -e

echo "🚀 NIP-05 Verification System Deployment"
echo "========================================"
echo ""

# Check we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the relay.pleb.one directory"
    exit 1
fi

echo "📦 Step 1: Installing dependencies..."
npm install

echo ""
echo "🗄️  Step 2: Generating Prisma client..."
npm run db:generate

echo ""
echo "📋 Step 3: Checking TypeScript..."
npm run type-check

echo ""
echo "🔄 Step 4: Applying database migration..."
read -p "Apply database migration now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run db:push
    echo "✅ Database migration applied"
else
    echo "⚠️  Skipped migration. Run 'npm run db:push' manually later."
fi

echo ""
echo "🏗️  Step 5: Building application..."
npm run build

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Update pleb.one Caddyfile (see Caddyfile.pleb.one.snippet)"
echo "   2. Restart application: docker-compose restart app"
echo "   3. Reload Caddy on both servers"
echo "   4. Test: curl 'https://relay.pleb.one/.well-known/nostr.json?name=test'"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions"
