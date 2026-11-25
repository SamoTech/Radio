#!/usr/bin/env python3
"""Validate and stage the explicit public Radio Atlas inventory (stdlib only).

Generated build-info.json is added by deployment_provenance.py after staging.
New runtime files must be deliberately added here; directory copies are forbidden.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://samotech.github.io/Radio/'
REQUIRED_FILES = (
    'index.html', 'offline.html', 'about.html', 'contact.html', 'terms.html',
    'privacy.html', 'dmca.html', 'sw.js', 'manifest.webmanifest', 'robots.txt',
    'sitemap.xml', 'css/styles.css', 'js/app.js', 'js/analytics.js',
    'js/modules/mobile.mjs', 'js/modules/map.mjs', 'js/modules/player.mjs',
    'js/modules/regions.mjs', 'js/modules/sdr.mjs', 'js/modules/sdr-adapters.mjs',
    'js/modules/openwebrx-native.mjs', 'js/modules/owrx-adpcm.mjs',
    'js/modules/sdr-waterfall.mjs', 'js/modules/kiwi-waterfall.mjs',
    'js/modules/tools.mjs', 'icons/icon.svg', 'icons/icon-192.png',
    'icons/icon-512.png', 'icons/icon-maskable-192.png',
    'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
    'data/stations.json', 'data/stations.manifest.json', 'data/stations_head.json',
    'data/stream_checks.json', 'data/land_map.json', 'data/eibi.json',
    'data/wspr.json', 'data/satnogs.json', 'data/space_weather.json',
    'data/receiver_audio_checks.json', 'data/kiwisdr.json', 'data/web_sdrs.json',
    # Keep existing public diagnostic datasets; changing their publication policy
    # is outside infrastructure remediation. No wildcard over data/ is allowed.
    'data/stream_quality.json', 'data/discovered_streams.json', 'data/error_report.json',
)
OPTIONAL_FILES = ('ads.txt', 'app-ads.txt', 'CNAME', '.nojekyll', '404.html')
SEO_DIRECTORIES = ('countries', 'genres', 'languages')
SECRET_RE = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|'
                       rb'\bgh[pousr]_[A-Za-z0-9]{36,}\b|'
                       rb'\bgithub_pat_[A-Za-z0-9_]{60,}\b|\bAKIA[A-Z0-9]{16}\b')


def public_file(root: Path, name: str) -> Path:
    """Reject traversal, symlinks (including parent directories), and non-files."""
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or '\\' in name or '\x00' in name
            or any(part in ('..', '.') for part in name.split('/'))
            or any(not part for part in name.split('/'))):
        raise ValueError('Unsafe production path: ' + name)
    current = root
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Symlinks are forbidden in production: ' + name)
    if not current.is_file():
        raise ValueError('Missing required production file: ' + name)
    return current


def require_reference(name: str, reference: str, inventory: set[str]) -> None:
    """Resolve a document URL; only this site's URLs are local dependencies."""
    if not reference or reference.startswith('#'):
        return
    decoded = unquote(reference)
    if '\\' in decoded or '\x00' in decoded:
        raise ValueError('Unsafe runtime reference in ' + name)
    target = urlsplit(urljoin(BASE + name, decoded))
    site = urlsplit(BASE)
    if target.scheme not in ('http', 'https') or target.netloc != site.netloc:
        return
    if not target.path.startswith(site.path):
        return  # Host-level robots.txt and unrelated GitHub Pages projects.
    relative = target.path[len(site.path):]
    if not relative or relative.endswith('/'):
        relative += 'index.html'
    if relative not in inventory:
        raise ValueError('Missing runtime reference: ' + name + ' -> ' + relative)


class _HTMLReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href') and value:
                self.references.append(value)


def _json(root: Path, name: str):
    return json.loads(public_file(root, name).read_text(encoding='utf-8'))


