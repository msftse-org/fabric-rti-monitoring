// Standalone broker foundation for the optional buffered architecture.
// Not referenced by infra/main.bicep. Does not configure a collector exporter,
// Fabric connection/Eventstream, bronze tables, transformations or replay.
targetScope = 'resourceGroup'

param location string = resourceGroup().location

@description('Globally unique Event Hubs namespace name.')
@minLength(6)
@maxLength(50)
param namespaceName string = 'frti-eh-${uniqueString(resourceGroup().id)}'

@description('Event hub name; the Kafka topic name is the same value.')
@minLength(1)
@maxLength(256)
param eventHubName string = 'otel-telemetry'

@description('Existing collector managed identity PRINCIPAL OBJECT ID. Do not supply its application/client ID.')
@minLength(36)
@maxLength(36)
param collectorPrincipalId string

@description('Existing Fabric workspace identity PRINCIPAL OBJECT ID. Create the workspace identity in Fabric before deploying this template.')
@minLength(36)
@maxLength(36)
param fabricWorkspaceIdentityPrincipalId string

param tags object = {
  project: 'fabric-rti-monitoring'
  purpose: 'optional-telemetry-buffer'
  'managed-by': 'bicep'
}

// Two partitions, one throughput unit and one day are teaching defaults, not a
// capacity or recovery guarantee. Size the broker against measured demand.
resource namespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    disableLocalAuth: true
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
    partitionCount: 2
    messageRetentionInDays: 1
    status: 'Active'
  }
}

resource consumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumerGroups@2024-01-01' = {
  parent: hub
  name: 'fabric'
  properties: {
    userMetadata: 'Dedicated consumer group for the optional Fabric Eventstream.'
  }
}

var senderRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2b629674-e913-4c01-ae53-ef4638d8f975')
var receiverRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a638d3c7-ab3a-418d-83e6-5f17a39d4fde')

resource collectorSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(hub.id, collectorPrincipalId, senderRoleId)
  scope: hub
  properties: {
    principalId: collectorPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: senderRoleId
  }
}

resource fabricReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(hub.id, fabricWorkspaceIdentityPrincipalId, receiverRoleId)
  scope: hub
  properties: {
    principalId: fabricWorkspaceIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: receiverRoleId
  }
}

output namespaceResourceId string = namespace.id
output namespaceResourceName string = namespace.name
output eventHubResourceId string = hub.id
output eventHubResourceName string = hub.name
output consumerGroupName string = consumerGroup.name
output fullyQualifiedNamespace string = '${namespace.name}.servicebus.windows.net'
output kafkaBootstrapServer string = '${namespace.name}.servicebus.windows.net:9093'
output eventHubEndpoint string = 'sb://${namespace.name}.servicebus.windows.net/'
