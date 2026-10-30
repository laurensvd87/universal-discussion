"""Read-only fixed C: volume/file allocation observations; import is inert.

Metadata samples are not a kernel quota or an atomic tree snapshot. Native
handles are closed before returning. Actual allocation is never estimated from
the successful synthetic compression ratio.
"""
import ctypes
from ctypes import wintypes as W
import ntpath
import re

PRIVATE_ROOT = r'C:\Users\Laurens\AppData\Local\MurmingleRecovery\compressed-automatic18-v1'


class StorageFailure(RuntimeError):
    pass


def file_scope(path):
    if (type(path) is not str or len(path) > 1024 or ntpath.normpath(path) != path
            or re.fullmatch(re.escape(PRIVATE_ROOT)
                + r'\\run-[a-f0-9]{48}\\(?:cluster\\nhpg-[A-Za-z0-9]{1,64}\\[^\x00-\x1f:]+|output\\[^\x00-\x1f:]+|run\.pending|run\.json|reviewed-sources\.json|child\.pending|child\.claim)', path) is None):
        raise StorageFailure('compressed-file-scope')
    return path


class _Info(ctypes.Structure):
    _fields_ = [(name, W.DWORD) for name in (
        'attributes', 'createLow', 'createHigh', 'accessLow', 'accessHigh',
        'writeLow', 'writeHigh', 'volume', 'sizeHigh', 'sizeLow', 'links',
        'indexHigh', 'indexLow')]


class _Compression(ctypes.Structure):
    _fields_ = [('bytes', ctypes.c_longlong), ('format', W.WORD),
        ('unit', W.BYTE), ('chunk', W.BYTE), ('cluster', W.BYTE), ('reserved', W.BYTE*3)]


class _NativeAPI:
    def __init__(self):
        self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        def bind(name, args, result):
            fn = getattr(self.k, name)
            fn.argtypes, fn.restype = args, result
            return fn
        self.create = bind('CreateFileW', [W.LPCWSTR, W.DWORD, W.DWORD,
            ctypes.c_void_p, W.DWORD, W.DWORD, W.HANDLE], W.HANDLE)
        self.close = bind('CloseHandle', [W.HANDLE], W.BOOL)
        self.information = bind('GetFileInformationByHandle', [W.HANDLE, ctypes.POINTER(_Info)], W.BOOL)
        self.compression = bind('GetFileInformationByHandleEx', [W.HANDLE, ctypes.c_int,
            ctypes.POINTER(_Compression), W.DWORD], W.BOOL)
        self.space = bind('GetDiskFreeSpaceW', [W.LPCWSTR]+[ctypes.POINTER(W.DWORD)]*4, W.BOOL)
        self.volume_info = bind('GetVolumeInformationW', [W.LPCWSTR, W.LPWSTR, W.DWORD,
            ctypes.POINTER(W.DWORD), ctypes.POINTER(W.DWORD), ctypes.POINTER(W.DWORD), W.LPWSTR, W.DWORD], W.BOOL)
        if ctypes.sizeof(_Info) != 52 or ctypes.sizeof(_Compression) != 16:
            raise StorageFailure('compressed-storage-abi')

    def open_file(self, name):
        handle = self.create(name, 0x80, 7, None, 3, 0x00200000, None)
        if handle in (None, ctypes.c_void_p(-1).value):
            raise ctypes.WinError(ctypes.get_last_error())
        return handle

    def close_file(self, handle):
        if not self.close(handle):
            raise StorageFailure('compressed-file-close')

    def info(self, handle):
        v = _Info()
        if not self.information(handle, ctypes.byref(v)):
            raise ctypes.WinError(ctypes.get_last_error())
        return {'attributes': v.attributes, 'identity': (v.volume, v.indexHigh, v.indexLow),
            'logicalBytes': (v.sizeHigh << 32) | v.sizeLow}

    def allocation(self, handle):
        v = _Compression()
        if not self.compression(handle, 8, ctypes.byref(v), ctypes.sizeof(v)):
            raise ctypes.WinError(ctypes.get_last_error())
        return {'allocatedBytes': v.bytes, 'format': v.format}

    def volume(self):
        sectors, size, free, total, flags = (W.DWORD() for _ in range(5))
        fs = ctypes.create_unicode_buffer(32)
        if not self.space('C:\\', ctypes.byref(sectors), ctypes.byref(size), ctypes.byref(free), ctypes.byref(total)):
            raise ctypes.WinError(ctypes.get_last_error())
        if not self.volume_info('C:\\', None, 0, None, None, ctypes.byref(flags), fs, len(fs)):
            raise ctypes.WinError(ctypes.get_last_error())
        return {'cFileSystem': fs.value, 'cAllocationUnitBytes': sectors.value*size.value,
            'cSupportsFileCompression': bool(flags.value & 16)}


class WindowsStorage:
    """Trusted fake-API seam is for tests; the real caller supplies no selector."""
    def __init__(self, api=None):
        self.api = _NativeAPI() if api is None else api
        self.pending = set()

    def settled(self):
        if self.pending:
            raise StorageFailure('compressed-metadata-handle-unsettled')
        return True

    def volume(self):
        self.settled()
        v = self.api.volume()
        if (v['cFileSystem'] != 'NTFS' or v['cAllocationUnitBytes'] not in (512, 1024, 2048, 4096)
                or v['cSupportsFileCompression'] is not True):
            raise StorageFailure('compressed-volume')
        return v

    def observe_file(self, path):
        file_scope(path)
        self.settled()
        handle = self.api.open_file(path)
        self.pending.add(handle)
        primary = None
        try:
            before = self.api.info(handle)
            allocation = self.api.allocation(handle)
            after = self.api.info(handle)
            if (before['attributes'] & 0x410 or after['attributes'] & 0x410
                    or before['identity'] != after['identity']
                    or type(allocation['allocatedBytes']) is not int or allocation['allocatedBytes'] < 0
                    or allocation['format'] not in (0, 2)
                    or type(before['logicalBytes']) is not int or before['logicalBytes'] < 0
                    or type(after['logicalBytes']) is not int or after['logicalBytes'] < 0):
                raise StorageFailure('compressed-file-observation')
            return {'logicalBytes': max(before['logicalBytes'], after['logicalBytes']),
                'allocatedBytes': allocation['allocatedBytes']}
        except BaseException as error:
            primary = error
            raise
        finally:
            try:
                self.api.close_file(handle)
                self.pending.remove(handle)
            except BaseException:
                if primary is None:
                    raise
