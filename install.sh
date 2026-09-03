#!/usr/bin/env bash
# =============================================================================
#  Install Checkbox Filter plugin into Apache Superset 6.1.0
# =============================================================================
#
#  Usage:
#     ./install.sh <path-to-superset-root>
#
#  Installs the plugin as an npm package into
#  `superset-frontend/plugins/plugin-filter-checkbox/` and registers it at
#  Superset extension points. Also patches FiltersConfigForm to render
#  "Displayed values" under Description (independent of Default value).
#
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
info()  { echo -e "${CYAN}ℹ️  $1${NC}"; }
ok()    { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

if [ "$#" -ne 1 ]; then
  error "Provide path to Superset repository root:"
  echo "   $0 ./superset"
  exit 1
fi
SUPERSET_DIR="$(cd "$1" && pwd)"
FRONTEND_DIR="$SUPERSET_DIR/superset-frontend"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SRC_DIR="$SCRIPT_DIR/src"
PATCH_DIR="$SCRIPT_DIR/superset-patches"

PKG_DIR="$FRONTEND_DIR/plugins/plugin-filter-checkbox"
EXTRA_FILE="$FRONTEND_DIR/src/setup/setupPluginsExtra.ts"
TSCONFIG_FILE="$FRONTEND_DIR/tsconfig.json"
TYPES_FILE="$FRONTEND_DIR/src/dashboard/components/nativeFilters/FiltersConfigModal/FiltersConfigForm/constants.ts"
FILTERS_FORM="$FRONTEND_DIR/src/dashboard/components/nativeFilters/FiltersConfigModal/FiltersConfigForm/FiltersConfigForm.tsx"
DISPLAY_VALUES_DST="$FRONTEND_DIR/src/dashboard/components/nativeFilters/FiltersConfigModal/FiltersConfigForm/DisplayValuesField.tsx"

echo ""
echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}  Checkbox Filter Plugin → Apache Superset${NC}"
echo -e "${GREEN}  Package install + extension-point registration${NC}"
echo -e "${GREEN}==============================================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 0. Copy package into plugins/
# -----------------------------------------------------------------------------
if [ ! -d "$FRONTEND_DIR" ]; then
  error "superset-frontend not found: $FRONTEND_DIR"
  exit 1
fi
if [ ! -d "$PLUGIN_SRC_DIR" ]; then
  error "Plugin sources not found: $PLUGIN_SRC_DIR"
  exit 1
fi

info "Step 0/4: copying package to $PKG_DIR"
mkdir -p "$PKG_DIR/src"
cp -r "$PLUGIN_SRC_DIR/." "$PKG_DIR/src/"
cp "$SCRIPT_DIR/package.json" "$PKG_DIR/package.json"
cp "$SCRIPT_DIR/tsconfig.json" "$PKG_DIR/tsconfig.json"
ok "Package copied (src/, package.json, tsconfig.json)."

# Remove legacy plural package path if present (renamed to plugin-filter-checkbox)
LEGACY_PKG_DIR="$FRONTEND_DIR/plugins/plugin-filter-checkboxes"
if [ -d "$LEGACY_PKG_DIR" ]; then
  warn "Removing legacy package dir: $LEGACY_PKG_DIR"
  rm -rf "$LEGACY_PKG_DIR"
fi
if [ -f "$EXTRA_FILE" ] && grep -q "plugin-filter-checkboxes\|filter_checkboxes\|CheckboxesFilterPlugin" "$EXTRA_FILE"; then
  info "Cleaning legacy checkboxes registration from setupPluginsExtra.ts"
  sed -i '/plugin-filter-checkboxes/d;/CheckboxesFilterPlugin/d;/filter_checkboxes/d' "$EXTRA_FILE"
fi
if [ -f "$TSCONFIG_FILE" ] && grep -q "plugin-filter-checkboxes" "$TSCONFIG_FILE"; then
  info "Cleaning legacy path alias from tsconfig.json"
  sed -i '/plugin-filter-checkboxes/d' "$TSCONFIG_FILE"
