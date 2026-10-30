"""Bounded new C: recovery policy. Import and pure validation perform no IO.

Logical lengths never stand in for allocation. These checks are sampled limits,
not a kernel directory quota or a reservation of free space.
"""
import ntpath
import re

MIB = 1024 ** 2
GIB = 1024 ** 3
PRIVATE_ROOT = r'C:\Users\Laurens\AppData\Local\MurmingleRecovery\plain-automatic18-v1'
LOGICAL_CLUSTER_LIMIT = 6 * GIB
ALLOCATED_CLUSTER_LIMIT = 4 * GIB
NONCLUSTER_LIMIT = 128 * MIB
C_FLOOR = 2 * GIB
D_FLOOR = 4 * GIB
C_ADMISSION = C_FLOOR + ALLOCATED_CLUSTER_LIMIT + NONCLUSTER_LIMIT
PHYSICAL_FLOOR = COMMIT_FLOOR = GIB
ENTRY_LIMIT = 8192


class StorageRefusal(RuntimeError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(value, code):
    if value is not True:
        raise StorageRefusal(code)


def integer(value, code='storage-integer'):
    require(type(value) is int and 0 <= value <= (1 << 63) - 1, code)
    return value


def run_path(value):
    require(type(value) is str and ntpath.normpath(value) == value
            and re.fullmatch(re.escape(PRIVATE_ROOT) + r'\\run-[a-f0-9]{48}', value) is not None,
            'compressed-run-scope')
    return value


def data_path(run, value):
    run_path(run)
    require(type(value) is str and ntpath.normpath(value) == value
            and re.fullmatch(re.escape(run) + r'\\cluster\\nhpg-[A-Za-z0-9]{1,64}', value) is not None,
            'compressed-data-scope')
    return value


def resources(snapshot, admission=False):
    require(type(admission) is bool and type(snapshot) is dict and set(snapshot) == {
        'physicalFree', 'commitFree', 'cFree', 'dFree', 'cFileSystem',
        'cAllocationUnitBytes', 'cSupportsFileCompression'}, 'compressed-resource-shape')
    for name in ('physicalFree', 'commitFree', 'cFree', 'dFree', 'cAllocationUnitBytes'):
        integer(snapshot[name])
    require(snapshot['cFileSystem'] == 'NTFS'
            and snapshot['cAllocationUnitBytes'] in (512, 1024, 2048, 4096)
            and snapshot['cSupportsFileCompression'] is True, 'compressed-volume')
    require(snapshot['physicalFree'] >= PHYSICAL_FLOOR, 'compressed-physical-floor')
    require(snapshot['commitFree'] >= COMMIT_FLOOR, 'compressed-commit-floor')
    require(snapshot['cFree'] >= (C_ADMISSION if admission else C_FLOOR), 'compressed-c-floor')
    require(snapshot['dFree'] >= D_FLOOR, 'compressed-d-floor')
    return True


def accounting(rows, allocation_unit=4096):
    """Each row is an observed regular file, never a caller estimate/ratio.

    Round allocations up by one filesystem unit. In particular, uncompressed
    GetCompressedFileSize can equal logical length, rather than its cluster cost.
    Directory/MFT and other run storage are additionally covered by volume floors
    and the separate non-cluster budget, not claimed as this file-data sum.
    """
    require(type(rows) is list and len(rows) <= ENTRY_LIMIT
            and type(allocation_unit) is int and allocation_unit in (512, 1024, 2048, 4096),
            'compressed-accounting-shape')
    paths = set()
    logical = allocated = 0
    for row in rows:
        require(type(row) is dict and set(row) == {'relativePath', 'logicalBytes', 'allocatedBytes'},
                'compressed-accounting-row')
        name = row['relativePath']
        require(type(name) is str and len(name) <= 512 and not ntpath.isabs(name)
                and ':' not in name and '\\' not in name
                and all(part not in ('', '.', '..') for part in name.split('/'))
                and len(name.split('/')) <= 16 and name not in paths,
                'compressed-accounting-path')
        paths.add(name)
        length = integer(row['logicalBytes'])
        charge = integer(row['allocatedBytes'])
        logical += length
        allocated += ((charge + allocation_unit - 1) // allocation_unit) * allocation_unit
        require(logical <= LOGICAL_CLUSTER_LIMIT, 'compressed-logical-cap')
        require(allocated <= ALLOCATED_CLUSTER_LIMIT, 'compressed-allocated-cap')
    return {'files': len(rows), 'logicalBytes': logical, 'allocatedBytes': allocated}


def run_budget(cluster, noncluster_bytes):
    require(type(cluster) is dict and set(cluster) == {'files', 'logicalBytes', 'allocatedBytes'},
            'compressed-budget-shape')
    require(integer(cluster['files']) <= ENTRY_LIMIT
            and integer(cluster['logicalBytes']) <= LOGICAL_CLUSTER_LIMIT
            and integer(cluster['allocatedBytes']) <= ALLOCATED_CLUSTER_LIMIT,
            'compressed-cluster-budget')
    require(integer(noncluster_bytes) <= NONCLUSTER_LIMIT, 'compressed-noncluster-cap')
    return True