def validate_references(root: Path, inventory: set[str]) -> None:
    sw = (root / 'sw.js').read_text(encoding='utf-8')
    shell = re.search(r'\bvar SHELL\s*=\s*(\[.*?\]);', sw, re.S)
    if not shell:
        raise ValueError('Service Worker SHELL precache list not found')
    references = ast.literal_eval(shell.group(1))
    if not isinstance(references, list) or not all(isinstance(x, str) for x in references):
        raise ValueError('Invalid Service Worker precache list')
    for reference in references:
        require_reference('sw.js', reference, inventory)
    for name in sorted(inventory):
        if name.endswith('.html'):
            parser = _HTMLReferences()
            parser.feed((root / name).read_text(encoding='utf-8'))
            for reference in parser.references:
                require_reference(name, reference, inventory)
        elif name.endswith('.css'):
            text = (root / name).read_text(encoding='utf-8')
            for reference in re.findall(r'url\(\s*[\'"]?([^\)\'"\s]+)', text):
                require_reference(name, reference, inventory)
        elif name.endswith(('.js', '.mjs')):
            text = (root / name).read_text(encoding='utf-8')
            # Fixed fetch paths are document-relative; ES import paths are module-relative.
            for module in re.findall(r"loadModule\(\s*['\"]([a-z-]+)['\"]\s*\)", text):
                require_reference('index.html', 'js/modules/' + module + '.mjs', inventory)
            for reference in re.findall(r'[\'"]((?:data|js|icons|css)/[\w./-]+\.(?:json|mjs|js|css|png|svg))[\'"]', text):
                require_reference('index.html', reference, inventory)
            for reference in re.findall(r'(?:from\s*|import\s*\()\s*[\'"](\.[^\'"]+\.mjs)[\'"]', text):
                require_reference(name, reference, inventory)
    manifest = _json(root, 'manifest.webmanifest')
    for icon in manifest['icons']:
        require_reference('manifest.webmanifest', icon['src'], inventory)
    for key in ('start_url', 'scope'):
        require_reference('manifest.webmanifest', manifest[key], inventory)
    sitemap = ET.fromstring((root / 'sitemap.xml').read_bytes())
    destinations = [node.text for node in sitemap.iter() if node.tag.rsplit('}', 1)[-1] == 'loc']
    if not destinations:
        raise ValueError('Sitemap has no destinations')
    for destination in destinations:
        if not isinstance(destination, str) or not destination.startswith(BASE):
            raise ValueError('Unexpected sitemap origin')
        require_reference('sitemap.xml', destination, inventory)
    robots = (root / 'robots.txt').read_text(encoding='utf-8')
    if 'Sitemap: ' + BASE + 'sitemap.xml' not in robots:
        raise ValueError('robots.txt must identify the public sitemap')
    catalog_manifest = _json(root, 'data/stations.manifest.json')
    if catalog_manifest.get('full') != 'data/stations.json':
        raise ValueError('Unexpected full catalog path')
    require_reference('index.html', catalog_manifest['full'], inventory)
    version, keep = catalog_manifest.get('version'), catalog_manifest.get('keep')
    if type(version) is not int or version < 1 or type(keep) is not int or not 1 <= keep <= 100:
        raise ValueError('Invalid catalog version/retention')
    for number in range(max(1, version - keep + 1), version + 1):
        name = 'data/stations_delta/' + str(number) + '.json'
        if name not in inventory:
            raise ValueError('Missing retained catalog delta: ' + name)
        delta = _json(root, name)
        if delta.get('version') != number or any(not isinstance(delta.get(k), list) for k in ('added', 'updated', 'removed')):
            raise ValueError('Invalid catalog delta: ' + name)
    catalog = _json(root, 'data/stations.json')
    head = _json(root, 'data/stations_head.json')
    count = catalog_manifest.get('count')
    if (type(count) is not int or count < 1 or not isinstance(catalog.get('stations'), list)
            or count != len(catalog['stations']) or catalog.get('count') != count):
        raise ValueError('Catalog station count does not match manifest')
    if not isinstance(head.get('stations'), list) or head.get('count') != len(head['stations']):
        raise ValueError('Invalid catalog head station count')


def production_inventory(root: Path) -> list[str]:
    """Single validated inventory shared by staging and release provenance."""
    root = Path(root).resolve()
    names = set(REQUIRED_FILES)
    for name in OPTIONAL_FILES:
        if (root / name).exists() or (root / name).is_symlink():
            names.add(name)
    for directory in SEO_DIRECTORIES + ('data/stations_delta',):
        path = root / directory
        if path.is_symlink() or not path.is_dir():
            raise ValueError('Missing or unsafe production directory: ' + directory)
        accepted = []
        for candidate in path.iterdir():
            if candidate.is_symlink():
                raise ValueError('Symlinks are forbidden in production: ' + candidate.relative_to(root).as_posix())
            pattern = r'[a-z0-9-]+\.html' if directory in SEO_DIRECTORIES else r'[1-9][0-9]*\.json'
            if re.fullmatch(pattern, candidate.name):
                accepted.append(candidate.relative_to(root).as_posix())
        if not accepted:
            raise ValueError('Production directory has no public files: ' + directory)
        names.update(accepted)
    for name in sorted(names):
        file = public_file(root, name)
        # This complements GitGuardian; never print a possible secret value.
        if SECRET_RE.search(file.read_bytes()):
            raise ValueError('Credential-like content rejected in production file: ' + name)
    validate_references(root, names)
    return sorted(names)


def stage(root: Path, output: Path) -> dict:
    root = Path(root).resolve()
    output = Path(output).absolute()
    # Refuse symlink destinations and source-tree mutation, including through parents.
    for parent in (output, *output.parents):
        if parent.is_symlink():
            raise ValueError('Symlink staging destination is forbidden')
    output = output.resolve()
    if output == root or root in output.parents or output in root.parents:
        raise ValueError('Staging output must be outside the source tree')
    names = production_inventory(root)
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError('Staging output must be absent or empty: ' + str(output))
    output.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in names:
        source = public_file(root, name)
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination, follow_symlinks=False)
        destination.chmod(0o644)
        os.utime(destination, (0, 0))
        total += destination.stat().st_size
    for directory in sorted((p for p in output.rglob('*') if p.is_dir()), reverse=True):
        directory.chmod(0o755)
        os.utime(directory, (0, 0))
    output.chmod(0o755)
    os.utime(output, (0, 0))
    return {'files': len(names), 'bytes': total, 'output': str(output), 'inventory': names}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(stage(args.root, args.output), indent=2))
        return 0
    except (OSError, ValueError, KeyError, SyntaxError, ET.ParseError) as exc:
        print('Production staging error: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
