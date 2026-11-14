output "consumer_group_name" {
  description = "Dedicated consumer group name for a separately configured Fabric Eventstream."
  value       = azurerm_eventhub_consumer_group.fabric.name
}

output "event_hub_endpoint" {
  description = "Optional broker namespace endpoint."
  value       = "sb://${azurerm_eventhub_namespace.telemetry.name}.servicebus.windows.net/"
}

output "event_hub_resource_id" {
  description = "Event hub ARM ID."
  value       = azurerm_eventhub.telemetry.id
}

output "event_hub_resource_name" {
  description = "Event hub name, also used as the Kafka topic."
  value       = azurerm_eventhub.telemetry.name
}

output "fully_qualified_namespace" {
  description = "Event Hubs namespace hostname."
  value       = "${azurerm_eventhub_namespace.telemetry.name}.servicebus.windows.net"
}

output "kafka_bootstrap_server" {
  description = "Kafka-compatible bootstrap hostname and TLS port."
  value       = "${azurerm_eventhub_namespace.telemetry.name}.servicebus.windows.net:9093"
}

output "namespace_resource_id" {
  description = "Event Hubs namespace ARM ID."
  value       = azurerm_eventhub_namespace.telemetry.id
}

output "namespace_resource_name" {
  description = "Event Hubs namespace name."
  value       = azurerm_eventhub_namespace.telemetry.name
}
