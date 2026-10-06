#!/usr/bin/env bash
set -euo pipefail
destination=${1:?Usage: install-gitleaks.sh destination-directory}
version=8.30.1
mkdir -p "$destination"
curl --fail --silent --show-error --location \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz" \
  --output "$destination/gitleaks.tar.gz"
curl --fail --silent --show-error --location \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_checksums.txt" \
  --output "$destination/checksums.txt"
python - "$destination" "$version" <<'PY'
import hashlib, pathlib, sys, tarfile
directory = pathlib.Path(sys.argv[1])
name = f'gitleaks_{sys.argv[2]}_linux_x64.tar.gz'
checksums = {line.split()[1].lstrip('*'): line.split()[0] for line in (directory/'checksums.txt').read_text().splitlines()}
assert hashlib.sha256((directory/'gitleaks.tar.gz').read_bytes()).hexdigest() == checksums[name], 'Gitleaks checksum mismatch'
with tarfile.open(directory/'gitleaks.tar.gz') as archive:
    member = archive.getmember('gitleaks')
    assert member.isfile()
    with archive.extractfile(member) as source:
        (directory/'gitleaks').write_bytes(source.read())
(directory/'gitleaks').chmod(0o755)
PY
"$destination/gitleaks" version
