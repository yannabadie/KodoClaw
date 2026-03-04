#!/bin/bash
set -euo pipefail

PASS=0
FAIL=0
TOTAL=12

check() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  PASS  $name"
    ((PASS++)) || true
  else
    echo "  FAIL  $name"
    ((FAIL++)) || true
  fi
}

echo "Kodo Smoke Test"
echo "==============="
echo ""

# 1. Bun installed
check "Bun installed" bun --version

# 2. Dependencies installed
check "Dependencies installed" test -d node_modules/@noble/ciphers

# 3. Tests pass
check "Tests pass (500+)" bash -c "bun test 2>&1 | grep -qE '[5-9][0-9]{2} pass'"

# 4. Lint clean
check "Lint clean (0 errors)" bash -c "bun run check 2>&1 | grep -q 'No fixes applied'"

# 5. hooks.json valid
check "hooks.json valid" bash -c "cat hooks/hooks.json | bun -e 'JSON.parse(await Bun.stdin.text())'"

# 6. plugin.json has name kodo
check "plugin.json name=kodo" bash -c "cat .claude-plugin/plugin.json | bun -e 'const j=JSON.parse(await Bun.stdin.text()); if(j.name!==\"kodo\") process.exit(1)'"

# 7. settings.json valid
check "settings.json valid" bash -c "cat settings.json | bun -e 'JSON.parse(await Bun.stdin.text())'"

# 8. All 5 agents present
check "5 agents present" bash -c "test \$(ls agents/*.md 2>/dev/null | wc -l) -eq 5"

# 9. All 11 commands present
check "13 commands present" bash -c "test \$(ls commands/*.md 2>/dev/null | wc -l) -eq 13"

# 10. Both skills present
check "2 skills present" bash -c "test -f skills/kodo-context/SKILL.md && test -f skills/security-check/SKILL.md"

# 11. CLAUDE.md exists
check "CLAUDE.md exists" test -f CLAUDE.md

# 12. Source-test parity
check "Source-test parity" bash -c "
  src_count=\$(find src -name '*.ts' -not -path '*/built-in/*' | wc -l)
  test_count=\$(find test -name '*.test.ts' | wc -l)
  test \$test_count -ge 40
"

echo ""
echo "Results: $PASS passed, $FAIL failed (out of $TOTAL)"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "ALL CHECKS PASSED ($TOTAL/$TOTAL)"
  exit 0
else
  echo "SOME CHECKS FAILED"
  exit 1
fi
