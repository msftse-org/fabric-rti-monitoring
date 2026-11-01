#!/usr/bin/env python3
"""Check public documentation links, JSON assets, and obvious secret material."""

import json
from pathlib import Path
import re
import sys
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {'.md', '.py', '.json', '.yaml', '.yml', '.bicep', '.bicepparam', '.kql', '.mmd'}
SECRET_PATTERNS = [
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'\bgh[pousr]_[A-Za-z0-9]{30,}\b'),
    re.compile(r'\bgithub_pat_[A-Za-z0-9_]{40,}\b'),
    re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
]


def main():
    errors = []
    files = [p for p in ROOT.rglob('*') if p.is_file()
             and not set(p.relative_to(ROOT).parts) & {'.git', '__pycache__', 'output', '.venv'}
             and '.local.' not in p.name]
    for path in files:
        if path.suffix not in TEXT_SUFFIXES:
            continue
        content = path.read_text()
        relative = path.relative_to(ROOT)
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            errors.append(f'{relative}: possible secret material; inspect privately')
        if re.search(r'/(?:Users|home)/[^/\s]+/', content):
            errors.append(f'{relative}: machine-specific absolute path')
        if path.suffix == '.json':
            try:
                json.loads(content)
            except ValueError as error:
                errors.append(f'{relative}: invalid JSON ({error})')
        if path.suffix == '.md':
            if '\u2014' in content or '\u2013' in content:
                errors.append(f'{relative}: use ordinary hyphens in prose')
            for link in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', content):
                target = link.strip().split()[0].strip('<>')
                if target.startswith(('#', 'https://', 'http://', 'mailto:')):
                    continue
                target = urllib.parse.unquote(target.split('#', 1)[0])
                if target and not (path.parent / target).exists():
                    errors.append(f'{relative}: missing local link {target}')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print('Public text, JSON, and local documentation links passed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