fi
if [ -f "$TYPES_FILE" ] && grep -q "filter_checkboxes" "$TYPES_FILE"; then
  info "Cleaning legacy filter_checkboxes from FILTER_SUPPORTED_TYPES"
  # Remove the filter_checkboxes block (key + array body)
  python3 - <<'PY' "$TYPES_FILE"
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
text2, n = re.subn(
    r"\n\s*filter_checkboxes:\s*\[[^\]]*\],?",
    "\n",
    text,
    count=1,
)
if n:
    path.write_text(text2)
    print("Removed filter_checkboxes from FILTER_SUPPORTED_TYPES")
else:
    print("Legacy filter_checkboxes block not found as expected")
PY
fi

# -----------------------------------------------------------------------------
# Step 1. Register in setupPluginsExtra.ts
# -----------------------------------------------------------------------------
if [ ! -f "$EXTRA_FILE" ]; then
  error "Extension file not found: $EXTRA_FILE"
  exit 1
fi

if grep -q "@superset-ui/plugin-filter-checkbox" "$EXTRA_FILE"; then
  warn "Plugin import already present in $EXTRA_FILE"
else
  info "Step 1/4: registering plugin in setupPluginsExtra.ts"
  sed -i "/^\/\/ For individual deployments to add custom overrides$/i import CheckboxFilterPlugin from '@superset-ui/plugin-filter-checkbox';" "$EXTRA_FILE"
  ok "Import added to $EXTRA_FILE"
fi

if grep -q "filter_checkbox" "$EXTRA_FILE"; then
  warn "Plugin registration already present in $EXTRA_FILE"
else
  if grep -q "export default function setupPluginsExtra() {}" "$EXTRA_FILE"; then
    sed -i "s/export default function setupPluginsExtra() {}/export default function setupPluginsExtra() {\n  new CheckboxFilterPlugin().configure({ key: 'filter_checkbox' }).register();\n}/" "$EXTRA_FILE"
  else
    sed -i "/export default function setupPluginsExtra() {/a\\  new CheckboxFilterPlugin().configure({ key: 'filter_checkbox' }).register();" "$EXTRA_FILE"
  fi
  ok "Registration added to $EXTRA_FILE"
fi

# -----------------------------------------------------------------------------
# Step 2. tsconfig path alias
# -----------------------------------------------------------------------------
if [ ! -f "$TSCONFIG_FILE" ]; then
  error "tsconfig.json not found: $TSCONFIG_FILE"
  exit 1
fi

if grep -q "plugin-filter-checkbox" "$TSCONFIG_FILE"; then
  warn "Path @superset-ui/plugin-filter-checkbox already in tsconfig.json"
else
  info "Step 2/4: adding path alias to tsconfig.json"
  sed -i 's|^\([[:space:]]*\)"@superset-ui/plugin-chart-\*":[[:space:]]*\["\./plugins/plugin-chart-\*/src"\],$|\1"@superset-ui/plugin-chart-*": ["./plugins/plugin-chart-*/src"],\n\1"@superset-ui/plugin-filter-checkbox": ["./plugins/plugin-filter-checkbox/src"],|' "$TSCONFIG_FILE"
  if grep -q "plugin-filter-checkbox" "$TSCONFIG_FILE"; then
    ok "Path alias added to tsconfig.json"
  else
    sed -i 's|^\([[:space:]]*\)"@superset-ui/plugin-filter-calendar":[[:space:]]*\["\./plugins/plugin-filter-calendar/src"\],$|\1"@superset-ui/plugin-filter-calendar": ["./plugins/plugin-filter-calendar/src"],\n\1"@superset-ui/plugin-filter-checkbox": ["./plugins/plugin-filter-checkbox/src"],|' "$TSCONFIG_FILE"
    if grep -q "plugin-filter-checkbox" "$TSCONFIG_FILE"; then
      ok "Path alias added to tsconfig.json (after calendar)"
    else
      error "Could not find anchor in tsconfig.json — add path alias manually."
    fi
  fi
