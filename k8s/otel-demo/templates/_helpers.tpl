{{- define "otel-demo.labels" -}}
app.kubernetes.io/part-of: otel-demo
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}

{{- /* Restricted Pod Security Standard settings shared by every workload. */}}
{{- define "otel-demo.podSecurity" -}}
runAsNonRoot: true
runAsUser: 10001
runAsGroup: 10001
fsGroup: 10001
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{- define "otel-demo.containerSecurity" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end }}

{{- define "otel-demo.pythonEnv" -}}
- name: HOME
  value: /tmp
- name: TMPDIR
  value: /tmp
- name: PYTHONDONTWRITEBYTECODE
  value: "1"
- name: PYTHONUNBUFFERED
  value: "1"
{{- end }}
