targetScope = 'resourceGroup'

@description('Azure region of the existing Log Analytics workspace and the Application Insights resource.')
param location string = resourceGroup().location

@description('ARM resource ID of an existing Log Analytics workspace in the selected region.')
@minLength(1)
param logAnalyticsWorkspaceId string

@description('Application Insights resource dedicated to browser telemetry.')
param applicationInsightsName string = 'frti-rum-${uniqueString(resourceGroup().id)}'

@description('Globally unique Event Hubs namespace dedicated to browser telemetry.')
@minLength(6)
@maxLength(50)
param namespaceName string = 'frti-rum-${uniqueString(resourceGroup().id)}'

@description('Event hub receiving the selected Application Insights diagnostic categories.')
param eventHubName string = 'browser-rum'

@description('Provisioned Standard namespace throughput units. Size for peak ingress and egress.')
@minValue(1)
@maxValue(40)
param eventHubsThroughputUnits int = 1

@description('Event hub partitions. Standard-tier partition counts cannot be changed after creation.')
@minValue(1)
@maxValue(32)
param eventHubPartitionCount int = 2

@description('Dedicated Eventhouse consumer group.')
param consumerGroupName string = 'fabric-rum'

param tags object = {
  project: 'fabric-rti-monitoring'
  purpose: 'browser-rum'
  'managed-by': 'bicep'
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspaceId
    DisableLocalAuth: false
    publicNetworkAccessForIngestion: 'Enabled'
  }
}

// Diagnostic export and the documented Eventhouse connector require SAS.
// Isolate them from the identity-only OTLP broker in a dedicated namespace.
resource namespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: eventHubsThroughputUnits
  }
  properties: {
    disableLocalAuth: false
    minimumTlsVersion: '1.2'
    isAutoInflateEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
  }
}

resource hub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  parent: namespace
  name: eventHubName
  properties: {
    partitionCount: eventHubPartitionCount
    messageRetentionInDays: 1
    status: 'Active'
  }
}

resource fabricConsumer 'Microsoft.EventHub/namespaces/eventhubs/consumerGroups@2024-01-01' = {
  parent: hub
  name: consumerGroupName
  properties: {
    userMetadata: 'Dedicated consumer group for Fabric Eventhouse RUM ingestion.'
  }
}

resource monitorExportPolicy 'Microsoft.EventHub/namespaces/authorizationRules@2024-01-01' = {
  parent: namespace
  name: 'rum-monitor-export'
  properties: {
    rights: [
      'Listen'
      'Send'
      'Manage'
    ]
  }
}

resource fabricPolicy 'Microsoft.EventHub/namespaces/eventhubs/authorizationRules@2024-01-01' = {
  parent: hub
  name: 'rum-fabric-connection'
  properties: {
    rights: [
      'Listen'
      'Send'
      'Manage'
    ]
  }
}

resource export 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'browser-rum-to-event-hubs'
  scope: appInsights
  properties: {
    eventHubAuthorizationRuleId: monitorExportPolicy.id
    eventHubName: hub.name
    logs: [
      {
        category: 'AppPageViews'
        enabled: true
      }
      {
        category: 'AppBrowserTimings'
        enabled: true
      }
      {
        category: 'AppEvents'
        enabled: true
      }
      {
        category: 'AppExceptions'
        enabled: true
      }
      {
        category: 'AppDependencies'
        enabled: true
      }
    ]
  }
}

output applicationInsightsResourceName string = appInsights.name
output eventHubNamespaceName string = namespace.name
output eventHubName string = hub.name
output consumerGroupName string = fabricConsumer.name
output fabricPolicyName string = fabricPolicy.name
