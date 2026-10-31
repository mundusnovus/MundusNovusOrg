"""Refresh our generated ID3v2.3 titles and artwork without re-encoding audio.

Run after regenerating covers: python3 tools/studio/retag.py
Only accepts the simple ID3v2.3 format emitted by engine.js. All other frames,
including copyright notices, are preserved. Audio bytes are verified unchanged.
"""
import hashlib
import json
from pathlib import Path

MUSIC = Path(__file__).resolve().parents[2] / 'site' / 'media' / 'music'


def syncsafe(data):
    assert len(data) == 4 and all(b < 128 for b in data)
    return sum(b << (7 * (3 - i)) for i, b in enumerate(data))


def tag_size(n):
    return bytes((n >> shift) & 127 for shift in (21, 14, 7, 0))


def text(value):
    return b'\x01\xff\xfe' + value.encode('utf-16-le')


def retag(path, replacements):
    raw = path.read_bytes()
    assert raw[:6] == b'ID3\x03\x00\x00', f'Unexpected tag format: {path}'
    end = 10 + syncsafe(raw[6:10])
    audio = raw[end:]
    assert audio, f'No audio: {path}'
    frames = []
    cursor = 10
    seen = set()
    while cursor + 10 <= end and raw[cursor] != 0:
        header = raw[cursor:cursor + 10]
        key = header[:4].decode('ascii')
        size = int.from_bytes(header[4:8], 'big')
        assert cursor + 10 + size <= end and header[8:] == b'\x00\x00'
        body = replacements.get(key, raw[cursor + 10:cursor + 10 + size])
        frames.append(header[:4] + len(body).to_bytes(4, 'big') + header[8:] + body)
        seen.add(key)
        cursor += 10 + size
    assert set(replacements) <= seen
    payload = b''.join(frames)
    result = raw[:6] + tag_size(len(payload)) + payload + audio
    assert hashlib.sha256(result[10 + syncsafe(result[6:10]):]).digest() == hashlib.sha256(audio).digest()
    if result != raw:
        path.write_bytes(result)
    print(path.name + ': tags updated, audio unchanged')


if __name__ == '__main__':
    album = json.loads((MUSIC / 'album.json').read_text())
    for track in album['tracks']:
        stem = f"{track['n']:02d}-{track['slug']}"
        cover = (MUSIC / 'covers' / (stem + '-600.png')).read_bytes()
        retag(MUSIC / 'mp3' / (stem + '.mp3'), {
            'TIT2': text(track['title']), 'TALB': text(album['album']),
            'APIC': b'\x00image/png\x00\x03Cover\x00' + cover,
        })
