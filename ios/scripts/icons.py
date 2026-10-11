"""Generate original pixel lettering icons; only Python's standard library is needed."""
import pathlib
import struct
import sys
import zlib

GLYPHS = [
    ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
]

def png(size):
    data = bytearray([14, 14, 16] * size * size)
    scale = max(1, size // 24)
    ox, oy = (size - 17 * scale) // 2, (size - 7 * scale) // 2
    def rect(x, y, w, h, rgb):
        for yy in range(y, y+h):
            for xx in range(x, x+w):
                offset = (yy * size + xx) * 3
                data[offset:offset+3] = bytes(rgb)
    for index, glyph in enumerate(GLYPHS):
        for y, row in enumerate(glyph):
            for x, cell in enumerate(row):
                if cell == '1':
                    rect(ox+(index*6+x)*scale, oy+y*scale, scale, scale, (242, 236, 222))
    rect(ox, oy+9*scale, 17*scale, max(1, scale//2), (184, 46, 33))
    raw = b''.join(b'\x00'+data[y*size*3:(y+1)*size*3] for y in range(size))
    def chunk(tag, value):
        return struct.pack('!I', len(value))+tag+value+struct.pack('!I', zlib.crc32(tag+value)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0))+chunk(b'IDAT', zlib.compress(raw, 9))+chunk(b'IEND', b'')

if __name__ == '__main__':
    target = pathlib.Path(sys.argv[1]); target.mkdir(parents=True, exist_ok=True)
    for name, size in [('Icon60@2x.png',120), ('Icon60@3x.png',180), ('Icon76@2x.png',152), ('Icon83.5@2x.png',167)]:
        (target/name).write_bytes(png(size))
