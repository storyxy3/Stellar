#!/usr/bin/env bash
set -euo pipefail

PROJECT_DOTNET_ROOT="${PJSK_DOTNET_ROOT:-/home/storyxy3/.dotnet}"
export DOTNET_ROOT="$PROJECT_DOTNET_ROOT"
DOTNET_BIN="${PROJECT_DOTNET_ROOT}/dotnet"

if [[ ! -x "$DOTNET_BIN" ]]; then
  echo "dotnet not found at ${DOTNET_BIN}" >&2
  exit 127
fi

cmd="${1:-}"
case "$cmd" in
  build|restore|publish|test)
    shift
    exec "$DOTNET_BIN" "$cmd" \
      -p:BaseIntermediateOutputPath="${PJSK_DOTNET_OBJ:-/tmp/pjskbundle2parts-obj}/" \
      -p:BaseOutputPath="${PJSK_DOTNET_BIN:-/tmp/pjskbundle2parts-bin}/" \
      "$@"
    ;;
  run)
    shift
    app_args=()
    after_delimiter=0
    for arg in "$@"; do
      if [[ "$arg" == "--" && "$after_delimiter" -eq 0 ]]; then
        after_delimiter=1
        continue
      fi

      app_args+=("$arg")
    done

    "$DOTNET_BIN" build \
      -p:BaseIntermediateOutputPath="${PJSK_DOTNET_OBJ:-/tmp/pjskbundle2parts-obj}/" \
      -p:BaseOutputPath="${PJSK_DOTNET_BIN:-/tmp/pjskbundle2parts-bin}/" \
      >/dev/null
    exec "$DOTNET_BIN" "${PJSK_DOTNET_BIN:-/tmp/pjskbundle2parts-bin}/Debug/net8.0/PjskBundle2Parts.dll" \
      "${app_args[@]}"
    ;;
  *)
    exec "$DOTNET_BIN" "$@"
    ;;
esac
