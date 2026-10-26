"""Frozen, bounded, offline formation and prediction measurements; never plots."""
import os
for name in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMBA_NUM_THREADS'):
    os.environ[name] = '1'
import json
import hashlib
import time
import threading
import sys
from pathlib import Path
from importlib.metadata import version

ROOT = Path(__file__).resolve().parent
protocol = json.loads((ROOT / 'protocol.json').read_text(encoding='utf-8'))
frozen = json.loads((ROOT / 'freeze.json').read_text(encoding='utf-8'))
for name, expected in frozen['sources'].items():
    if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
        raise RuntimeError('Preregistration source changed')
payload_bytes = (ROOT / 'output/vectors.json').read_bytes()
if len(payload_bytes) > 10 * 1024 * 1024:
    raise RuntimeError('Vector input bound')
payload = json.loads(payload_bytes)
if payload['freezeHash'] != frozen['freezeHash']:
    raise RuntimeError('Vector freeze mismatch')
started = time.perf_counter()
import psutil
process = psutil.Process()
resources = {'maxRssBytes': 0, 'maxCommitBytes': 0}
done = threading.Event()
def watch():
    while not done.wait(0.05):
        memory = process.memory_info()
        resources['maxRssBytes'] = max(resources['maxRssBytes'], memory.rss)
        resources['maxCommitBytes'] = max(resources['maxCommitBytes'], getattr(memory, 'pagefile', memory.vms))
        if (memory.rss > protocol['budget']['maxProcessRssMiB'] * 1048576 or
            getattr(memory, 'pagefile', memory.vms) > protocol['budget']['maxProcessCommitMiB'] * 1048576 or
            psutil.virtual_memory().available < protocol['budget']['minSystemAvailableMiB'] * 1048576 or
            time.perf_counter() - started > protocol['budget']['maxWallSeconds']):
            sys.stderr.write('Research resource budget exceeded\n')
            os._exit(3)
threading.Thread(target=watch, daemon=True).start()
import numpy as np
from sklearn.decomposition import PCA
import hdbscan
import umap

rows = payload['rows']
if len(rows) != frozen['rowCount'] or len(rows) > protocol['maxTexts']:
    raise RuntimeError('Corpus count changed')
fit_ids = {i for i, row in enumerate(rows) if row['split'].startswith('development')}
heldout_topics = sorted({row['topic'] for row in rows if row['split'] == 'holdout'})
for topic in heldout_topics:
    fit_ids.update(sorted((i for i, row in enumerate(rows) if row['split'] == 'holdout' and row['topic'] == topic),
                          key=lambda i: rows[i]['id'])[:2])
fit_ids = sorted(fit_ids)
query_ids = [i for i, row in enumerate(rows) if row['split'].startswith('holdout') and i not in fit_ids]
independent_ids = [i for i, row in enumerate(rows) if row['split'] == 'holdout']

def groups_metrics(labels, scope=None):
    evaluated = list(range(len(rows))) if scope is None else scope
    true_pairs = wrong_pairs = irrelevant_pairs = gold_pairs = 0
    mixed_pages, irrelevant_pages = set(), set()
    for position, i in enumerate(evaluated):
        for j in evaluated[:position]:
            same_gold = rows[i]['topic'] == rows[j]['topic']
            gold_pairs += int(same_gold)
            joined = labels[i] >= 0 and labels[i] == labels[j]
            if joined:
                if same_gold:
                    true_pairs += 1
                else:
                    wrong_pairs += 1
                    mixed_pages.update((i, j))
                    if rows[i]['family'] != rows[j]['family']:
                        irrelevant_pairs += 1
                        irrelevant_pages.update((i, j))
    fragments = []
    for topic in sorted({rows[i]['topic'] for i in evaluated if not rows[i]['split'].endswith('singleton')}):
        members = [i for i in evaluated if rows[i]['topic'] == topic]
        fragments.append(len({int(labels[i]) if labels[i] >= 0 else -1-i for i in members}))
    return {'clusters': len(set(int(labels[i]) for i in evaluated if labels[i] >= 0)),
            'noisePages': int(np.sum(np.asarray(labels)[evaluated] < 0)), 'correctGroupedPairs': true_pairs,
            'wrongGroupedPairs': wrong_pairs, 'irrelevantGroupedPairs': irrelevant_pairs,
            'mixedPages': len(mixed_pages), 'irrelevantMixedPages': len(irrelevant_pages),
            'goldPairs': gold_pairs, 'pairRecall': true_pairs / gold_pairs if gold_pairs else None,
            'pairPrecision': true_pairs / (true_pairs+wrong_pairs) if true_pairs+wrong_pairs else None,
            'meanFragmentsPerTopic': float(np.mean(fragments)), 'maxFragmentsPerTopic': max(fragments)}

def radius_partition(matrix, floor):
    labels, anchors = [], []
    multiple = 0
    for vector in matrix:
        matches = [i for i, anchor in enumerate(anchors) if float(np.dot(vector, anchor)) >= floor]
        multiple += int(len(matches) > 1)
        if not matches:
            anchors.append(vector)
            labels.append(len(anchors)-1)
        else:
            labels.append(matches[0])
    return labels, multiple

def reducer(name):
    if name == 'original':
        return None
    if name == 'pca10':
        return PCA(**protocol['pca'])
    return umap.UMAP(**protocol['umap'])

