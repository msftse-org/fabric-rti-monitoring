#!/usr/bin/env python3
"""Run the cloud and AKS processors against a debug sink with no Azure access required."""

import copy
import importlib.util
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'otel/opentelemetry-collector-contrib:0.141.0'
# Config path -> extra environment and a marker the debug sink must show.
CONFIGS = {
    'collector/cloud.yaml': ({}, None),
    'k8s/otel-demo/files/collector.yaml': ({'K8S_CLUSTER_NAME': 'smoke-aks-cluster'}, 'smoke-aks-cluster'),
}
spec = importlib.util.spec_from_file_location('demo_emit', ROOT / 'demo/emit.py')
emit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(emit)


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, stderr=subprocess.STDOUT).strip()


def run(config_path, extra_env, marker):
    cloud = (ROOT / config_path).read_text()
    prefix, _, exporter_and_service = cloud.partition('\nexporters:\n')
    _, separator, service = exporter_and_service.partition('\nservice:\n')
    if not separator:
        raise RuntimeError(f'{config_path} structure changed; review smoke configuration')
    # Preserve receivers, processors, and env: config loading. Replace only the
    # remote sink so this test cannot write to a cloud database.
    config = prefix + '\nexporters:\n  debug:\n    verbosity: detailed\n\nservice:\n'
    config += service.replace('exporters: [azuredataexplorer]', 'exporters: [debug]')
    environment = {**os.environ, **extra_env, 'OTEL_CONFIG': config}
    env_flags = [flag for key in ['OTEL_CONFIG', *extra_env] for flag in ('--env', key)]
    name = f'fabric-rti-smoke-{os.getpid()}'
    created = False
    try:
        subprocess.run(['docker', 'run', '--detach', '--name', name,
                        '--publish', '127.0.0.1::4318', '--publish', '127.0.0.1::13133',
                        # The AKS config keeps its export queue on disk (file_storage).
                        '--tmpfs', '/var/lib/otelcol/queue',
                        *env_flags, IMAGE, '--config=env:OTEL_CONFIG'],
                       check=True, env=environment, stdout=subprocess.DEVNULL)
        created = True
        endpoint = 'http://' + docker('port', name, '4318/tcp').splitlines()[0]
        health = 'http://' + docker('port', name, '13133/tcp').splitlines()[0]
        deadline = time.monotonic() + 40
        while True:
            try:
                with urllib.request.urlopen(health, timeout=2) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('Collector did not become healthy')
            time.sleep(0.5)

        forbidden = 'REMOVE_ME_FROM_TELEMETRY'
        payloads = emit.make_payloads(4)
        for signal, payload in payloads.items():
            envelope = payload[next(iter(payload))][0]
            envelope['resource']['attributes'].append(emit.attribute('private.payload', forbidden))
            if signal == 'logs':
                envelope['scopeLogs'][0]['logRecords'][0]['body'] = {'stringValue': forbidden}
            emit.send(endpoint, signal, payload)

        dropped = copy.deepcopy(emit.make_payloads(0)['logs'])
        attributes = dropped['resourceLogs'][0]['resource']['attributes']
        for attribute in attributes:
            if attribute['key'] == 'demo.synthetic':
                attribute['value'] = {'boolValue': False}
            if attribute['key'] == 'service.name':
                attribute['value'] = {'stringValue': 'DROP_UNMARKED_PRODUCER'}
        emit.send(endpoint, 'logs', dropped)

        for span_name in ('demo.inventory', 'demo.shipping', 'demo.notifications', 'DROP_UNKNOWN_SPAN'):
            spans = copy.deepcopy(emit.make_payloads(0)['traces'])
            resource = spans['resourceSpans'][0]
            spans['resourceSpans'] = [resource]
            resource['scopeSpans'][0]['spans'][0]['name'] = span_name
            emit.send(endpoint, 'traces', spans)

        deadline = time.monotonic() + 15
        while True:
            logs = docker('logs', name)
            # Request 4 fails: its exception messages must arrive with numbers replaced.
            expected = ['Synthetic request completed', 'demo.request', 'demo.request.duration',
                        'demo.inventory', 'demo.shipping', 'demo.notifications', 'QueryCanceledError',
                        'orders.id=<n>', *filter(None, [marker])]
            if all(item in logs for item in expected):
                break
            if time.monotonic() > deadline:
                raise RuntimeError('All three signals were not exported to the debug sink')
            time.sleep(0.5)
        if any(value in logs for value in (forbidden, 'DROP_UNMARKED_PRODUCER', 'DROP_UNKNOWN_SPAN', 'orders.id=40028')):
            raise RuntimeError('Collector did not apply the sample transform/filter policy')
        print(f'{config_path} passed: env config, OTLP JSON, three signals, filtering, and body/attribute transformation.')
    except Exception:
        if created:
            print(docker('logs', name))
        raise
    finally:
        if created:
            docker('rm', '--force', name)


def main():
    for config_path, (extra_env, marker) in CONFIGS.items():
        run(config_path, extra_env, marker)


if __name__ == '__main__':
    main()
