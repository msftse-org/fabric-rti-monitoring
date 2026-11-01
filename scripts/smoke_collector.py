#!/usr/bin/env python3
"""Run the cloud processors against a debug sink with no Azure access required."""

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
spec = importlib.util.spec_from_file_location('demo_emit', ROOT / 'demo/emit.py')
emit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(emit)


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, stderr=subprocess.STDOUT).strip()


def main():
    cloud = (ROOT / 'collector/cloud.yaml').read_text()
    prefix, _, exporter_and_service = cloud.partition('\nexporters:\n')
    _, separator, service = exporter_and_service.partition('\nservice:\n')
    if not separator:
        raise RuntimeError('Cloud configuration structure changed; review smoke configuration')
    # Preserve receivers, processors, and env: config loading. Replace only the
    # remote sink so this test cannot write to a cloud database.
    config = prefix + '\nexporters:\n  debug:\n    verbosity: detailed\n\nservice:\n'
    config += service.replace('exporters: [azuredataexplorer]', 'exporters: [debug]')
    environment = {**os.environ, 'OTEL_CONFIG': config}
    name = f'fabric-rti-smoke-{os.getpid()}'
    created = False
    try:
        subprocess.run(['docker', 'run', '--detach', '--name', name,
                        '--publish', '127.0.0.1::4318', '--publish', '127.0.0.1::13133',
                        '--env', 'OTEL_CONFIG', IMAGE, '--config=env:OTEL_CONFIG'],
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

        deadline = time.monotonic() + 15
        while True:
            logs = docker('logs', name)
            if all(marker in logs for marker in ('Synthetic request completed', 'demo.request', 'demo.request.duration')):
                break
            if time.monotonic() > deadline:
                raise RuntimeError('All three signals were not exported to the debug sink')
            time.sleep(0.5)
        if forbidden in logs or 'DROP_UNMARKED_PRODUCER' in logs:
            raise RuntimeError('Collector did not apply the sample transform/filter policy')
        print('Collector runtime passed: env config, OTLP JSON, three signals, filtering, and body/attribute transformation.')
    except Exception:
        if created:
            print(docker('logs', name))
        raise
    finally:
        if created:
            docker('rm', '--force', name)


if __name__ == '__main__':
    main()