def new_clusterer():
    return hdbscan.HDBSCAN(**protocol['hdbscan'])

def assignment_metrics(predicted, training_labels):
    clusters = {}
    for local, global_id in enumerate(fit_ids):
        label = int(training_labels[local])
        if label >= 0:
            clusters.setdefault(label, set()).add(rows[global_id]['topic'])
    correct = wrong = noise_known = rejected_singletons = assigned_singletons = 0
    for index, label in zip(query_ids, predicted):
        row = rows[index]
        if row['split'].endswith('singleton'):
            rejected_singletons += int(label < 0)
            assigned_singletons += int(label >= 0)
        elif label < 0:
            noise_known += 1
        elif clusters.get(int(label)) == {row['topic']}:
            correct += 1
        else:
            wrong += 1
    return {'queryPages': len(query_ids), 'correctExistingTopicAssignments': correct,
            'wrongExistingTopicAssignments': wrong, 'knownTopicAbstentions': noise_known,
            'singletonCorrectRejections': rejected_singletons, 'singletonFalseAssignments': assigned_singletons}

report = {'schema': protocol['schema'], 'freezeHash': frozen['freezeHash'],
          'vectorFileSha256': hashlib.sha256(payload_bytes).hexdigest(),
          'packageVersions': {name: version(name) for name in ('numpy','scipy','scikit-learn','umap-learn','hdbscan','numba','llvmlite','psutil')},
          'rowCount': len(rows), 'fitPages': len(fit_ids), 'assignmentPages': len(query_ids),
          'embeddingTiming': payload['timing'], 'embeddingResources': payload['embeddingResources'],
          'baselines': [], 'pipelines': []}
try:
    for input_name in protocol['inputs']:
        for representation in protocol['representations']:
            matrix = np.asarray(payload['vectors'][input_name][representation], dtype=np.float64)
            if matrix.shape != (len(rows),384) or not np.isfinite(matrix).all():
                raise RuntimeError('Invalid vector matrix')
            matrix = matrix / np.linalg.norm(matrix,axis=1,keepdims=True)
            before = time.perf_counter()
            labels, multiple = radius_partition(matrix,protocol['radiusFloors'][representation])
            report['baselines'].append({'input':input_name,'representation':representation,
                'method':'first-fixed-reference-partition-comparator','floor':protocol['radiusFloors'][representation],
                'multipleReferenceHits':multiple,'fitMs':(time.perf_counter()-before)*1000,
                'formation':groups_metrics(labels),'independentHoldoutFormation':groups_metrics(labels,independent_ids),
                'caveat':'Partition comparator chooses first eligible fixed anchor; current canonical overlapping memberships are not simulated'})
            for reduction in protocol['reducers']:
                before = time.perf_counter()
                reduction_model = reducer(reduction)
                reduced = matrix if reduction_model is None else reduction_model.fit_transform(matrix)
                reduction_ms = (time.perf_counter()-before)*1000
                before = time.perf_counter()
                full = new_clusterer().fit(np.asarray(reduced,dtype=np.float64))
                fit_ms = (time.perf_counter()-before)*1000
                # Separate frozen-background assignment fit, never full-catalog
                # fitted coordinates reused to transform heldout query pages.
                background = reducer(reduction)
                before = time.perf_counter()
                fitted = matrix[fit_ids] if background is None else background.fit_transform(matrix[fit_ids])
                assignment_model = new_clusterer().fit(np.asarray(fitted,dtype=np.float64))
                background_ms = (time.perf_counter()-before)*1000
                before = time.perf_counter()
                queries = matrix[query_ids] if background is None else background.transform(matrix[query_ids])
                predicted, strengths = hdbscan.approximate_predict(assignment_model,np.asarray(queries,dtype=np.float64))
                batch_ms = (time.perf_counter()-before)*1000
                timings = []
                sample = np.linspace(0,len(query_ids)-1,min(protocol['singleQueryTimingSampleCount'],len(query_ids)),dtype=int)
                for local in sample:
                    before = time.perf_counter()
                    point = matrix[[query_ids[int(local)]]]
                    if background is not None:
                        point = background.transform(point)
                    hdbscan.approximate_predict(assignment_model,np.asarray(point,dtype=np.float64))
                    timings.append((time.perf_counter()-before)*1000)
                result = {'input':input_name,'representation':representation,'reducer':reduction,
                    'reductionFitMs':reduction_ms,'clusterFitMs':fit_ms,'backgroundFitMs':background_ms,
                    'formation':groups_metrics(full.labels_),'independentHoldoutFormation':groups_metrics(full.labels_,independent_ids),
                    'assignment':assignment_metrics(predicted,assignment_model.labels_),
                    'predictionBatchMs':batch_ms,'singleQuerySampleCount':len(timings),
                    'singleQueryMedianMs':float(np.median(timings)),'singleQueryP95Ms':float(np.percentile(timings,95)),
                    'predictionMeanStrength':float(np.mean(strengths))}
                report['pipelines'].append(result)
                print(json.dumps({'stage':'pipeline-complete',**result}),flush=True)
    report['resources'] = resources
    report['wallMs'] = (time.perf_counter()-started)*1000
    with (ROOT/'output/results.json').open('x',encoding='utf-8') as output:
        json.dump(report,output,indent=2)
    print(json.dumps({'stage':'complete','wallMs':report['wallMs'],'resources':resources}),flush=True)
finally:
    done.set()