fi

# -----------------------------------------------------------------------------
# Step 3. FILTER_SUPPORTED_TYPES
# -----------------------------------------------------------------------------
if [ ! -f "$TYPES_FILE" ]; then
  error "FiltersConfigForm/constants.ts not found: $TYPES_FILE"
  exit 1
fi

if grep -q "filter_checkbox" "$TYPES_FILE"; then
  warn "filter_checkbox already in FILTER_SUPPORTED_TYPES"
else
  info "Step 3/4: adding filter_checkbox to FILTER_SUPPORTED_TYPES"
  sed -i '/filter_select: \[/,/\]/ {
    /\]/a\  filter_checkbox: [\n    GenericDataType.Boolean,\n    GenericDataType.String,\n    GenericDataType.Numeric,\n    GenericDataType.Temporal,\n  ],
  }' "$TYPES_FILE"
  if grep -q "filter_checkbox" "$TYPES_FILE"; then
    ok "filter_checkbox added to FILTER_SUPPORTED_TYPES"
  else
    error "Could not update constants.ts — add filter_checkbox manually."
  fi
fi

# -----------------------------------------------------------------------------
# Step 4. FiltersConfigForm — Displayed values under Description
# -----------------------------------------------------------------------------
if [ ! -f "$FILTERS_FORM" ]; then
  error "FiltersConfigForm.tsx not found: $FILTERS_FORM"
  exit 1
fi
if [ ! -f "$PATCH_DIR/DisplayValuesField.tsx" ]; then
  error "Patch source not found: $PATCH_DIR/DisplayValuesField.tsx"
  exit 1
fi

info "Step 4/4: installing DisplayValuesField under Description"
cp "$PATCH_DIR/DisplayValuesField.tsx" "$DISPLAY_VALUES_DST"
ok "Copied DisplayValuesField.tsx"

if grep -q "DisplayValuesField" "$FILTERS_FORM"; then
  warn "DisplayValuesField already wired in FiltersConfigForm.tsx"
else
  # Import after RemovedFilter import
  sed -i "/import RemovedFilter from '\.\/RemovedFilter';/a import DisplayValuesField from './DisplayValuesField';" "$FILTERS_FORM"

  # Insert component after Description TextArea block, before hidden type FormItem
  python3 - "$FILTERS_FORM" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = """                          >
                            <Input.TextArea onChange={debouncedFormChanged} />
                          </StyledFormItem>
                          <FormItem
                            name={['filters', filterId, 'type']}
"""
insert = """                          >
                            <Input.TextArea onChange={debouncedFormChanged} />
                          </StyledFormItem>
                          <DisplayValuesField
                            expanded={expanded}
                            form={form}
                            filterId={filterId}
                            filterType={formFilter?.filterType}
                            datasetId={datasetId}
                            column={formFilter?.column}
                            dashboardId={dashboardId}
                            initialValue={
                              filterToEdit?.controlValues?.displayValues ?? []
                            }
                            formChanged={formChanged}
                          />
                          <FormItem
                            name={['filters', filterId, 'type']}
"""
if needle not in text:
    raise SystemExit('Anchor for DisplayValuesField insert not found')
path.write_text(text.replace(needle, insert, 1))
print('DisplayValuesField JSX inserted')
PY

  if grep -q "<DisplayValuesField" "$FILTERS_FORM"; then
    ok "DisplayValuesField wired under Description in FiltersConfigForm.tsx"
  else
    error "Failed to wire DisplayValuesField into FiltersConfigForm.tsx"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}Plugin installed.${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  ${CYAN}1.${NC} cd superset-frontend && npm install"
echo -e "  ${CYAN}2.${NC} npm run dev-server"
echo -e "  ${CYAN}3.${NC} Dashboard → Edit → + Add filter → Checkbox"
echo -e "${GREEN}==============================================================${NC}"
