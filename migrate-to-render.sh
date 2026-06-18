#!/usr/bin/env bash

set -e

echo "🚀 Starting migration from Vercel → Render..."

# 1. Remove Vercel config
echo "🧹 Removing Vercel config..."
rm -f vercel.json
rm -rf .vercel

# 2. Fix server.js for Render (remove app.listen if needed)
echo "🔧 Patching server.js for Render..."

if grep -q "app.listen" server.js; then
  sed -i 's/app.listen(.*/\/\/ app.listen removed for Render/g' server.js
fi

# Ensure PORT usage exists (safe append if missing)
if ! grep -q "process.env.PORT" server.js; then
  echo "" >> server.js
  echo "const PORT = process.env.PORT || 3000;" >> server.js
  echo "app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));" >> server.js
fi

# 3. Add proper start script if missing
echo "📦 Updating package.json..."

node - <<'EOF'
const fs = require("fs");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

pkg.scripts = pkg.scripts || {};
pkg.scripts.start = "node server.js";

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
console.log("✔ package.json updated");
EOF

# 4. Clean install (optional but recommended)
echo "📦 Cleaning dependencies..."
rm -rf node_modules package-lock.json

echo "📥 Reinstalling dependencies..."
npm install

# 5. Ensure uploads folder exists
echo "📁 Ensuring uploads folder exists..."
mkdir -p uploads

# 6. Create Render config (optional but helpful)
echo "📝 Creating render.yaml..."

cat > render.yaml <<EOF
services:
  - type: web
    name: imaging-backend
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
EOF

echo "✅ Migration complete!"
echo ""
echo "👉 Next steps:"
echo "1. Push to GitHub"
echo "2. Go to https://render.com"
echo "3. Create New Web Service"
echo "4. Connect repo"
echo "5. Start command: npm start"
echo ""
echo "🔥 Your app is now Render-ready"
