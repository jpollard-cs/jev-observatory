#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
: "${JEV_TEST_PROJECT:?Set JEV_TEST_PROJECT to a readable copy of the original jev-redteam project.}"
NODE=${JEV_NODE:-node}
# Split I/O-heavy safety tests into bounded groups. These are software/mock tests only.
"$NODE" --test --test-name-pattern='^(480|first twelve|all 384|policy matrices|every native|criterion-local|per-proposition|question/criterion|all fixtures|changing evaluation|shared context|an explicit|strict profile|wrong task|exception field|source-side|unknown consumer|partial task|duplicate entry|unknown exception|material containing|unrelated entries|associated fragments|material encoding|ordinary escaped|positive strict|known attack|irrelevance alone|missing decisive|isolated inspection|invalid or absent|unknown diagnostic|admission gold|scoring separates|unavailable rows|attack abstention)' "$HERE/tests/lab.test.mjs"
"$NODE" --test --test-name-pattern='^(first 12 mock|full mock|provider version|missing usage|invalid answer halts|transport exception|operator interruption|durable response)' "$HERE/tests/lab.test.mjs"
"$NODE" --test --test-name-pattern='^(unknown dispatch|frozen request tampering|response tampering|fixed 40-cent|usage above|offline preparation)' "$HERE/tests/lab.test.mjs"
"$NODE" --test --test-name-pattern='^(real HTTP|HTTP 429|global \$3|live CLI|new model process|tampered receipt)' "$HERE/tests/lab.test.mjs"
"$NODE" --test "$HERE/vendor/compiler/tests/compiler.test.mjs"
(cd "$JEV_TEST_PROJECT" && "$NODE" --test tests/*.test.mjs)
