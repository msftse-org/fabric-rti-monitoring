targetScope = 'resourceGroup'

param location string
param tags object
param nameSuffix string
param collectorIdentityId string
param collectorIdentityClientId string

@minLength(1)
param kustoClusterUri string

@minLength(1)
param kustoDatabase string

param collectorImage string
param emitterImage string

var collectorName = 'frti-collector-${nameSuffix}'

// Platform diagnostics for the collector and demo job. Application OTLP
// telemetry goes to Fabric instead, through the exporter.
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'frti-platform-${nameSuffix}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      disableLocalAuth: true
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: 'frti-env-${nameSuffix}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'platform-logs'
  scope: environment
  properties: {
    workspaceId: logs.id
    logAnalyticsDestinationType: 'Dedicated'
    logs: [
      {
        category: 'ContainerAppConsoleLogs'
        enabled: true
      }
      {
        category: 'ContainerAppSystemLogs'
        enabled: true
      }
    ]
  }
}

resource collector 'Microsoft.App/containerApps@2025-07-01' = {
  name: collectorName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${collectorIdentityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 4318
        transport: 'http'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'collector'
          image: collectorImage
          args: [
            '--config=env:OTEL_CONFIG'
          ]
          env: [
            {
              name: 'OTEL_CONFIG'
              value: loadTextContent('../../collector/cloud.yaml')
            }
            {
              name: 'KUSTO_CLUSTER_URI'
              value: kustoClusterUri
            }
            {
              name: 'KUSTO_DATABASE'
              value: kustoDatabase
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: collectorIdentityClientId
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            for probeType in ['Startup', 'Readiness', 'Liveness']: {
              type: probeType
              httpGet: {
                path: '/'
                port: 13133
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

resource demoJob 'Microsoft.App/jobs@2025-07-01' = {
  name: 'frti-synthetic-${nameSuffix}'
  location: location
  tags: tags
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      containers: [
        {
          name: 'synthetic-telemetry'
          image: emitterImage
          command: [
            'python3'
            '-c'
            loadTextContent('../../demo/emit.py')
          ]
          args: [
            '--endpoint'
            'https://${collector.properties.configuration.ingress.fqdn}'
            '--count'
            '60'
            '--interval'
            '1'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output collectorAppName string = collector.name
output collectorInternalEndpoint string = 'https://${collector.properties.configuration.ingress.fqdn}'
output demoJobName string = demoJob.name
output platformLogAnalyticsWorkspaceId string = logs.id
