"""Reject source-only ZIPs, wrong architectures, incomplete bundles, and malformed IPAs."""
import hashlib
import pathlib
import plistlib
import struct
import sys
import zipfile

def verify(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'Invalid ZIP member'
        names = archive.namelist()
        assert all(not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in names)
        info_path = 'Payload/BO1Mobile.app/Info.plist'
        info = plistlib.loads(archive.read(info_path))
        assert info['CFBundleIdentifier'] == 'eu.znoam.bo1.mobile'
        assert info['CFBundleSupportedPlatforms'] == ['iPhoneOS']
        assert info['WKAppBoundDomains'] == ['bo1.znoam.eu']
        binary_path = 'Payload/BO1Mobile.app/'+info['CFBundleExecutable']
        binary = archive.read(binary_path)
        magic, cpu, subtype, kind, ncmds, sizeofcmds, flags, reserved = struct.unpack_from('<8I', binary)
        assert magic == 0xfeedfacf and cpu == 0x100000c and kind == 2, 'Expected ARM64 Mach-O executable'
        assert archive.getinfo(binary_path).external_attr >> 16 & 0o111, 'Executable permission missing'
        assert b'kino-mobile-20261011.html' in binary and b'quality=eco' in binary
        offset = 32
        signed = False
        for _ in range(ncmds):
            command, size = struct.unpack_from('<II', binary, offset)
            assert size >= 8 and offset+size <= 32+sizeofcmds
            if command == 0x1d: signed = True
            if command == 0x2c: assert struct.unpack_from('<I', binary, offset+16)[0] == 0, 'Encrypted executable'
            offset += size
        assert signed, 'Expected ad-hoc signature to be replaced by the sideloading tool'
        assert b'capabilities' in archive.read('Payload/BO1Mobile.app/Diagnostics.js')
        assert 'Payload/BO1Mobile.app/Icon60@3x.png' in names
        assert not any(n.endswith('.mobileprovision') for n in names), 'No personal provisioning profile belongs in this artifact'
    print('Verified ARM64 application bundle; ad-hoc signature, requires personal re-signing.')
    print('SHA256', hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest())

if __name__ == '__main__': verify(sys.argv[1])
