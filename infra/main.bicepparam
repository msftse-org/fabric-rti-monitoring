using './main.bicep'

// Safe defaults: no paid resources. Opt in deliberately before deploying.
param deployFabricCapacity = false
param deployManagedGrafana = false
param deployCollector = false

// After Fabric bootstrap and database ingestor grant to collectorIdentityClientId:
// param deployCollector = true
// param kustoClusterUri = 'https://<query-service-host>.kusto.fabric.microsoft.com'
// param kustoDatabase = 'Observability'

// Required when deployFabricCapacity = true:
// param fabricCapacityAdministrators = ['capacity-admin@example.com']

// Required for immediate access when deployManagedGrafana = true:
// param grafanaAdminPrincipalId = '<Microsoft Entra object ID>'
// param grafanaAdminPrincipalType = 'User'
