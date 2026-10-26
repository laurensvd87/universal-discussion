"""Default inert. ADR148 browser-only fixed-artifact reobservation; owned Win32 Job only."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

args = sys.argv[1:]
if not args:
    print('No action. Reviewed root-written freeze and explicit fixed phase required.')
    raise SystemExit(0)
if sys.platform != 'win32':
    raise SystemExit('Only fixed Windows supervised phases are supported')
if args == ['--admit-captures']:
    PHASE, BATCH = 'admit-captures', None
elif args == ['--evaluate']:
    PHASE, BATCH = 'evaluate', None
elif len(args) == 2 and args[0] == '--encode-batch' and args[1] in [str(i) for i in range(1, 9)]:
    PHASE, BATCH = 'encode-batch', int(args[1])
else:
    raise SystemExit('Unsupported fixed phase')
TOKEN = PHASE + (('-' + str(BATCH).zfill(2)) if BATCH is not None else '')
WALL_LIMIT, ACTIVE_LIMIT = 180, 170
started = time.monotonic()
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
if HERE.drive.upper() != 'D:':
    raise SystemExit('Evaluation must remain on D drive')
TARGET = HERE / 'run.js'
OUTPUT = HERE / ('output-encode-' + str(BATCH).zfill(2) if BATCH is not None else 'output-evaluation' if PHASE == 'evaluate' else 'output-admit-captures')
if not TARGET.is_file() or TARGET.is_symlink() or OUTPUT.exists() or OUTPUT.is_symlink():
    raise SystemExit('Missing target or existing evidence prohibits replay')
MIB = 1048576
MEMORY_LIMIT, MAX_BYTES = 1536 * MIB, 512 * 1024
RESULT_NAME = 'encoding.json' if BATCH is not None else 'result.json' if PHASE == 'evaluate' else 'capture-admission.json'
SOURCE_NAMES = [
  "apps/local-service/data/hierarchy-browser-root-artifact-reuse-adr148.json",
  "apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json",
  "apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json",
  "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/README.md",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/contracts.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/contracts.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/manifest.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/methods.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/methods.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/protocol.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/run.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/supervise.py",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/vector-packet.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/vector-packet.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/verify.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v2/contracts.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
  "apps/local-service/src/crawler/packaged-e5.js",
  "apps/local-service/src/crawler/public-fetch.js",
  "apps/local-service/src/crawler/robots.js",
  "apps/local-service/src/crawler/static-capture.js",
  "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
  "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
  "decisions/ADR-148-browser-input-transfer-with-fixed-root-model.md",
  "spikes/topic-resolution/browser/chromium/page-content-reader.js",
  "spikes/topic-resolution/browser/core/page-content-policy.js",
  "spikes/topic-resolution/browser/embedding/embedding-contract.js",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/README.md",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/artifact-reuse.js",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/artifact-reuse.test.mjs",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/manifest.js",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/manifest.test.mjs",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/policy.js",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/policy.test.mjs",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/producer-profiles.js",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/protocol.json",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/run.mjs",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/run.test.mjs",
  "spikes/topic-resolution/harness/browser-root-transfer-v1/supervise.py",
  "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
  "spikes/topic-resolution/harness/current-producer-final-v1/policy.js",
  "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json",
  "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs",
  "spikes/topic-resolution/harness/current-producer-final-v2/manifest.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
  "spikes/topic-resolution/harness/deny-external-capabilities.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/LICENSE",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/NOTICE",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/README.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/ThirdPartyNotices.txt",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/install_media_pack.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/install_webkit_wsl.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_chrome_beta_linux.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_chrome_beta_mac.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_chrome_beta_win.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_chrome_stable_linux.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_chrome_stable_mac.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_chrome_stable_win.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_beta_linux.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_beta_mac.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_beta_win.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_dev_linux.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_dev_mac.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_dev_win.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_stable_linux.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_stable_mac.sh",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/bin/reinstall_msedge_stable_win.ps1",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/browsers.json",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/cli.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/index.d.ts",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/index.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/index.mjs",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/bootstrap.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/coreBundle.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/entry/cliDaemon.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/entry/dashboardApp.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/entry/mcp.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/entry/oopBrowserDownload.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/package.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/server/chromium/appIcon.png",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/server/electron/loader.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/serverRegistry.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/serverRegistry.js.LICENSE",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/channelSessions.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/cli.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/help.json",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/minimist.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/output.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/program.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/registry.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/cli-client/session.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/dashboard/appIcon.png",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/SKILL.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/element-attributes.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/playwright-tests.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/pr-attachments.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/request-mocking.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/running-code.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/session-management.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/storage-state.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/test-generation.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/tracing.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-cli/references/video-recording.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-component-testing/SKILL.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-component-testing/references/gallery-spec.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-component-testing/references/migration.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-component-testing/references/react.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-component-testing/references/typing.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-component-testing/references/vue.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/skills/playwright-trace/SKILL.md",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/utils/extension.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/tools/utils/socketConnection.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/utilsBundle.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/utilsBundle.js.LICENSE",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/codeMirrorModule--QdMvsKi.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/codeMirrorModule-CQ8RZGBm.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/codicon-DCmgc-ay.ttf",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/firefox-1bWoP6pv.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/firefox-beta-k3eOH_eK.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/firefox-nightly-Cp5nfeDT.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/index-AwgwcYie.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/index-hRvO4yU2.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/assets/safari-na3_-uQk.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/index.html",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/dashboard/playwright-logo.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/htmlReport/index.html",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/htmlReport/report.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/htmlReport/report.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/assets/codeMirrorModule--QdMvsKi.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/assets/codeMirrorModule-DK72OMRi.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/assets/codicon-DCmgc-ay.ttf",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/assets/index-BZpYJZ-P.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/assets/index-Cn0mmDuv.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/index.html",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/recorder/playwright-logo.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/assets/codeMirrorModule-BEB2e8M3.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/assets/defaultSettingsView-D-g2vrvf.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/assets/urlMatch-L3liM589.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/assets/xtermModule-B794rD2Z.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/codeMirrorModule.-QdMvsKi.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/codicon.DCmgc-ay.ttf",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/defaultSettingsView.C8BeHuxd.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/index.B_TqY17P.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/index.html",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/index.oNry3Hjv.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/manifest.webmanifest",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/playwright-logo.svg",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/snapshot.B_Jk1wbt.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/snapshot.html",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/sw.bundle.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/uiMode.CYwC_gH1.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/uiMode.CyMfwkXJ.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/uiMode.html",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/vite/traceViewer/xtermModule.kHJ-D0s7.css",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/webp_codec.LICENSE",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/webp_codec.wasm",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/lib/xdg-open",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/package.json",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/types/protocol.d.ts",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/types/structs.d.ts",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core/types/types.d.ts",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package.json"
]
FIT = 'apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/'
CAP = 'spikes/topic-resolution/harness/browser-root-transfer-v1/'
EVAL = 'apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/'
FIXED_INPUT_NAMES = [
    FIT + 'freeze.json', FIT + 'output/supervisor.json', FIT + 'output/selection-receipt.json',
    FIT + 'output/selection.json', FIT + 'output/root-model.json', FIT + 'output/root-policy.json', FIT + 'output/input-definition.json',
    'apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json',
    'apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json',
    'apps/local-service/data/hierarchy-browser-root-artifact-reuse-adr148.json',
    'spikes/topic-resolution/browser/embedding/.assets/manifest.json']
class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [
        (key, ctypes.c_ulonglong) for key in ('totalPhysical', 'availablePhysical', 'totalPageFile',
        'availablePageFile', 'totalVirtual', 'availableVirtual', 'availableExtended')]

class ProcessMemory(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
        (key, ctypes.c_size_t) for key in ('peakWorkingSet', 'workingSet', 'peakPagedPool', 'pagedPool',
        'peakNonPagedPool', 'nonPagedPool', 'pagefile', 'peakPagefile', 'privateUsage')]

class BasicLimits(ctypes.Structure):
    _fields_ = [('perProcessUserTime', ctypes.c_longlong), ('perJobUserTime', ctypes.c_longlong),
        ('limitFlags', wintypes.DWORD), ('minimumWorkingSet', ctypes.c_size_t), ('maximumWorkingSet', ctypes.c_size_t),
        ('activeProcessLimit', wintypes.DWORD), ('affinity', ctypes.c_size_t),
        ('priorityClass', wintypes.DWORD), ('schedulingClass', wintypes.DWORD)]

class IoCounters(ctypes.Structure):
    _fields_ = [(key, ctypes.c_ulonglong) for key in ('readOperations', 'writeOperations', 'otherOperations',
        'readBytes', 'writeBytes', 'otherBytes')]

class ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', BasicLimits), ('io', IoCounters), ('processMemoryLimit', ctypes.c_size_t),
        ('jobMemoryLimit', ctypes.c_size_t), ('peakProcessMemoryUsed', ctypes.c_size_t), ('peakJobMemoryUsed', ctypes.c_size_t)]

class JobPids(ctypes.Structure):
    _fields_ = [('assigned', wintypes.DWORD), ('listed', wintypes.DWORD), ('pids', ctypes.c_size_t * 128)]

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)
kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
kernel.CreateJobObjectW.restype = wintypes.HANDLE
kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
kernel.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]
kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
kernel.IsProcessInJob.argtypes = [wintypes.HANDLE, wintypes.HANDLE, ctypes.POINTER(wintypes.BOOL)]
kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MemoryStatus)]
psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemory), wintypes.DWORD]

def headroom():
    status = MemoryStatus()
    status.length = ctypes.sizeof(status)
    if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
        raise RuntimeError('host-memory-unverifiable')
    if min(status.availablePhysical, status.availablePageFile) < 1024 * MIB:
        raise RuntimeError('host-memory-reserve-unavailable')
    if shutil.disk_usage('C:\\').free < 768 * MIB or shutil.disk_usage('D:\\').free < 512 * MIB:
        raise RuntimeError('drive-reserve-unavailable')

def job_members(job):
    members = JobPids()
    if not kernel.QueryInformationJobObject(job, 3, ctypes.byref(members), ctypes.sizeof(members), None):
        raise RuntimeError('job-pid-list-unverifiable-or-overflow')
    if members.assigned > 128 or members.listed > 128 or members.listed != members.assigned:
        raise RuntimeError('job-pid-capacity')
    return members

def tree_memory(job):
    members = job_members(job)
    rss = private = 0
    for pid in members.pids[:members.listed]:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, pid)
        if not handle:
            # Exit races are not silently treated as zero memory: fail closed.
            raise RuntimeError('job-member-memory-unverifiable')
        try:
            belongs = wintypes.BOOL()
            if not kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)) or not belongs.value:
                raise RuntimeError('opened-process-not-confirmed-in-own-job')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                raise RuntimeError('job-member-memory-unverifiable')
            rss += memory.workingSet
            private += memory.privateUsage
        finally:
            kernel.CloseHandle(handle)
    return rss, private, members.listed


def fixed_bytes(path, maximum=MIB):
    before = path.lstat()
    if not path.is_file() or path.is_symlink() or getattr(before, 'st_file_attributes', 0) & 0x400 or not 0 < before.st_size <= maximum:
        raise RuntimeError('bounded-fixed-file-unavailable')
    if str(path.resolve()).lower() != str(path.absolute()).lower():
        raise RuntimeError('fixed-file-reparse-refused')
    value = path.read_bytes()
    after = path.lstat()
    if len(value) != before.st_size or (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_size, before.st_mtime_ns, before.st_ctime_ns):
        raise RuntimeError('fixed-file-changed-during-read')
    return value

def sha(value):
    return hashlib.sha256(value).hexdigest()

def digest(path):
    return sha(fixed_bytes(path, 4 * MIB))

def artifact_capacity():
    count = total = 0
    pending = [OUTPUT]
    while pending:
        directory = pending.pop()
        for entry in directory.iterdir():
            st = entry.lstat()
            if entry.is_symlink() or getattr(st, 'st_file_attributes', 0) & 0x400:
                raise RuntimeError('own-output-reparse-refused')
            count += 1
            if count > 1024:
                raise RuntimeError('own-output-file-capacity')
            if entry.is_dir():
                pending.append(entry)
            elif entry.is_file():
                total += st.st_size
                if total > 64 * MIB:
                    raise RuntimeError('own-temp-and-output-capacity')
            else:
                raise RuntimeError('own-output-type-refused')
    evidence = sum(p.stat().st_size for p in OUTPUT.iterdir() if p.is_file())
    if evidence > MAX_BYTES:
        raise RuntimeError('owned-evidence-capacity-exceeded')
    for name, maximum in [('stdout.log', 64 * 1024), ('stderr.log', 64 * 1024),
                          ('vectors.json', 262144), (RESULT_NAME, 65536 if PHASE != 'evaluate' else 262144)]:
        path = OUTPUT / name
        if path.exists() and path.stat().st_size > maximum:
            raise RuntimeError('owned-file-capacity-exceeded')

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
source_paths = {name: REPO / name for name in SOURCE_NAMES}
source_hashes = {name: digest(path) for name, path in source_paths.items()}
freeze_path = HERE / 'freeze.json'
freeze_bytes = fixed_bytes(freeze_path, 65536)
freeze_sha = sha(freeze_bytes)
frozen = json.loads(freeze_bytes)
freeze_body = {key: value for key, value in frozen.items() if key != 'freezeHash'}
if (frozen.get('schema') != 'browser-root-transfer-evaluation-freeze/v1' or
    frozen.get('executionApproved') is not True or frozen.get('ordinaryDynamicBrowserProducerValidated') is not False or
    frozen.get('sourceHashes') != source_hashes or frozen.get('protocolSha256') != source_hashes[EVAL + 'protocol.json'] or
    sha(json.dumps(freeze_body, separators=(',', ':'), ensure_ascii=False).encode('utf8')) != frozen.get('freezeHash')):
    raise SystemExit('Reviewed root-written freeze unavailable or changed')
input_paths = {name: REPO / name for name in FIXED_INPUT_NAMES}
input_hashes = {name: digest(path) for name, path in input_paths.items()}
if frozen.get('inputHashes') != input_hashes:
    raise SystemExit('Fixed selected input metadata changed')
collector_freeze_path = REPO / CAP / 'freeze.json'
collector_freeze_sha = digest(collector_freeze_path)
if collector_freeze_sha != frozen.get('collectorFreezeSha256'):
    raise SystemExit('Collector freeze changed')
# All8 result/supervisor metadata are required before the child may read any
# retained input packet. These literal paths never include packet bodies.
metadata_paths = {}
for batch in range(1, 9):
    for name in ('result.json', 'supervisor.json'):
        key = CAP + 'output-batch-' + str(batch).zfill(2) + '/' + name
        metadata_paths[key] = REPO / key
capture_metadata_hashes = {name: digest(path) for name, path in metadata_paths.items()}
if frozen.get('captureMetadataHashes') != capture_metadata_hashes:
    raise SystemExit('All8 capture metadata differ from reviewed post-capture freeze')
for batch in range(1, (BATCH or 9)):
    if PHASE == 'admit-captures':
        break
    for name in ('encoding.json', 'supervisor.json'):
        key = EVAL + 'output-encode-' + str(batch).zfill(2) + '/' + name
        metadata_paths[key] = REPO / key
if PHASE != 'admit-captures':
    for name in ('capture-admission.json', 'supervisor.json'):
        key = EVAL + 'output-admit-captures/' + name
        metadata_paths[key] = REPO / key
metadata_hashes = {name: digest(path) for name, path in metadata_paths.items()}
OUTPUT.mkdir()
paths = {name: OUTPUT / suffix for name, suffix in [('marker', 'supervisor.started.json'),
    ('stdout', 'stdout.log'), ('stderr', 'stderr.log'), ('receipt', 'supervisor.json'), ('result', RESULT_NAME)]}
with paths['marker'].open('x', encoding='utf8') as marker:
    json.dump({'schema': 'browser-root-transfer-evaluation-supervisor-started/v1', 'phase': PHASE, 'batch': BATCH,
               'sourceHashes': source_hashes, 'freezeSha256': freeze_sha, 'metadataHashes': metadata_hashes, 'noAutomaticRepeat': True}, marker)

job = process_handle = child = None
reason = cleanup_reason = None
peak_rss = peak_private = peak_pids = 0
cleanup_confirmed = source_hashes_rechecked = False
emergency_own_job_termination = False
receipt_sha = result_sha = vector_sha = None
temp = OUTPUT / 'temp'
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    try:
        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise RuntimeError('job-creation-failed')
        limits = ExtendedLimits()
        limits.basic.limitFlags = 0x2000 | 0x200
        limits.jobMemoryLimit = MEMORY_LIMIT
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('job-resource-limit-failed')
        allowed = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}
        env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        temp.mkdir()
        env.update({'TEMP': str(temp), 'TMP': str(temp), 'MURMINGLE_BROWSER_ROOT_EVAL_V1_SUPERVISED': TOKEN,
                    'OMP_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
        guard = REPO / 'spikes/topic-resolution/harness/deny-external-capabilities.js'
        child = subprocess.Popen([node, '--max-old-space-size=256', '--import', str(guard), str(TARGET)] + args,
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        child.stdin.write(('BROWSER_ROOT_EVALUATION_JOB_ASSIGNED_V1:' + TOKEN + '\n').encode('ascii'))
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            headroom()
            artifact_capacity()
            rss, private, pids = tree_memory(job)
            peak_rss, peak_private, peak_pids = max(peak_rss, rss), max(peak_private, private), max(peak_pids, pids)
            if rss > MEMORY_LIMIT or private > MEMORY_LIMIT or time.monotonic() - started > ACTIVE_LIMIT:
                raise RuntimeError('owned-job-resource-budget-exceeded')
            time.sleep(.05)
        child.wait()
        artifact_capacity()
        if child.returncode != 0:
            raise RuntimeError('owned-child-failed')
        if time.monotonic() - started > WALL_LIMIT:
            raise RuntimeError('owned-wall-budget-exceeded')
    except Exception as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'supervisor-failed'
    finally:
        cleanup_deadline = time.monotonic() + 5
        try:
            if job:
                remaining = job_members(job)
                if remaining.assigned != 0 or remaining.listed != 0:
                    emergency_own_job_termination = True
                    reason = reason or 'emergency-own-job-termination-required'
                    if not kernel.TerminateJobObject(job, 1):
                        cleanup_reason = 'own-job-termination-unverifiable'
            if child is not None and child.poll() is None:
                child.kill()
                child.wait(timeout=max(.01, cleanup_deadline - time.monotonic()))
            if job:
                while True:
                    members = job_members(job)
                    if members.assigned == 0 and members.listed == 0:
                        cleanup_confirmed = child is None or child.poll() is not None
                        break
                    if time.monotonic() >= cleanup_deadline:
                        raise RuntimeError('own-job-final-drain-timeout')
                    time.sleep(.05)
            else:
                cleanup_confirmed = child is None or child.poll() is not None
            if not cleanup_confirmed:
                raise RuntimeError('own-child-final-exit-unconfirmed')
        except Exception as error:
            cleanup_reason = str(error) if isinstance(error, RuntimeError) else 'own-tree-cleanup-unconfirmed'
        finally:
            if process_handle:
                kernel.CloseHandle(process_handle)
            if job:
                kernel.CloseHandle(job)
        reason = reason or cleanup_reason
    try:
        if (digest(freeze_path) != freeze_sha or digest(collector_freeze_path) != collector_freeze_sha or
            any(digest(path) != source_hashes[name] for name, path in source_paths.items()) or
            any(digest(path) != input_hashes[name] for name, path in input_paths.items()) or
            any(digest(path) != metadata_hashes[name] for name, path in metadata_paths.items())):
            raise RuntimeError('source-or-input-metadata-drift')
        source_hashes_rechecked = True
        if reason is None:
            data = fixed_bytes(paths['result'], 262144 if PHASE == 'evaluate' else 65536)
            result_sha = sha(data)
            parsed = json.loads(data)
            if parsed.get('freezeHash') != frozen.get('freezeHash') or parsed.get('ordinaryDynamicBrowserProducerValidated') is not False:
                raise RuntimeError('result-freeze-or-scope-mismatch')
            if (parsed.get('artifactReuseReceiptSha256') != frozen.get('artifactReuseReceiptSha256') or
                parsed.get('oldSelectionReceiptSha256') != frozen.get('oldSelectionReceiptSha256') or
                parsed.get('transferHash') != frozen.get('transferHash') or parsed.get('reobservation') is not True or
                parsed.get('untouchedIndependentCohort') is not False or parsed.get('noOldInputSplice') is not True):
                raise RuntimeError('result-reuse-provenance-mismatch')
            if PHASE == 'encode-batch':
                vector_data = fixed_bytes(OUTPUT / 'vectors.json', 262144)
                vector_sha, receipt_sha = sha(vector_data), result_sha
                if (parsed.get('schema') != 'browser-root-transfer-evaluation-encoding-receipt/v1' or parsed.get('batch') != BATCH or
                    parsed.get('vectorPacketSha256') != vector_sha or parsed.get('sourceHashesRechecked') is not True):
                    raise RuntimeError('encoding-evidence-mismatch')
            elif PHASE == 'admit-captures':
                if parsed.get('schema') != 'browser-root-transfer-evaluation-capture-admission/v1' or parsed.get('all8Complete') is not True:
                    raise RuntimeError('capture-admission-mismatch')
            elif parsed.get('schema') != 'browser-root-transfer-evaluation-result/v1':
                raise RuntimeError('assessment-schema-mismatch')
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    if time.monotonic() - started > WALL_LIMIT:
        reason = reason or 'owned-total-wall-budget-exceeded'
    receipt = {'schema': 'browser-root-transfer-evaluation-supervisor/v1', 'phase': PHASE, 'batch': BATCH, 'reason': reason,
        'freezeSha256': freeze_sha, 'sourceHashes': source_hashes, 'inputHashes': input_hashes, 'metadataHashes': metadata_hashes,
        'elapsedSeconds': time.monotonic() - started, 'childPid': child.pid if child else None, 'exitCode': child.returncode if child else None,
        'sampledPeakTreeRssBytes': peak_rss, 'sampledPeakTreePrivateBytes': peak_private, 'sampledPeakTreeProcesses': peak_pids,
        'jobMemoryLimitBytes': MEMORY_LIMIT, 'ownTreeCleanupConfirmed': cleanup_confirmed, 'cleanupReason': cleanup_reason,
        'emergencyOwnJobTermination': emergency_own_job_termination,
        'sourceHashesRechecked': source_hashes_rechecked, 'retainedTempDirectory': str(temp), 'ordinaryDynamicBrowserProducerValidated': False,
        'noNativeAttestation': True, 'productionValidated': False, 'assignmentAuthority': False}
    if reason is None:
        receipt['resultSha256'] = result_sha
        if PHASE == 'encode-batch':
            receipt['receiptSha256'], receipt['vectorPacketSha256'] = receipt_sha, vector_sha
    with paths['receipt'].open('x', encoding='utf8') as output:
        json.dump(receipt, output)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)


